const express = require('express');
const router = express.Router();
const https = require('https');
const { db } = require('../db/database');
const { authenticateToken, requireAdmin, logAudit } = require('../middleware/auth');

// Default state to zone mapping fallback
const STATE_ZONE_MAP = {
  'Delhi': 'North',
  'Haryana': 'North',
  'Punjab': 'North',
  'Uttar Pradesh': 'North',
  'Uttarakhand': 'North',
  'Himachal Pradesh': 'North',
  'Jammu and Kashmir': 'North',
  'Rajasthan': 'North',
  'Chandigarh': 'North',
  'Maharashtra': 'West',
  'Gujarat': 'West',
  'Goa': 'West',
  'Madhya Pradesh': 'West',
  'Dadra and Nagar Haveli': 'West',
  'Daman and Diu': 'West',
  'Telangana': 'South',
  'Andhra Pradesh': 'South',
  'Karnataka': 'South',
  'Tamil Nadu': 'South',
  'Kerala': 'South',
  'Puducherry': 'South',
  'West Bengal': 'East',
  'Bihar': 'East',
  'Jharkhand': 'East',
  'Odisha': 'East',
  'Assam': 'East',
  'Sikkim': 'East',
  'Tripura': 'East',
  'Meghalaya': 'East',
  'Manipur': 'East',
  'Mizoram': 'East',
  'Nagaland': 'East',
  'Arunachal Pradesh': 'East',
  'Chhattisgarh': 'East'
};

function resolveZone(state, district, pin) {
  // Check custom region mapping in DB
  const prefix = pin ? pin.substring(0, 2) : '';
  const custom = db.prepare(`
    SELECT assigned_zone FROM region_mappings 
    WHERE (state = ? AND (district = ? OR district IS NULL))
       OR (pin_prefix = ?)
    ORDER BY district DESC LIMIT 1
  `).get(state, district, prefix);

  if (custom && custom.assigned_zone) {
    return custom.assigned_zone;
  }

  // Fallback to state mapping
  return STATE_ZONE_MAP[state] || 'West';
}

function fetchPostalApi(pincode) {
  return new Promise((resolve, reject) => {
    const url = `https://api.postalpincode.in/pincode/${pincode}`;
    const req = https.get(url, { timeout: 4000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', err => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Postal API lookup timed out'));
    });
  });
}

// GET /api/pincode/:pincode
router.get('/:pincode', authenticateToken, async (req, res) => {
  const { pincode } = req.params;

  if (!pincode || !/^\d{6}$/.test(pincode)) {
    return res.status(400).json({ error: 'Please enter a valid 6-digit Indian PIN code' });
  }

  // 1. Check local SQLite cache first (vital for offline operation)
  const cached = db.prepare('SELECT * FROM pin_code_cache WHERE pin_code = ?').get(pincode);
  if (cached) {
    return res.json({
      source: 'local_cache',
      city: cached.city,
      state: cached.state,
      district: cached.district,
      zone: cached.zone
    });
  }

  // 2. Fetch from Postal Pincode API if online
  try {
    const apiRes = await fetchPostalApi(pincode);
    if (Array.isArray(apiRes) && apiRes[0] && apiRes[0].Status === 'Success' && apiRes[0].PostOffice && apiRes[0].PostOffice.length > 0) {
      const po = apiRes[0].PostOffice[0];
      const city = po.District || po.Name || '';
      const state = po.State || '';
      const district = po.District || '';
      const zone = resolveZone(state, district, pincode);

      // Save to local SQLite cache
      db.prepare(`
        INSERT OR REPLACE INTO pin_code_cache (pin_code, city, state, district, zone, cached_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(pincode, city, state, district, zone, new Date().toISOString());

      // Provide list of post offices in case of multiple localities
      const localities = apiRes[0].PostOffice.map(p => p.Name);

      return res.json({
        source: 'online_api',
        city,
        state,
        district,
        zone,
        localities
      });
    } else {
      return res.status(404).json({ error: 'PIN code not found in postal directory. You may enter address details manually.' });
    }
  } catch (err) {
    console.warn(`PIN lookup failed for ${pincode}:`, err.message);
    return res.status(503).json({
      error: 'PIN code lookup service unavailable. You can enter the state and city manually.',
      offline: true
    });
  }
});

// GET /api/pincode/mappings/list
router.get('/mappings/list', authenticateToken, requireAdmin, (req, res) => {
  const mappings = db.prepare('SELECT * FROM region_mappings ORDER BY state ASC').all();
  res.json({ mappings });
});

// POST /api/pincode/mappings
router.post('/mappings', authenticateToken, requireAdmin, (req, res) => {
  const { state, district, pin_prefix, assigned_zone } = req.body;

  if (!state || !assigned_zone) {
    return res.status(400).json({ error: 'State and assigned zone are required' });
  }

  const id = 'rm_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  db.prepare(`
    INSERT INTO region_mappings (id, state, district, pin_prefix, assigned_zone, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, state, district || null, pin_prefix || null, assigned_zone, new Date().toISOString());

  logAudit(req.user.id, 'CREATE_REGION_MAPPING', 'region_mappings', id, `Configured region mapping: ${state} -> ${assigned_zone}`, req);

  const mappings = db.prepare('SELECT * FROM region_mappings ORDER BY state ASC').all();
  res.status(201).json({ mappings, message: 'Region mapping saved' });
});

module.exports = router;
