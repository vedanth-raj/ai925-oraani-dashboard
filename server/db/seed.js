const bcrypt = require('bcryptjs');
const { db } = require('./database');

function seedDatabase() {
  const now = new Date().toISOString();
  const today = '2026-10-20';

  // Create Users
  const adminPinHash = bcrypt.hashSync('925925', 10);
  const bizAdminPinHash = bcrypt.hashSync('888888', 10);
  const repPinHash = bcrypt.hashSync('123456', 10);

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, username, pin_hash, role, full_name, phone, email, employee_code, assigned_region, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const adminId = 'usr_admin_01';
  const bizAdminId = 'usr_bizadmin_01';
  const repRaviId = 'usr_rep_ravi';
  const repGauravId = 'usr_rep_gaurav';

  insertUser.run(adminId, 'admin', adminPinHash, 'ADMIN', 'System Administrator', '9999999999', 'admin@ai925.local', 'ADM-001', 'West', 1, now, now);
  insertUser.run(bizAdminId, 'bizadmin', bizAdminPinHash, 'BUSINESS_ADMIN', 'Business Administrator', '9888888888', 'biz@ai925.local', 'BA-001', 'West', 1, now, now);
  insertUser.run(repRaviId, 'rep_ravi', repPinHash, 'SALES_REP', 'Ravi Sales Rep', '9876543210', 'ravi.rep@ai925.local', 'SR-001', 'West', 1, now, now);
  insertUser.run(repGauravId, 'rep_gaurav', repPinHash, 'SALES_REP', 'Gaurav Sales Rep', '8445777784', 'gaurav.rep@ai925.local', 'SR-002', 'South', 1, now, now);

  // App Settings
  const insertSetting = db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)');
  insertSetting.run('company_name', 'AI925 Order Management System', now);
  insertSetting.run('version', 'v1.0', now);
  insertSetting.run('database_seeded', 'true', now);

  // Default Categories
  const insertCategory = db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, description, is_archived, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const catChains = 'cat_chains';
  const catEarrings = 'cat_earrings';
  const catBracelets = 'cat_bracelets';
  const catTest1 = 'cat_test_375118';
  const catTest2 = 'cat_test_5f2499';

  insertCategory.run(catChains, 'Chains', 'Fine silver & gold chain designs', 0, now, now);
  insertCategory.run(catEarrings, 'Earrings', 'Stud, hoop & drop earrings', 0, now, now);
  insertCategory.run(catBracelets, 'Bracelets', 'Handcrafted bracelets', 0, now, now);
  insertCategory.run(catTest1, 'TEST_Cat_375118', 'Custom design category', 0, now, now);
  insertCategory.run(catTest2, 'TEST_Cat_5f2499', 'Custom casting category', 0, now, now);

  // Custom Attributes
  const insertAttr = db.prepare(`
    INSERT OR IGNORE INTO custom_attributes (id, name, data_type, is_required, dropdown_options, display_order, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAttr.run('attr_wire', 'Wire Size', 'text', 0, null, 1, 1, now);
  insertAttr.run('attr_endings', 'Endings', 'text', 0, null, 2, 1, now);
  insertAttr.run('attr_lock', 'Lock Type', 'dropdown', 0, JSON.stringify(['Fish Lock', 'Spring Lock', 'Lobster', 'Box Lock']), 3, 1, now);

  // Products
  const insertProduct = db.prepare(`
    INSERT OR IGNORE INTO products (id, name, sku, category_id, description, wire_size, endings, lock_type, std_weight_per_20in, physical_stock, reserved_stock, reorder_threshold, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const prodAnchor20 = 'prod_anchor_20';
  const prodAnchor18 = 'prod_anchor_18';
  const prodBox = 'prod_box_42';
  const prodDoubleV = 'prod_double_v';
  const prodFox = 'prod_fox_round';
  const prodKamal = 'prod_kamal';
  const prodRope = 'prod_rope';
  const prodSarak = 'prod_sarak';
  const prodSnake = 'prod_snake';
  const prodTvRo = 'prod_tvro';

  insertProduct.run(prodAnchor20, 'Anchor Chain', 'CH018_20', catChains, 'Anchor links with fish lock', '22', '12', 'Fish Lock', 20.0, 1500, 191, 100, 'active', now, now);
  insertProduct.run(prodAnchor18, 'Anchor Chain', 'CH018_18', catChains, 'Lightweight anchor chain', '22', '22m', 'Fish Lock', 10.0, 1000, 16, 100, 'active', now, now);
  insertProduct.run(prodBox, 'Box42-2+2', '100', catChains, 'Box link chains with lobster', '42', 'Lobster 500 mg', 'Spring Lock', 12.0, 800, 0, 50, 'active', now, now);
  insertProduct.run(prodDoubleV, 'Double V', 'TESTORDF8832', catChains, 'Double V pattern interlocking chain', '20', 'Standard', 'Fish Lock', 20.0, 1200, 40, 100, 'active', now, now);
  insertProduct.run(prodFox, 'Fox Round', 'TESTSKU6305FA', catChains, 'Round fox tail chain', '18', 'Standard', 'Spring Lock', 10.0, 600, 0, 50, 'active', now, now);
  insertProduct.run(prodKamal, 'Kamal Chain', 'PFEATD27A9', catChains, 'Classic lotus pattern chain', '20', 'Standard', 'Fish Lock', 10.0, 900, 35, 100, 'active', now, now);
  insertProduct.run(prodRope, 'Rope Chain', 'RC01', catChains, 'Diamond cut rope chain', '22', 'Standard', 'Fish Lock', 10.0, 750, 0, 50, 'active', now, now);
  insertProduct.run(prodSarak, 'Sarak chain', 'PFEATEE239', catChains, 'Smooth flexible sarak chain', '20', 'Standard', 'Fish Lock', 10.0, 500, 0, 50, 'active', now, now);
  insertProduct.run(prodSnake, 'Snake Chain', 'CH031_18', catChains, 'Glossy solid snake chain', '20', 'Standard', 'Fish Lock', 20.0, 850, 0, 50, 'active', now, now);
  insertProduct.run(prodTvRo, 'TvRo', 'TESTSKUE7D19B', catChains, 'Modern geometric cable chain', '20', 'Standard', 'Fish Lock', 10.0, 400, 0, 50, 'active', now, now);

  // Customers
  const insertCustomer = db.prepare(`
    INSERT OR IGNORE INTO customers (id, poc_name, company_name, phone, email, address, pin_code, city, state, zone, notes, is_archived, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const custGaurav = 'cust_gaurav';
  const custHimanshu = 'cust_himanshu';
  const custRajeev = 'cust_rajeev';
  const custRavi = 'cust_ravi';
  const custTest1 = 'cust_test_1';
  const custTest2 = 'cust_test_2';

  insertCustomer.run(custGaurav, 'Gaurav Agarwal', 'Oraani', '8445777784', 'gaurav@oraani.com', 'Station Road', '509001', 'Mahabub Nagar', 'Telangana', 'South', 'Key client in South', 0, now, now);
  insertCustomer.run(custHimanshu, 'Himanshu Agarwal', 'Aryan International', '9810012345', 'himanshu@aryanintl.com', 'Connaught Place', '110001', 'Central Delhi', 'Delhi', 'North', '', 0, now, now);
  insertCustomer.run(custRajeev, 'Rajeev Agarwal', 'Silver Impex', '9412345678', 'rajeev@silverimpex.com', 'Johari Bazar', '282001', 'Agra', 'Uttar Pradesh', 'North', '', 0, now, now);
  insertCustomer.run(custRavi, 'Ravi', 'Shree Jewels', '9876543210', 'ravi@shreejewels.com', 'Zaveri Bazaar, Kalbadevi', '400002', 'Mumbai', 'Maharashtra', 'West', 'High volume buyer', 0, now, now);
  insertCustomer.run(custTest1, 'TEST_Ord_60320', 'TEST_OrdCo_a1491', '9820000001', 'test1@example.com', 'Kalbadevi', '400002', 'Mumbai', 'Maharashtra', 'West', '', 0, now, now);
  insertCustomer.run(custTest2, 'TEST_Ord_8dfcb', 'TEST_OrdCo_6c2ac', '9820000002', 'test2@example.com', 'Bandra West', '400050', 'Mumbai', 'Maharashtra', 'West', '', 0, now, now);

  // Region mappings
  const insertRegion = db.prepare(`
    INSERT OR IGNORE INTO region_mappings (id, state, district, pin_prefix, assigned_zone, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertRegion.run('rm_1', 'Delhi', null, '11', 'North', now);
  insertRegion.run('rm_2', 'Uttar Pradesh', null, '28', 'North', now);
  insertRegion.run('rm_3', 'Telangana', null, '50', 'South', now);
  insertRegion.run('rm_4', 'Maharashtra', null, '40', 'West', now);
  insertRegion.run('rm_5', 'Gujarat', null, '38', 'West', now);
  insertRegion.run('rm_6', 'West Bengal', null, '70', 'East', now);

  // Orders
  const insertOrder = db.prepare(`
    INSERT OR IGNORE INTO orders (id, order_number, customer_id, creator_id, sales_rep_id, status, operational_status, advance_amount, special_notes, total_pieces, expected_weight, delivered_pieces, delivered_weight, order_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertOrderItem = db.prepare(`
    INSERT OR IGNORE INTO order_items (id, order_id, product_id, size_inches, requested_pieces, allocated_pieces, delivered_pieces, expected_weight, delivered_weight, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDelivery = db.prepare(`
    INSERT OR IGNORE INTO deliveries (id, order_id, delivery_number, delivery_date, courier_name, tracking_number, notes, dispatched_by_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDeliveryItem = db.prepare(`
    INSERT OR IGNORE INTO delivery_items (id, delivery_id, order_item_id, delivered_pieces, actual_weight_g)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Order #4930 (Ravi / Shree Jewels - West)
  const ord4930 = 'ord_4930';
  insertOrder.run(ord4930, '#4930', custRavi, adminId, repRaviId, 'IN_PROGRESS', 'Partially fulfilled', 0.0, 'Priority delivery for Diwali exhibition', 85, 1340.0, 65, 108.0, today, now, now);
  
  // Items for #4930
  // Item 1: Anchor Chain 20 in: 10 ordered, 10 delivered (exp 200.0g, delivered actual 20.00g)
  const item4930_1 = 'item_4930_1';
  insertOrderItem.run(item4930_1, ord4930, prodAnchor20, 20.0, 10, 10, 10, 200.0, 20.0, now);
  
  // Item 2: Double V 18 in: 20 ordered, 20 delivered (exp 360.0g, delivered actual 36.00g)
  const item4930_2 = 'item_4930_2';
  insertOrderItem.run(item4930_2, ord4930, prodDoubleV, 18.0, 20, 20, 20, 360.0, 36.0, now);

  // Item 3: Double V 20 in: 20 ordered, 20 delivered (exp 400.0g, delivered actual 40.00g)
  const item4930_3 = 'item_4930_3';
  insertOrderItem.run(item4930_3, ord4930, prodDoubleV, 20.0, 20, 20, 20, 400.0, 40.0, now);

  // Item 4: Kamal Chain 20 in: 20 ordered, 0 delivered (exp 200.0g, delivered 0.0g)
  const item4930_4 = 'item_4930_4';
  insertOrderItem.run(item4930_4, ord4930, prodKamal, 20.0, 20, 0, 0, 200.0, 0.0, now);

  // Item 5: Kamal Chain 24 in: 15 ordered, 15 delivered (exp 180.0g, delivered actual 12.00g)
  const item4930_5 = 'item_4930_5';
  insertOrderItem.run(item4930_5, ord4930, prodKamal, 24.0, 15, 15, 15, 180.0, 12.0, now);

  // Delivery 1 for #4930
  const del4930_1 = 'del_4930_1';
  insertDelivery.run(del4930_1, ord4930, 1, today, 'Bluedart Air Express', 'BD74910398', 'Dispatch 1 completed on time', adminId, now);
  insertDeliveryItem.run('deli_1', del4930_1, item4930_1, 10, 20.0);
  insertDeliveryItem.run('deli_2', del4930_1, item4930_2, 20, 36.0);
  insertDeliveryItem.run('deli_3', del4930_1, item4930_3, 20, 40.0);
  insertDeliveryItem.run('deli_4', del4930_1, item4930_5, 15, 12.0);

  // Order #7094 (Gaurav Agarwal / Oraani - South)
  const ord7094 = 'ord_7094';
  insertOrder.run(ord7094, '#7094', custGaurav, adminId, repGauravId, 'IN_PROGRESS', 'Partially fulfilled', 5000.0, 'Regular monthly dispatch', 100, 1750.0, 50, 90.0, today, now, now);
  
  const item7094_1 = 'item_7094_1'; // Anchor Chain 18 in: 75 ordered, 50 delivered, 25 remaining
  insertOrderItem.run(item7094_1, ord7094, prodAnchor20, 18.0, 75, 50, 50, 1350.0, 90.0, now);

  const item7094_2 = 'item_7094_2'; // Kamal Chain 20 in: 25 ordered, 0 delivered, 25 remaining
  insertOrderItem.run(item7094_2, ord7094, prodKamal, 20.0, 25, 0, 0, 400.0, 0.0, now);

  const del7094_1 = 'del_7094_1';
  insertDelivery.run(del7094_1, ord7094, 1, today, 'DTDC Express', 'DT6092144', 'First batch dispatch', adminId, now);
  insertDeliveryItem.run('deli_7094_1', del7094_1, item7094_1, 50, 90.0);

  // Order #1794 (Ravi / Shree Jewels - West)
  const ord1794 = 'ord_1794';
  insertOrder.run(ord1794, '#1794', custRavi, adminId, repRaviId, 'OPEN', 'Awaiting stock allocation', 0.0, 'Custom finish requested', 150, 3400.0, 0, 0.0, today, now, now);
  insertOrderItem.run('item_1794_1', ord1794, prodAnchor20, 20.0, 100, 0, 0, 2000.0, 0.0, now);
  insertOrderItem.run('item_1794_2', ord1794, prodAnchor18, 18.0, 50, 0, 0, 1400.0, 0.0, now);

  // Additional orders to align overview dashboard totals:
  // 14 total orders, 451 pieces, 8153.0g expected, 623.2g delivered, 7529.8g remaining est.
  // 3 OPEN, 8 IN PROGRESS, 3 CLOSED.
  // Region breakdown: West: 12 orders · 5913.0g, South: 2 orders · 2240.0g, North: 0, East: 0
  
  // Order #6577 (Gaurav Agarwal / Oraani - South)
  const ord6577 = 'ord_6577';
  insertOrder.run(ord6577, '#6577', custGaurav, adminId, repGauravId, 'IN_PROGRESS', 'Partially fulfilled', 0.0, '', 30, 490.0, 20, 129.0, today, now, now);
  insertOrderItem.run('item_6577_1', ord6577, prodAnchor18, 18.0, 30, 20, 20, 490.0, 129.0, now);

  // 3 Closed Orders for West
  for (let i = 1; i <= 3; i++) {
    const oId = `ord_closed_${i}`;
    const oNum = `#500${i}`;
    insertOrder.run(oId, oNum, custRavi, adminId, repRaviId, 'CLOSED', 'Fulfilled', 0.0, 'Completed order', 10, 150.0, 10, 80.0, '2026-10-15', now, now);
    insertOrderItem.run(`item_c_${i}`, oId, prodBox, 20.0, 10, 10, 10, 150.0, 80.0, now);
  }

  // 5 More In Progress Orders for West
  for (let i = 1; i <= 5; i++) {
    const oId = `ord_inp_${i}`;
    const oNum = `#601${i}`;
    insertOrder.run(oId, oNum, custRavi, adminId, repRaviId, 'IN_PROGRESS', 'Partially fulfilled', 0.0, '', 12, 100.0, 5, 11.2, today, now, now);
    insertOrderItem.run(`item_inp_${i}`, oId, prodKamal, 20.0, 12, 5, 5, 100.0, 11.2, now);
  }

  // 2 More Open Orders for West (Total Open = 1 from #1794 + 2 = 3 Open!)
  for (let i = 1; i <= 2; i++) {
    const oId = `ord_opn_${i}`;
    const oNum = `#702${i}`;
    insertOrder.run(oId, oNum, custTest1, adminId, repRaviId, 'OPEN', 'Awaiting stock', 0.0, '', 12, 118.0, 0, 0.0, today, now, now);
    insertOrderItem.run(`item_opn_${i}`, oId, prodDoubleV, 20.0, 12, 0, 0, 118.0, 0.0, now);
  }

  // Seed pin code cache with common Indian PINs for instant offline resolution
  const insertPin = db.prepare('INSERT OR REPLACE INTO pin_code_cache (pin_code, city, state, district, zone, cached_at) VALUES (?, ?, ?, ?, ?, ?)');
  insertPin.run('110001', 'Central Delhi', 'Delhi', 'Central Delhi', 'North', now);
  insertPin.run('282001', 'Agra', 'Uttar Pradesh', 'Agra', 'North', now);
  insertPin.run('400001', 'Mumbai', 'Maharashtra', 'Mumbai', 'West', now);
  insertPin.run('400002', 'Mumbai', 'Maharashtra', 'Mumbai', 'West', now);
  insertPin.run('400050', 'Mumbai', 'Maharashtra', 'Mumbai', 'West', now);
  insertPin.run('509001', 'Mahabub Nagar', 'Telangana', 'Mahabub Nagar', 'South', now);
  insertPin.run('560001', 'Bengaluru', 'Karnataka', 'Bengaluru', 'South', now);
  insertPin.run('700001', 'Kolkata', 'West Bengal', 'Kolkata', 'East', now);

  // Seed initial company assignments
  const insertCompanyAssignment = db.prepare(`
    INSERT OR IGNORE INTO rep_company_assignments (id, user_id, company_name, assigned_by_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertCompanyAssignment.run('asgn_ravi_shree', repRaviId, 'Shree Jewels', adminId, now);
  insertCompanyAssignment.run('asgn_gaurav_oraani', repGauravId, 'Oraani', adminId, now);

  console.log('Seeding completed successfully!');
}

module.exports = { seedDatabase };

if (require.main === module) {
  seedDatabase();
}
