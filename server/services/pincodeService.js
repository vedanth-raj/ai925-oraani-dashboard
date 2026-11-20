const https = require('https');
const { db } = require('../db/database');

// Fast offline prefix table for instant Indian state detection
const PIN_PREFIX_STATE = {
  '11': 'Delhi',
  '12': 'Haryana', '13': 'Haryana',
  '14': 'Punjab', '15': 'Punjab',
  '16': 'Chandigarh',
  '17': 'Himachal Pradesh',
  '18': 'Jammu and Kashmir', '19': 'Jammu and Kashmir',
  '20': 'Uttar Pradesh', '21': 'Uttar Pradesh', '22': 'Uttar Pradesh', '23': 'Uttar Pradesh',
  '24': 'Uttar Pradesh', '25': 'Uttar Pradesh', '26': 'Uttar Pradesh', '27': 'Uttar Pradesh', '28': 'Uttar Pradesh',
  '30': 'Rajasthan', '31': 'Rajasthan', '32': 'Rajasthan', '33': 'Rajasthan', '34': 'Rajasthan',
  '36': 'Gujarat', '37': 'Gujarat', '38': 'Gujarat', '39': 'Gujarat',
  '40': 'Maharashtra', '41': 'Maharashtra', '42': 'Maharashtra', '43': 'Maharashtra', '44': 'Maharashtra',
  '45': 'Madhya Pradesh', '46': 'Madhya Pradesh', '47': 'Madhya Pradesh', '48': 'Madhya Pradesh',
  '49': 'Chhattisgarh',
  '50': 'Telangana', '51': 'Andhra Pradesh', '52': 'Andhra Pradesh', '53': 'Andhra Pradesh',
  '56': 'Karnataka', '57': 'Karnataka', '58': 'Karnataka', '59': 'Karnataka',
  '60': 'Tamil Nadu', '61': 'Tamil Nadu', '62': 'Tamil Nadu', '63': 'Tamil Nadu', '64': 'Tamil Nadu',
  '67': 'Kerala', '68': 'Kerala', '69': 'Kerala',
  '70': 'West Bengal', '71': 'West Bengal', '72': 'West Bengal', '73': 'West Bengal', '74': 'West Bengal',
  '75': 'Odisha', '76': 'Odisha', '77': 'Odisha',
  '78': 'Assam',
  '79': 'Meghalaya',
  '80': 'Bihar', '81': 'Bihar', '82': 'Jharkhand', '83': 'Jharkhand', '84': 'Bihar', '85': 'Bihar'
};

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

async function lookupPincode(pincode) {
  const pin = String(pincode || '').replace(/\D/g, '').slice(0, 6);
  if (pin.length !== 6) return null;

  // 1. Check SQLite local cache
  try {
    const cached = db.prepare('SELECT city, state, district FROM pin_code_cache WHERE pin_code = ?').get(pin);
    if (cached && cached.state) {
      return { city: cached.city, state: cached.state, district: cached.district, source: 'cache' };
    }
  } catch {}

  // 2. High-priority prefix detection (e.g. 403xxx is Goa)
  let fallbackState = null;
  if (pin.startsWith('403')) {
    fallbackState = 'Goa';
  } else {
    const p2 = pin.slice(0, 2);
    fallbackState = PIN_PREFIX_STATE[p2] || null;
  }

  // 3. Query online India Post API
  try {
    const apiRes = await fetchPostalApi(pin);
    if (Array.isArray(apiRes) && apiRes[0] && apiRes[0].Status === 'Success' && apiRes[0].PostOffice && apiRes[0].PostOffice.length > 0) {
      const po = apiRes[0].PostOffice[0];
      const city = po.District || po.Name || '';
      const state = po.State || fallbackState || '';
      const district = po.District || '';

      try {
        db.prepare(`
          INSERT OR REPLACE INTO pin_code_cache (pin_code, city, state, district, zone, cached_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(pin, city, state, district, 'West', new Date().toISOString());
      } catch {}

      return { city, state, district, source: 'online_api' };
    }
  } catch (e) {}

  if (fallbackState) {
    return { city: '', state: fallbackState, district: '', source: 'prefix_fallback' };
  }

  return null;
}

module.exports = {
  lookupPincode,
  PIN_PREFIX_STATE
};
