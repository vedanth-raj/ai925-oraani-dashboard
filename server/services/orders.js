const { db } = require('../db/database');
const {
  round2,
  getCurrentSilverRate,
  getVariants,
  getTiers,
  getWeightOptions,
  unitWeightFor,
  makingFor,
  priceBreakdown,
  getWeightSlabDiscount
} = require('../utils/pricing');

// Helper to generate next readable order number like #7095. Follows the highest numeric order number, so
// imported orders numbered any other way never make the next number collide.
function getNextOrderNumber() {
  const last = db.prepare(`
    SELECT order_number FROM orders
    WHERE order_number GLOB '#[0-9]*' AND SUBSTR(order_number, 2) NOT GLOB '*[^0-9]*'
    ORDER BY CAST(SUBSTR(order_number, 2) AS INTEGER) DESC LIMIT 1
  `).get();

  if (!last || !last.order_number) {
    return '#1001';
  }

  const numPart = parseInt(last.order_number.replace('#', ''), 10);
  if (isNaN(numPart)) return '#1001';
  return '#' + (numPart + 1);
}

// Turn [{ product_id, sizes: [{ size_inches, pieces, std_weight_g? }] }] into priced order lines.
// Weight per piece is the standard (20-inch) weight scaled to the size; the making charge is that
// weight's base pricing unless a quantity slab for this purchase type matches the product's total
// pieces / grams in the order. A standard weight with its own slabs is priced by the net grams of that weight.
// If statePremiumPct > 0, state-based markup is applied to labour. Weight slab discount applies across total order weight.
function buildPricedItems(products, silverRate, orderType = 'STANDARD', statePremiumPct = 0) {
  const parsedItems = [];
  let totalOrderGrams = 0;

  for (const prodEntry of products) {
    const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(prodEntry.product_id);
    if (!prod) {
      throw new Error(`Product not found: ${prodEntry.product_id}`);
    }
    if (!prodEntry.sizes || !Array.isArray(prodEntry.sizes) || prodEntry.sizes.length === 0) {
      throw new Error(`At least one size row is required for product ${prod.name}`);
    }

    const variants = getVariants(prod.id);
    const tiers = getTiers(prod.id);
    const weightOptions = getWeightOptions(prod.id);
    const rows = prodEntry.sizes
      .map(r => {
        const sizeInches = parseFloat(r.size_inches) || 20.0;
        const std = parseFloat(r.std_weight_g) > 0 ? parseFloat(r.std_weight_g) : null;
        return {
          sizeInches,
          std,
          pieces: parseInt(r.pieces, 10) || 0,
          unitWeight: unitWeightFor(prod, variants, sizeInches, std)
        };
      })
      .filter(r => r.pieces > 0);
    const productPieces = rows.reduce((s, r) => s + r.pieces, 0);
    const productGrams = rows.reduce((s, r) => s + r.unitWeight * r.pieces, 0);
    const gramsOfStd = std => rows.filter(x => (x.std === null ? std === null : std !== null && Math.abs(x.std - std) < 0.001))
      .reduce((s, x) => s + x.unitWeight * x.pieces, 0);

    for (const r of rows) {
      const expWeight = r.unitWeight * r.pieces;
      totalOrderGrams += expWeight;
      parsedItems.push({
        prod,
        tiers,
        weightOptions,
        r,
        expWeight,
        productPieces,
        productGrams,
        gramsOfStd: gramsOfStd(r.std)
      });
    }
  }

  // Weight-based slab discount for total order weight
  const slabResult = getWeightSlabDiscount(totalOrderGrams);
  const slabDiscountPerGram = slabResult.discount_per_gram || 0;

  const lines = [];
  for (const item of parsedItems) {
    const { labour_per_gram } = makingFor({
      product: item.prod,
      tiers: item.tiers,
      weightOptions: item.weightOptions,
      stdWeight: item.r.std,
      mode: orderType,
      pieces: item.productPieces,
      grams: item.productGrams,
      stdGrams: item.gramsOfStd,
      statePremiumPct
    });

    lines.push({
      product: item.prod,
      size_inches: item.r.sizeInches,
      std_weight_g: item.r.std,
      requested_pieces: item.r.pieces,
      unit_weight: round2(item.r.unitWeight * 1000) / 1000,
      expected_weight: parseFloat(item.expWeight.toFixed(2)),
      labour_per_gram,
      slab_discount_per_gram: slabDiscountPerGram,
      price: priceBreakdown(item.expWeight, silverRate, labour_per_gram, 0, slabDiscountPerGram)
    });
  }

  return lines;
}

function sumPricing(lines) {
  const totals = { silver_amount: 0, labour_amount: 0, gst_amount: 0, total_amount: 0 };
  for (const l of lines) {
    totals.silver_amount += l.price.silver_amount;
    totals.labour_amount += l.price.labour_amount;
    totals.gst_amount += l.price.gst_amount;
    totals.total_amount += l.price.total;
  }
  for (const k of Object.keys(totals)) totals[k] = round2(totals[k]);
  return totals;
}

function newId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
}

