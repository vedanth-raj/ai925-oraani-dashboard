const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// GET /api/analytics/overview (Interactive Stats: Daily, Weekly, Monthly, Yearly + Region/State/City filters + Salesperson breakdown)
router.get('/overview', authenticateToken, (req, res) => {
  const { timeframe = 'monthly', zone, state, city } = req.query;
  const isRep = req.user.role === 'SALES_REP';

  let whereClauses = [];
  let params = [];

  if (isRep) {
    whereClauses.push('(o.creator_id = ? OR o.sales_rep_id = ?)');
    params.push(req.user.id, req.user.id);
  }

  if (zone && zone !== 'All') {
    whereClauses.push('c.zone = ?');
    params.push(zone);
  }

  if (state && state !== 'All') {
    whereClauses.push('c.state = ?');
    params.push(state);
  }

  if (city && city !== 'All') {
    whereClauses.push('c.city = ?');
    params.push(city);
  }

  const whereSql = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '';

  // 1. Overall KPIs
  const kpis = db.prepare(`
    SELECT 
      COUNT(o.id) as total_orders,
      COALESCE(SUM(o.total_pieces), 0) as total_pieces,
      COALESCE(SUM(o.expected_weight), 0.0) as expected_weight,
      COALESCE(SUM(o.delivered_weight), 0.0) as delivered_weight,
      COALESCE(SUM(CASE WHEN o.status = 'OPEN' THEN 1 ELSE 0 END), 0) as open_orders,
      COALESCE(SUM(CASE WHEN o.status = 'IN_PROGRESS' THEN 1 ELSE 0 END), 0) as in_progress_orders,
      COALESCE(SUM(CASE WHEN o.status = 'CLOSED' THEN 1 ELSE 0 END), 0) as closed_orders
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    ${whereSql}
  `).get(...params);

  const remainingEstWeight = Math.max(0, (kpis.expected_weight || 0) - (kpis.delivered_weight || 0));

  // Color palette for sales reps in stacked bars
  const REP_COLORS = [
    '#4A72B2', '#B84A62', '#2B9E78', '#7E57C2', '#D97732',
    '#00897B', '#E53935', '#3949AB', '#8E24AA', '#F57C00'
  ];

  // Distinct active sales reps list for legend & consistency
  const allSalesReps = db.prepare(`
    SELECT id, full_name, username FROM users WHERE role = 'SALES_REP' AND is_active = 1 ORDER BY full_name ASC
  `).all();
  const repColorMap = {};
  allSalesReps.forEach((r, idx) => {
    repColorMap[r.id] = REP_COLORS[idx % REP_COLORS.length];
  });
  repColorMap['direct'] = '#766B60';

  // 2. Interactive Timeframe Graph with Salesperson-wise pieces parts
  let bars = [];
  const now = new Date();
  const currentYear = now.getFullYear().toString();

  if (timeframe === 'daily') {
    // Last 14 days
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const dayOrders = db.prepare(`
        SELECT 
          o.id,
          o.total_pieces,
          o.expected_weight,
          COALESCE(o.sales_rep_id, o.creator_id) as rep_id,
          COALESCE(sr.full_name, u.full_name, 'Direct') as rep_name
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        LEFT JOIN users sr ON o.sales_rep_id = sr.id
        JOIN users u ON o.creator_id = u.id
        ${whereSql ? whereSql + ' AND' : 'WHERE'} strftime('%Y-%m-%d', o.order_date) = ?
      `).all(...params, dateStr);

      const partsMap = {};
      let totalPieces = 0;
      let totalWeight = 0;
      for (const ord of dayOrders) {
        const repKey = ord.rep_id || 'direct';
        if (!partsMap[repKey]) {
          partsMap[repKey] = {
            rep_id: repKey,
            rep_name: ord.rep_name,
            pieces: 0,
            weight: 0,
            color: repColorMap[repKey] || '#6B5744'
          };
        }
        partsMap[repKey].pieces += ord.total_pieces || 0;
        partsMap[repKey].weight += ord.expected_weight || 0;
        totalPieces += ord.total_pieces || 0;
        totalWeight += ord.expected_weight || 0;
      }

      bars.push({
        label: dayLabel,
        key: dateStr,
        total_pieces: totalPieces,
        ordered_weight: totalWeight,
        order_count: dayOrders.length,
        parts: Object.values(partsMap)
      });
    }
  } else if (timeframe === 'weekly') {
    // Last 8 weeks
    for (let w = 7; w >= 0; w--) {
      const startD = new Date();
      startD.setDate(startD.getDate() - (w * 7 + 6));
      const endD = new Date();
      endD.setDate(endD.getDate() - (w * 7));
      const startStr = startD.toISOString().split('T')[0];
      const endStr = endD.toISOString().split('T')[0];
      const label = `${startD.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

      const weekOrders = db.prepare(`
        SELECT 
          o.id,
          o.total_pieces,
          o.expected_weight,
          COALESCE(o.sales_rep_id, o.creator_id) as rep_id,
          COALESCE(sr.full_name, u.full_name, 'Direct') as rep_name
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        LEFT JOIN users sr ON o.sales_rep_id = sr.id
        JOIN users u ON o.creator_id = u.id
        ${whereSql ? whereSql + ' AND' : 'WHERE'} o.order_date >= ? AND o.order_date <= ?
      `).all(...params, startStr, endStr + 'T23:59:59');

      const partsMap = {};
      let totalPieces = 0;
      let totalWeight = 0;
      for (const ord of weekOrders) {
        const repKey = ord.rep_id || 'direct';
        if (!partsMap[repKey]) {
          partsMap[repKey] = {
            rep_id: repKey,
            rep_name: ord.rep_name,
            pieces: 0,
            weight: 0,
            color: repColorMap[repKey] || '#6B5744'
          };
        }
        partsMap[repKey].pieces += ord.total_pieces || 0;
        partsMap[repKey].weight += ord.expected_weight || 0;
        totalPieces += ord.total_pieces || 0;
        totalWeight += ord.expected_weight || 0;
      }

      bars.push({
        label,
        key: `W${w}`,
        total_pieces: totalPieces,
        ordered_weight: totalWeight,
        order_count: weekOrders.length,
        parts: Object.values(partsMap)
      });
    }
  } else if (timeframe === 'yearly') {
    // Last 5 years
    const thisYearNum = parseInt(currentYear, 10);
    for (let y = thisYearNum - 4; y <= thisYearNum; y++) {
      const yStr = String(y);
      const yearOrders = db.prepare(`
        SELECT 
          o.id,
          o.total_pieces,
          o.expected_weight,
          COALESCE(o.sales_rep_id, o.creator_id) as rep_id,
          COALESCE(sr.full_name, u.full_name, 'Direct') as rep_name
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        LEFT JOIN users sr ON o.sales_rep_id = sr.id
        JOIN users u ON o.creator_id = u.id
        ${whereSql ? whereSql + ' AND' : 'WHERE'} strftime('%Y', o.order_date) = ?
      `).all(...params, yStr);

      const partsMap = {};
      let totalPieces = 0;
      let totalWeight = 0;
      for (const ord of yearOrders) {
        const repKey = ord.rep_id || 'direct';
        if (!partsMap[repKey]) {
          partsMap[repKey] = {
            rep_id: repKey,
            rep_name: ord.rep_name,
            pieces: 0,
            weight: 0,
            color: repColorMap[repKey] || '#6B5744'
          };
        }
        partsMap[repKey].pieces += ord.total_pieces || 0;
        partsMap[repKey].weight += ord.expected_weight || 0;
        totalPieces += ord.total_pieces || 0;
        totalWeight += ord.expected_weight || 0;
      }

      bars.push({
        label: yStr,
        key: yStr,
        total_pieces: totalPieces,
        ordered_weight: totalWeight,
        order_count: yearOrders.length,
        parts: Object.values(partsMap)
      });
    }
  } else {
    // Default: monthly for current year (12 months J-D)
    const monthLetters = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let idx = 0; idx < 12; idx++) {
      const mStr = String(idx + 1).padStart(2, '0');
      const monthOrders = db.prepare(`
        SELECT 
          o.id,
          o.total_pieces,
          o.expected_weight,
          COALESCE(o.sales_rep_id, o.creator_id) as rep_id,
          COALESCE(sr.full_name, u.full_name, 'Direct') as rep_name
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        LEFT JOIN users sr ON o.sales_rep_id = sr.id
        JOIN users u ON o.creator_id = u.id
        ${whereSql ? whereSql + ' AND' : 'WHERE'} strftime('%Y', o.order_date) = ? AND strftime('%m', o.order_date) = ?
      `).all(...params, currentYear, mStr);

      const partsMap = {};
      let totalPieces = 0;
      let totalWeight = 0;
      for (const ord of monthOrders) {
        const repKey = ord.rep_id || 'direct';
        if (!partsMap[repKey]) {
          partsMap[repKey] = {
            rep_id: repKey,
            rep_name: ord.rep_name,
            pieces: 0,
            weight: 0,
            color: repColorMap[repKey] || '#6B5744'
          };
        }
        partsMap[repKey].pieces += ord.total_pieces || 0;
        partsMap[repKey].weight += ord.expected_weight || 0;
        totalPieces += ord.total_pieces || 0;
        totalWeight += ord.expected_weight || 0;
      }

      bars.push({
        month_index: idx + 1,
        month_short: monthLetters[idx],
        month_name: monthNames[idx],
        label: monthNames[idx],
        key: mStr,
        total_pieces: totalPieces,
        ordered_weight: totalWeight,
        order_count: monthOrders.length,
        parts: Object.values(partsMap)
      });
    }
  }

  const maxPieces = Math.max(...bars.map(b => b.total_pieces || 0), 20);
  const maxWeight = Math.max(...bars.map(b => b.ordered_weight || 0), 100);

  // 3. Region Breakdown (North, South, East, West)
  const regionsList = ['North', 'South', 'East', 'West'];
  const regionStats = db.prepare(`
    SELECT 
      c.zone as region,
      COUNT(o.id) as order_count,
      COALESCE(SUM(o.expected_weight), 0.0) as total_weight,
      COALESCE(SUM(o.total_pieces), 0) as total_pieces
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    ${whereSql}
    GROUP BY c.zone
  `).all(...params);

  const regionBreakdown = regionsList.map(reg => {
    const found = regionStats.find(r => r.region === reg);
    return {
      region: reg,
      orders_count: found ? found.order_count : 0,
      total_weight_g: found ? found.total_weight : 0.0,
      total_pieces: found ? found.total_pieces : 0
    };
  });

  // 4. Unique States and Cities for dynamic dashboard filter selectors
  const filterOptions = {
    zones: regionsList,
    states: db.prepare(`
      SELECT DISTINCT state FROM customers WHERE state IS NOT NULL AND state != '' AND is_archived = 0 ORDER BY state ASC
    `).all().map(r => r.state),
    cities: db.prepare(`
      SELECT DISTINCT city, state, zone FROM customers WHERE city IS NOT NULL AND city != '' AND is_archived = 0 ORDER BY city ASC
    `).all()
  };

  // 5. Product-wise Performance
  const productStats = db.prepare(`
    SELECT 
      p.id,
      p.name,
      p.sku,
      COUNT(DISTINCT oi.order_id) as orders_count,
      COALESCE(SUM(oi.requested_pieces), 0) as total_pieces_ordered,
      COALESCE(SUM(oi.delivered_pieces), 0) as total_pieces_delivered,
      COALESCE(SUM(oi.expected_weight), 0.0) as total_expected_weight,
      COALESCE(SUM(oi.delivered_weight), 0.0) as total_delivered_weight
    FROM products p
    JOIN order_items oi ON oi.product_id = p.id
    JOIN orders o ON oi.order_id = o.id
    JOIN customers c ON o.customer_id = c.id
    ${whereSql}
    GROUP BY p.id
    ORDER BY total_expected_weight DESC
  `).all(...params);

  // 6. Sales Reps Comparison (Admin & Business Admin only)
  let salesRepStats = [];
  if (!isRep) {
    salesRepStats = db.prepare(`
      SELECT 
        u.id,
        u.full_name,
        u.employee_code,
        u.assigned_region,
        u.last_latitude,
        u.last_longitude,
        u.last_location_address,
        u.last_location_updated_at,
        COUNT(o.id) as orders_count,
        COALESCE(SUM(o.total_pieces), 0) as total_pieces,
        COALESCE(SUM(o.expected_weight), 0.0) as total_expected_weight,
        COALESCE(SUM(o.delivered_weight), 0.0) as total_delivered_weight,
        COALESCE(SUM(o.expected_weight - o.delivered_weight), 0.0) as total_outstanding_weight
      FROM users u
      LEFT JOIN orders o ON (o.sales_rep_id = u.id OR o.creator_id = u.id)
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE u.role = 'SALES_REP' AND u.is_active = 1
      GROUP BY u.id
      ORDER BY total_expected_weight DESC
    `).all();
  }

  res.json({
    kpis: {
      total_orders: kpis.total_orders || 0,
      total_pieces: kpis.total_pieces || 0,
      expected_weight: kpis.expected_weight || 0.0,
      delivered_weight: kpis.delivered_weight || 0.0,
      remaining_est_weight: remainingEstWeight,
      open_orders: kpis.open_orders || 0,
      in_progress_orders: kpis.in_progress_orders || 0,
      closed_orders: kpis.closed_orders || 0
    },
    timeframe,
    chart: {
      timeframe,
      bars,
      max_pieces: maxPieces,
      max_weight: maxWeight,
      reps: allSalesReps.map(r => ({ id: r.id, name: r.full_name, color: repColorMap[r.id] }))
    },
    // Backwards compatibility for tests expecting monthly.bars
    monthly: {
      year: currentYear,
      bars: bars,
      max_weight: maxWeight
    },
    region_breakdown: regionBreakdown,
    filter_options: filterOptions,
    product_stats: productStats,
    sales_rep_stats: salesRepStats
  });
});

module.exports = router;
