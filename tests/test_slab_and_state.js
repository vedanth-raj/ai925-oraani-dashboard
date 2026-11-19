const { db } = require('../server/db/database');
const { getWeightSlabDiscount, getAllWeightSlabDiscounts, getStatePremium, priceBreakdown, round2 } = require('../server/utils/pricing');
const { deliveryChargeFor } = require('../server/services/commerce');

console.log('=== RUNNING TESTS FOR SLAB DISCOUNTS & STATE LABOUR MARKUP ===');

// Test 1: Slabs
const slabs = getAllWeightSlabDiscounts();
console.log('All weight slab discounts in DB:', slabs);
if (slabs.length < 2) {
  throw new Error('Expected at least 2 default weight slab discounts');
}

// 500g (0.5kg) -> no discount
const d0 = getWeightSlabDiscount(500);
console.log('500g discount:', d0);
if (d0.discount_per_gram !== 0) throw new Error('Expected 0 discount for 500g');

// 1500g (1.5kg) -> Rs. 2/g discount
const d1 = getWeightSlabDiscount(1500);
console.log('1500g discount:', d1);
if (d1.discount_per_gram !== 2) throw new Error('Expected 2 discount for 1500g');

// 2500g (2.5kg) -> Rs. 4/g discount
const d2 = getWeightSlabDiscount(2500);
console.log('2500g discount:', d2);
if (d2.discount_per_gram !== 4) throw new Error('Expected 4 discount for 2500g');

// Test 2: State premium on labour charges only + Slab discount
// Silver rate: 80/g, Labour: 20/g, State markup: 20% (Goa), Slab discount: 2/g
// Scaled labour = 20 * 1.20 = 24. Effective labour = 24 - 2 = 22.
// For 100g: Silver = 8000, Labour = 2200, Subtotal = 10200, GST = 306, Total = 10506.
const pb = priceBreakdown(100, 80, 20, 20, 2);
console.log('Price breakdown with 20% state labour markup & 2/g slab discount:', pb);
if (pb.silver_amount !== 8000) throw new Error(`Expected silver 8000, got ${pb.silver_amount}`);
if (pb.labour_amount !== 2200) throw new Error(`Expected labour 2200, got ${pb.labour_amount}`);
if (pb.subtotal !== 10200) throw new Error(`Expected subtotal 10200, got ${pb.subtotal}`);
if (pb.gst_amount !== 306) throw new Error(`Expected GST 306, got ${pb.gst_amount}`);
if (pb.total !== 10506) throw new Error(`Expected total 10506, got ${pb.total}`);

// Test 3: Delivery pincode customized charge
db.prepare("INSERT OR REPLACE INTO delivery_pincodes (pincode, charge, city, state, updated_at) VALUES ('403001', 175.0, 'Panaji', 'Goa', CURRENT_TIMESTAMP)").run();
const quote = deliveryChargeFor({ pin: '403001', zone: 'South', orderValue: 5000 });
console.log('Custom delivery quote for 403001:', quote);
if (quote.charge !== 175.0) throw new Error(`Expected 175.0 for 403001, got ${quote.charge}`);

console.log('=== ALL TESTS PASSED SUCCESSFULLY! ===');