// Inserts order + items and reserves available stock. Must be called inside a transaction.
function insertOrder({ customer, creatorId, salesRepId, lines, advanceAmount = 0, specialNotes = '', orderType = 'STANDARD', customerAccountId = null, silverRate, movementUserId, deliveryCharge = 0, brand = null }) {
  if (lines.length === 0) {
    throw new Error('Please add at least one valid size with pieces > 0');
  }

  const orderId = newId('ord');
  const orderNumber = getNextOrderNumber();
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const orderBrand = String(brand || (customer && customer.brand) || 'AI925').toUpperCase() === 'ORAANI' ? 'ORAANI' : 'AI925';

  let totalPieces = 0;
  let totalExpectedWeight = 0.0;
  const allocations = [];
  const reservedSoFar = {};

  const itemRows = lines.map(line => {
    const prod = line.product;
    const alreadyReserved = reservedSoFar[prod.id] || 0;
    const availableStock = Math.max(0, prod.physical_stock - prod.reserved_stock - alreadyReserved);
    const allocatedPcs = Math.min(line.requested_pieces, availableStock);
    if (allocatedPcs > 0) {
      allocations.push({ productId: prod.id, allocatedPcs });
      reservedSoFar[prod.id] = alreadyReserved + allocatedPcs;
    }
    totalPieces += line.requested_pieces;
    totalExpectedWeight += line.expected_weight;
    return {
      id: newId('item'),
      product_id: prod.id,
      size_inches: line.size_inches,
      std_weight_g: line.std_weight_g,
      requested_pieces: line.requested_pieces,
      allocated_pieces: allocatedPcs,
      expected_weight: line.expected_weight,
      unit_weight: line.unit_weight,
      labour_per_gram: line.labour_per_gram,
      line_amount: line.price.total
    };
  });

  const totals = sumPricing(lines);
  totals.delivery_charge = round2(deliveryCharge);
  totals.total_amount = round2(totals.total_amount + totals.delivery_charge);

  // Insert Order first to satisfy foreign key constraints
  db.prepare(`
    INSERT INTO orders (
      id, order_number, customer_id, creator_id, sales_rep_id, status,
      operational_status, advance_amount, special_notes, total_pieces,
      expected_weight, delivered_pieces, delivered_weight, order_date,
      created_at, updated_at, order_type, customer_account_id, silver_rate,
      silver_amount, labour_amount, gst_amount, total_amount, payment_status, paid_amount, delivery_charge, brand
    ) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, 0, 0.0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNPAID', 0, ?, ?)
  `).run(
    orderId,
    orderNumber,
    customer.id,
    creatorId,
    salesRepId,
    orderType === 'ON_ORDER' ? 'On-order request: awaiting System Administrator' : 'Awaiting stock allocation',
    parseFloat(advanceAmount) || 0.0,
    specialNotes || '',
    totalPieces,
    parseFloat(totalExpectedWeight.toFixed(2)),
    today,
    now,
    now,
    orderType,
    customerAccountId,
    silverRate,
    totals.silver_amount,
    totals.labour_amount,
    totals.gst_amount,
    totals.total_amount,
    totals.delivery_charge,
    orderBrand
  );

  // Apply inventory reservations now that order exists
  for (const alloc of allocations) {
    db.prepare('UPDATE products SET reserved_stock = reserved_stock + ? WHERE id = ?').run(alloc.allocatedPcs, alloc.productId);
    db.prepare(`
      INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reason, related_order_id, user_id, created_at)
      VALUES (?, ?, ?, 'ALLOCATION', ?, ?, ?, ?)
    `).run(
      'mov_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      alloc.productId,
      alloc.allocatedPcs,
      `Allocated for order ${orderNumber}`,
      orderId,
      movementUserId,
      now
    );
  }

  const insertItemStmt = db.prepare(`
    INSERT INTO order_items (
      id, order_id, product_id, size_inches, requested_pieces,
      allocated_pieces, delivered_pieces, expected_weight, delivered_weight, created_at,
      unit_weight, labour_per_gram, line_amount, std_weight_g
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0.0, ?, ?, ?, ?, ?)
  `);
  for (const item of itemRows) {
    insertItemStmt.run(
      item.id, orderId, item.product_id, item.size_inches, item.requested_pieces,
      item.allocated_pieces, item.expected_weight, now,
      item.unit_weight, item.labour_per_gram, item.line_amount, item.std_weight_g
    );
  }

  return { orderId, orderNumber, totals };
}

// Ready Stock portal orders take pieces out of ready stock (standard weight × size) at checkout; when such
// an order is closed early or deleted, the undelivered pieces go back on the shelf. Call inside a transaction.
function restoreReadyStock(order, items) {
  if (order.order_type !== 'READY_STOCK') return;
  const now = new Date().toISOString();
  for (const item of items) {
    const undelivered = Math.max(0, item.requested_pieces - item.delivered_pieces);
    if (undelivered > 0) {
      // Older items have no standard weight: return them to the first row of that size
      db.prepare(`
        UPDATE product_variants SET stock_qty = stock_qty + ?, updated_at = ?
        WHERE id = (
          SELECT id FROM product_variants
          WHERE product_id = ? AND ABS(size_inches - ?) < 0.001 AND (? IS NULL OR ABS(std_weight_g - ?) < 0.001)
          ORDER BY std_weight_g ASC LIMIT 1
        )
      `).run(undelivered, now, item.product_id, item.size_inches, item.std_weight_g ?? null, item.std_weight_g ?? null);
    }
  }
}

function currentRateOrZero() {
  const rate = getCurrentSilverRate().rate_per_gram;
  return rate === null ? 0 : rate;
}

module.exports = {
  getNextOrderNumber,
  buildPricedItems,
  sumPricing,
  insertOrder,
  restoreReadyStock,
  currentRateOrZero
};
