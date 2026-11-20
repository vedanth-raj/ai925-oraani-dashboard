const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// AI925_DATA_DIR lets a test server run against a copy of the database
const DATA_DIR = process.env.AI925_DATA_DIR || path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'ai925.db');
const STARTER_DB = path.join(DATA_DIR, 'starter_catalog.db');
if (!fs.existsSync(DB_PATH) && fs.existsSync(STARTER_DB)) {
  try {
    fs.copyFileSync(STARTER_DB, DB_PATH);
    console.log('[INFO] Fresh database initialized with starting product catalog and settings.');
  } catch (copyErr) {
    console.warn('[WARNING] Could not copy starter catalog:', copyErr.message);
  }
}
const db = new Database(DB_PATH);

// Configure SQLite for high performance and integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

function initializeSchema() {
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      pin_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'BUSINESS_ADMIN', 'SALES_REP')),
      full_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      employee_code TEXT UNIQUE,
      assigned_region TEXT DEFAULT 'West',
      session_id TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Categories table
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      is_archived INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Custom Product Attributes
    CREATE TABLE IF NOT EXISTS custom_attributes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data_type TEXT NOT NULL CHECK(data_type IN ('text', 'number', 'boolean', 'dropdown', 'textarea')),
      is_required INTEGER DEFAULT 0,
      dropdown_options TEXT, -- JSON array of strings
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- Products table
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT,
      wire_size TEXT,
      endings TEXT,
      lock_type TEXT DEFAULT 'Fish Lock',
      std_weight_per_20in REAL NOT NULL DEFAULT 20.0,
      unit TEXT DEFAULT 'g',
      physical_stock INTEGER DEFAULT 1000,
      reserved_stock INTEGER DEFAULT 0,
      reorder_threshold INTEGER DEFAULT 100,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'archived')),
      image_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Product Attribute Values
    CREATE TABLE IF NOT EXISTS product_attribute_values (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      attribute_id TEXT NOT NULL REFERENCES custom_attributes(id) ON DELETE CASCADE,
      value TEXT,
      UNIQUE(product_id, attribute_id)
    );

    -- Customers table
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      poc_name TEXT NOT NULL,
      company_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      pin_code TEXT,
      city TEXT,
      state TEXT,
      zone TEXT NOT NULL DEFAULT 'West' CHECK(zone IN ('North', 'South', 'East', 'West')),
      notes TEXT,
      created_by_id TEXT REFERENCES users(id),
      rep_edit_count INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Orders table
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      creator_id TEXT NOT NULL REFERENCES users(id),
      sales_rep_id TEXT REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'IN_PROGRESS', 'CLOSED')),
      operational_status TEXT DEFAULT 'Awaiting stock',
      advance_amount REAL DEFAULT 0.0,
      special_notes TEXT,
      total_pieces INTEGER DEFAULT 0,
      expected_weight REAL DEFAULT 0.0,
      delivered_pieces INTEGER DEFAULT 0,
      delivered_weight REAL DEFAULT 0.0,
      order_date TEXT NOT NULL,
      closed_at TEXT,
      closed_by_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Order Items table
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      size_inches REAL NOT NULL DEFAULT 20.0,
      requested_pieces INTEGER NOT NULL,
      allocated_pieces INTEGER NOT NULL DEFAULT 0,
      delivered_pieces INTEGER NOT NULL DEFAULT 0,
      expected_weight REAL NOT NULL DEFAULT 0.0,
      delivered_weight REAL NOT NULL DEFAULT 0.0,
      created_at TEXT NOT NULL
    );

    -- Deliveries / Shipments table
    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      delivery_number INTEGER NOT NULL DEFAULT 1,
      delivery_date TEXT NOT NULL,
      courier_name TEXT,
      tracking_number TEXT,
      notes TEXT,
      dispatched_by_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    -- Delivery Items table (breakdown of pieces and actual weight per order item)
    CREATE TABLE IF NOT EXISTS delivery_items (
      id TEXT PRIMARY KEY,
      delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
      order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      delivered_pieces INTEGER NOT NULL,
      actual_weight_g REAL NOT NULL
    );

    -- Shipment Images table
    CREATE TABLE IF NOT EXISTS shipment_images (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      delivery_id TEXT REFERENCES deliveries(id) ON DELETE SET NULL,
      file_path TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      caption TEXT,
      uploaded_by_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    -- Inventory Movements Ledger
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id),
      change_qty INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('INTAKE', 'ALLOCATION', 'DISPATCH', 'RETURN', 'ADJUSTMENT')),
      reason TEXT,
      related_order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
      user_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    -- PIN Code Cache
    CREATE TABLE IF NOT EXISTS pin_code_cache (
      pin_code TEXT PRIMARY KEY,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      district TEXT,
      zone TEXT NOT NULL DEFAULT 'West',
      cached_at TEXT NOT NULL
    );

    -- Region Mappings
    CREATE TABLE IF NOT EXISTS region_mappings (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      district TEXT,
      pin_prefix TEXT,
      assigned_zone TEXT NOT NULL CHECK(assigned_zone IN ('North', 'South', 'East', 'West')),
      created_at TEXT NOT NULL
    );

    -- Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    -- App Settings
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Performance Indexes
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_sales_rep ON orders(sales_rep_id);
    CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_deliveries_order ON deliveries(order_id);
    CREATE INDEX IF NOT EXISTS idx_shipment_images_order ON shipment_images(order_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);

    -- Sales Representative Assigned Companies
    CREATE TABLE IF NOT EXISTS rep_company_assignments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL,
      assigned_by_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL,
      UNIQUE(user_id, company_name)
    );
    CREATE INDEX IF NOT EXISTS idx_rep_companies_user ON rep_company_assignments(user_id);

    -- Private Cloud Folders
    CREATE TABLE IF NOT EXISTS cloud_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES cloud_folders(id) ON DELETE CASCADE,
      created_by_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    -- Private Cloud Files
    CREATE TABLE IF NOT EXISTS cloud_files (
      id TEXT PRIMARY KEY,
      folder_id TEXT REFERENCES cloud_folders(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      uploaded_by_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cloud_files_folder ON cloud_files(folder_id);

    -- Silver rate history (latest row is the rate in force)
    CREATE TABLE IF NOT EXISTS silver_rates (
      id TEXT PRIMARY KEY,
      rate_per_gram REAL NOT NULL,
      source TEXT NOT NULL,
      usd_per_oz REAL,
      usd_inr REAL,
      set_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_silver_rates_created ON silver_rates(created_at);

    -- Ready stock rows: standard weight (g per piece) × size, with pieces on the shelf
    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      std_weight_g REAL NOT NULL DEFAULT 0,
      size_inches REAL NOT NULL,
      weight_g REAL NOT NULL,
      stock_qty INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(product_id, std_weight_g, size_inches)
    );
    CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);

    -- Standard weight options (g per piece), each with its own pricing, SKU code and build details
    CREATE TABLE IF NOT EXISTS product_weight_options (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      std_weight_g REAL NOT NULL,
      making_charge REAL,
      sku_code TEXT,
      wire_size TEXT,
      endings TEXT,
      lock_type TEXT,
      extra TEXT, -- JSON object: custom column name -> value
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(product_id, std_weight_g)
    );
    CREATE INDEX IF NOT EXISTS idx_weight_options_product ON product_weight_options(product_id);

    -- Quantity price slabs (making charge per gram; set by Business Administrator)
    CREATE TABLE IF NOT EXISTS product_price_tiers (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      min_qty INTEGER NOT NULL,
      max_qty INTEGER,
      price_per_gram REAL NOT NULL,
      discount_price_per_gram REAL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_price_tiers_product ON product_price_tiers(product_id);

    -- Self-registered customer portal accounts (need Business + System Admin approval)
    CREATE TABLE IF NOT EXISTS customer_accounts (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      company_name TEXT,
      phone TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      address TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      id_card_path TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      biz_approved_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      biz_approved_at TEXT,
      sys_approved_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      sys_approved_at TEXT,
      rejected_reason TEXT,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      notified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_customer_accounts_status ON customer_accounts(status);

    -- "Request from seller" when a size is out of ready stock
    CREATE TABLE IF NOT EXISTS stock_requests (
      id TEXT PRIMARY KEY,
      customer_account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      size_inches REAL,
      quantity INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'IN_PROGRESS', 'CLOSED')),
      admin_notes TEXT,
      handled_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stock_requests_status ON stock_requests(status);

    -- Dummy payment gateway transactions
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SUCCESS',
      gateway_ref TEXT NOT NULL,
      paid_by_type TEXT NOT NULL CHECK(paid_by_type IN ('CUSTOMER', 'STAFF')),
      paid_by_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

    -- Profile / password changes a customer asked for (applied once an administrator approves)
    CREATE TABLE IF NOT EXISTS customer_change_requests (
      id TEXT PRIMARY KEY,
      customer_account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
      changes TEXT NOT NULL, -- JSON object: field -> new value
      password_enc TEXT,     -- new password (encrypted), when the request changes it
      password_hash TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      reviewed_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      rejected_reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_change_requests_status ON customer_change_requests(status);

    -- Every password a customer account has had (System Admin view)
    CREATE TABLE IF NOT EXISTS customer_password_history (
      id TEXT PRIMARY KEY,
      customer_account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
      password_enc TEXT NOT NULL,
      source TEXT NOT NULL, -- 'REGISTERED' | 'CHANGED'
      approved_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_password_history_account ON customer_password_history(customer_account_id);

    -- "Book a call" requests for customised orders
    CREATE TABLE IF NOT EXISTS call_bookings (
      id TEXT PRIMARY KEY,
      customer_account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      preferred_date TEXT,
      preferred_slot TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'SCHEDULED', 'DONE', 'CANCELLED')),
      admin_notes TEXT,
      handled_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_call_bookings_status ON call_bookings(status);
  `);

  // Ensure cloud storage directory exists
  const CLOUD_DIR = path.join(DATA_DIR, 'cloud_drive');
  if (!fs.existsSync(CLOUD_DIR)) {
    fs.mkdirSync(CLOUD_DIR, { recursive: true });
  }

  // Non-destructive migrations for existing SQLite databases
  try {
    // 1. Users table migration (relax role check constraint for BUSINESS_ADMIN and add session_id & location tracking)
    const userColumns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
    if (!userColumns.includes('session_id')) {
      db.prepare("ALTER TABLE users ADD COLUMN session_id TEXT").run();
    }
    if (!userColumns.includes('last_latitude')) {
      db.prepare("ALTER TABLE users ADD COLUMN last_latitude REAL").run();
    }
    if (!userColumns.includes('last_longitude')) {
      db.prepare("ALTER TABLE users ADD COLUMN last_longitude REAL").run();
    }
    if (!userColumns.includes('last_location_address')) {
      db.prepare("ALTER TABLE users ADD COLUMN last_location_address TEXT").run();
    }
    if (!userColumns.includes('last_location_updated_at')) {
      db.prepare("ALTER TABLE users ADD COLUMN last_location_updated_at TEXT").run();
    }
    
    // Check if role CHECK constraint needs updating
    const userTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get()?.sql || '';
    if (!userTableSql.includes('BUSINESS_ADMIN')) {
      db.exec(`
        PRAGMA foreign_keys=off;
        BEGIN TRANSACTION;
        CREATE TABLE users_temp (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          pin_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('ADMIN', 'BUSINESS_ADMIN', 'SALES_REP')),
          full_name TEXT NOT NULL,
          phone TEXT,
          email TEXT,
          employee_code TEXT UNIQUE,
          assigned_region TEXT DEFAULT 'West',
          session_id TEXT,
          is_active INTEGER DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO users_temp (id, username, pin_hash, role, full_name, phone, email, employee_code, assigned_region, session_id, is_active, created_at, updated_at)
        SELECT id, username, pin_hash, role, full_name, phone, email, employee_code, assigned_region, session_id, is_active, created_at, updated_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_temp RENAME TO users;
        COMMIT;
        PRAGMA foreign_keys=on;
      `);
    }

    // 2. Customers table migrations
    const customerColumns = db.prepare("PRAGMA table_info(customers)").all().map(c => c.name);
    if (!customerColumns.includes('created_by_id')) {
      db.prepare("ALTER TABLE customers ADD COLUMN created_by_id TEXT REFERENCES users(id)").run();
    }
    if (!customerColumns.includes('rep_edit_count')) {
      db.prepare("ALTER TABLE customers ADD COLUMN rep_edit_count INTEGER DEFAULT 0").run();
    }
    if (!customerColumns.includes('alternate_phone')) {
      db.prepare("ALTER TABLE customers ADD COLUMN alternate_phone TEXT").run();
    }
    if (!customerColumns.includes('additional_phones')) {
      db.prepare("ALTER TABLE customers ADD COLUMN additional_phones TEXT").run();
    }
    if (!customerColumns.includes('gstin')) {
      db.prepare("ALTER TABLE customers ADD COLUMN gstin TEXT").run();
    }
    if (!customerColumns.includes('visiting_card_path')) {
      db.prepare("ALTER TABLE customers ADD COLUMN visiting_card_path TEXT").run();
    }
    if (!customerColumns.includes('latitude')) {
      db.prepare("ALTER TABLE customers ADD COLUMN latitude REAL").run();
    }
    if (!customerColumns.includes('longitude')) {
      db.prepare("ALTER TABLE customers ADD COLUMN longitude REAL").run();
    }
    if (!customerColumns.includes('location_address')) {
      db.prepare("ALTER TABLE customers ADD COLUMN location_address TEXT").run();
    }
    if (!customerColumns.includes('category')) {
      db.prepare("ALTER TABLE customers ADD COLUMN category TEXT DEFAULT 'Wholesaler'").run();
    }
    if (!customerColumns.includes('country')) {
      db.prepare("ALTER TABLE customers ADD COLUMN country TEXT DEFAULT 'India'").run();
    }
    db.prepare("CREATE INDEX IF NOT EXISTS idx_customers_creator ON customers(created_by_id)").run();

    // 2b. Shipment images table migrations (image_type: shipment, package, bill)
    const shipmentImgColumns = db.prepare("PRAGMA table_info(shipment_images)").all().map(c => c.name);
    if (!shipmentImgColumns.includes('image_type')) {
      db.prepare("ALTER TABLE shipment_images ADD COLUMN image_type TEXT DEFAULT 'shipment'").run();
    }

    // 3. Audit logs table migrations (previous_data, new_data)
    const auditColumns = db.prepare("PRAGMA table_info(audit_logs)").all().map(c => c.name);
    if (!auditColumns.includes('previous_data')) {
      db.prepare("ALTER TABLE audit_logs ADD COLUMN previous_data TEXT").run();
    }
    if (!auditColumns.includes('new_data')) {
      db.prepare("ALTER TABLE audit_logs ADD COLUMN new_data TEXT").run();
    }

    // 4. Product pricing columns (labour charge per gram, minimum order quantity, thickness)
    const productColumns = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);
    if (!productColumns.includes('labour_per_gram')) {
      db.prepare("ALTER TABLE products ADD COLUMN labour_per_gram REAL DEFAULT 0").run();
    }
    if (!productColumns.includes('moq')) {
      db.prepare("ALTER TABLE products ADD COLUMN moq INTEGER DEFAULT 1").run();
    }
    if (!productColumns.includes('thickness')) {
      db.prepare("ALTER TABLE products ADD COLUMN thickness TEXT").run();
      db.prepare(`
        UPDATE products 
        SET thickness = CASE
          WHEN wire_size = '18' THEN '2.4 mm'
          WHEN wire_size = '20' THEN '2.0 mm'
          WHEN wire_size = '22' THEN '1.8 mm'
          WHEN wire_size = '24' THEN '1.5 mm'
          WHEN wire_size = '42' THEN '1.4 mm'
          WHEN wire_size IS NOT NULL AND length(wire_size) > 0 THEN wire_size || ' mm'
          ELSE '2.0 mm'
        END
      `).run();
    }

    const weightOptCols = db.prepare("PRAGMA table_info(product_weight_options)").all().map(c => c.name);
    if (!weightOptCols.includes('thickness')) {
      db.prepare("ALTER TABLE product_weight_options ADD COLUMN thickness TEXT").run();
      db.prepare(`
        UPDATE product_weight_options 
        SET thickness = CASE
          WHEN wire_size = '18' THEN '2.4 mm'
          WHEN wire_size = '20' THEN '2.0 mm'
          WHEN wire_size = '22' THEN '1.8 mm'
          WHEN wire_size = '24' THEN '1.5 mm'
          WHEN wire_size = '42' THEN '1.4 mm'
          WHEN wire_size IS NOT NULL AND length(wire_size) > 0 THEN wire_size || ' mm'
          ELSE '2.0 mm'
        END
      `).run();
    }

    // 5. Order pricing, portal source and payment columns
    const orderColumns = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
    const orderAdds = [
      ['order_type', "TEXT DEFAULT 'STANDARD'"],
      ['customer_account_id', 'TEXT'],
      ['silver_rate', 'REAL'],
      ['silver_amount', 'REAL DEFAULT 0'],
      ['labour_amount', 'REAL DEFAULT 0'],
      ['gst_amount', 'REAL DEFAULT 0'],
      ['total_amount', 'REAL DEFAULT 0'],
      ['payment_status', "TEXT DEFAULT 'UNPAID'"],
      ['paid_amount', 'REAL DEFAULT 0']
    ];
    for (const [col, def] of orderAdds) {
      if (!orderColumns.includes(col)) {
        db.prepare(`ALTER TABLE orders ADD COLUMN ${col} ${def}`).run();
      }
    }

    const itemColumns = db.prepare("PRAGMA table_info(order_items)").all().map(c => c.name);
    const itemAdds = [
      ['unit_weight', 'REAL'],
      ['labour_per_gram', 'REAL'],
      ['line_amount', 'REAL DEFAULT 0']
    ];
    for (const [col, def] of itemAdds) {
      if (!itemColumns.includes(col)) {
        db.prepare(`ALTER TABLE order_items ADD COLUMN ${col} ${def}`).run();
      }
    }

    // 6. Ready stock gains a standard-weight dimension (rebuild: the unique key changes)
    const variantColumns = db.prepare("PRAGMA table_info(product_variants)").all().map(c => c.name);
    if (!variantColumns.includes('std_weight_g')) {
      db.exec(`
        BEGIN TRANSACTION;
        CREATE TABLE product_variants_new (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          std_weight_g REAL NOT NULL DEFAULT 0,
          size_inches REAL NOT NULL,
          weight_g REAL NOT NULL,
          stock_qty INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(product_id, std_weight_g, size_inches)
        );
        INSERT INTO product_variants_new (id, product_id, std_weight_g, size_inches, weight_g, stock_qty, created_at, updated_at)
        SELECT v.id, v.product_id, COALESCE(p.std_weight_per_20in, 20), v.size_inches, v.weight_g, v.stock_qty, v.created_at, v.updated_at
        FROM product_variants v JOIN products p ON v.product_id = p.id;
        DROP TABLE product_variants;
        ALTER TABLE product_variants_new RENAME TO product_variants;
        CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
        COMMIT;
      `);
    }

    // 7. Products: custom columns on the standard weight table (JSON array of names)
    const productColumns2 = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);
    if (!productColumns2.includes('weight_columns')) {
      db.prepare("ALTER TABLE products ADD COLUMN weight_columns TEXT").run();
    }

    // 8. Price slabs: quantity unit (pcs / g / kg) and which purchase type they apply to
    const tierColumns = db.prepare("PRAGMA table_info(product_price_tiers)").all().map(c => c.name);
    if (!tierColumns.includes('qty_unit')) {
      db.prepare("ALTER TABLE product_price_tiers ADD COLUMN qty_unit TEXT DEFAULT 'pcs'").run();
    }
    if (!tierColumns.includes('order_type')) {
      db.prepare("ALTER TABLE product_price_tiers ADD COLUMN order_type TEXT DEFAULT 'ALL'").run();
    }

    const itemColumns2 = db.prepare("PRAGMA table_info(order_items)").all().map(c => c.name);
    if (!itemColumns2.includes('std_weight_g')) {
      db.prepare("ALTER TABLE order_items ADD COLUMN std_weight_g REAL").run();
    }

    // 10. Separate MOQ for Ready Stock and On Order (both start from the old single MOQ)
    const productColumns3 = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);
    if (!productColumns3.includes('moq_ready')) {
      db.prepare("ALTER TABLE products ADD COLUMN moq_ready INTEGER").run();
      db.prepare("UPDATE products SET moq_ready = COALESCE(moq, 1)").run();
    }
    if (!productColumns3.includes('moq_order')) {
      db.prepare("ALTER TABLE products ADD COLUMN moq_order INTEGER").run();
      db.prepare("UPDATE products SET moq_order = COALESCE(moq, 1)").run();
    }

    // 11. Orders: delivery charge by PIN code, full-payment discount and the payment plan chosen
    const orderColumns2 = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
    for (const [col, def] of [['delivery_charge', 'REAL DEFAULT 0'], ['discount_amount', 'REAL DEFAULT 0'], ['payment_plan', 'TEXT']]) {
      if (!orderColumns2.includes(col)) {
        db.prepare(`ALTER TABLE orders ADD COLUMN ${col} ${def}`).run();
      }
    }

    // 12. Customer accounts: PIN code (delivery charges) and the password as the System Admin can read it
    const accountColumns = db.prepare("PRAGMA table_info(customer_accounts)").all().map(c => c.name);
    for (const col of ['pin_code', 'password_enc', 'password_changed_at']) {
      if (!accountColumns.includes(col)) {
        db.prepare(`ALTER TABLE customer_accounts ADD COLUMN ${col} TEXT`).run();
      }
    }

    // 13. One-time: the standard weight is per 20 inches, so a ready stock piece weighs std × size ÷ 20
    const scaled = db.prepare("SELECT value FROM app_settings WHERE key = 'variant_weights_scaled'").get();
    if (!scaled) {
      const now = new Date().toISOString();
      db.transaction(() => {
        db.prepare('UPDATE product_variants SET weight_g = ROUND(std_weight_g * size_inches / 20.0, 3) WHERE std_weight_g > 0').run();
        db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('variant_weights_scaled', '1', ?)").run(now);
      })();
    }

    // 14. Standard weights: making charge slabs by net grams of that weight in an order (JSON array)
    const weightOptionColumns = db.prepare("PRAGMA table_info(product_weight_options)").all().map(c => c.name);
    if (!weightOptionColumns.includes('weight_slabs')) {
      db.prepare("ALTER TABLE product_weight_options ADD COLUMN weight_slabs TEXT").run();
    }

    // 15. Products: every photo in display order (JSON array; image_path keeps the first as the cover)
    const productColumns4 = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);
    if (!productColumns4.includes('image_paths')) {
      db.prepare("ALTER TABLE products ADD COLUMN image_paths TEXT").run();
    }

    // 16. Customer accounts: account type, which sections the customer may see, presence and last location
    const accountColumns2 = db.prepare("PRAGMA table_info(customer_accounts)").all().map(c => c.name);
    const accountAdds = [
      ['account_type', 'TEXT'],
      ['can_view_ready', 'INTEGER NOT NULL DEFAULT 1'],
      ['can_view_order', 'INTEGER NOT NULL DEFAULT 1'],
      ['last_seen_at', 'TEXT'],
      ['last_latitude', 'REAL'],
      ['last_longitude', 'REAL'],
      ['last_location_at', 'TEXT']
    ];
    for (const [col, def] of accountAdds) {
      if (!accountColumns2.includes(col)) {
        db.prepare(`ALTER TABLE customer_accounts ADD COLUMN ${col} ${def}`).run();
      }
    }

    // 17. PINs and the master code were once copied into settings in plain text; nothing reads them
    db.prepare("DELETE FROM app_settings WHERE key IN ('admin_pin', 'master_code')").run();

    // 18. Brand tracking across customers, portal accounts, and orders
    const custCols = db.prepare("PRAGMA table_info(customers)").all().map(c => c.name);
    if (!custCols.includes('brand')) {
      db.prepare("ALTER TABLE customers ADD COLUMN brand TEXT DEFAULT 'AI925'").run();
    }
    const acctCols = db.prepare("PRAGMA table_info(customer_accounts)").all().map(c => c.name);
    if (!acctCols.includes('brand')) {
      db.prepare("ALTER TABLE customer_accounts ADD COLUMN brand TEXT DEFAULT 'AI925'").run();
    }
    const ordCols = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
    if (!ordCols.includes('brand')) {
      db.prepare("ALTER TABLE orders ADD COLUMN brand TEXT DEFAULT 'AI925'").run();
    }

    // 19. State-wise premium pricing rules, custom delivery pincodes, and weight slab discounts
    db.exec(`
      CREATE TABLE IF NOT EXISTS state_premiums (
        id TEXT PRIMARY KEY,
        state TEXT UNIQUE NOT NULL,
        premium_pct REAL NOT NULL DEFAULT 0.0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_state_premiums_state ON state_premiums(state);
    `);

    const existingPremiums = db.prepare('SELECT COUNT(*) as count FROM state_premiums').get();
    if (existingPremiums && existingPremiums.count === 0) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO state_premiums (id, state, premium_pct, is_active, created_at, updated_at)
        VALUES ('prem_goa', 'Goa', 20.0, 1, ?, ?)
      `).run(now, now);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS delivery_pincodes (
        pincode TEXT PRIMARY KEY,
        charge REAL NOT NULL DEFAULT 0,
        city TEXT,
        state TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_delivery_pincodes_state ON delivery_pincodes(state);

      CREATE TABLE IF NOT EXISTS weight_slab_discounts (
        id TEXT PRIMARY KEY,
        min_kg REAL NOT NULL,
        max_kg REAL,
        discount_per_gram REAL NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customer_otps (
        id TEXT PRIMARY KEY,
        destination TEXT NOT NULL,
        otp_hash TEXT NOT NULL,
        otp_plain TEXT,
        purpose TEXT NOT NULL DEFAULT 'LOGIN',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        expires_at TEXT NOT NULL,
        verified_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_customer_otps_lookup ON customer_otps(destination, purpose, expires_at);
    `);

    // Seed default weight slab discounts if table is empty
    const existingSlabs = db.prepare('SELECT COUNT(*) as count FROM weight_slab_discounts').get();
    if (existingSlabs && existingSlabs.count === 0) {
      const now = new Date().toISOString();
      const insertSlab = db.prepare(`
        INSERT INTO weight_slab_discounts (id, min_kg, max_kg, discount_per_gram, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `);
      insertSlab.run('slab_1_2kg', 1.0, 2.0, 2.0, now, now);
      insertSlab.run('slab_2kg_plus', 2.0, null, 4.0, now, now);
    }

    // 9. One-time: give every existing product a standard weight option built from its own fields
    const seeded = db.prepare("SELECT value FROM app_settings WHERE key = 'weight_options_seeded'").get();
    if (!seeded) {
      const now = new Date().toISOString();
      db.transaction(() => {
        const products = db.prepare(`
          SELECT * FROM products p
          WHERE NOT EXISTS (SELECT 1 FROM product_weight_options w WHERE w.product_id = p.id)
        `).all();
        const insert = db.prepare(`
          INSERT INTO product_weight_options (id, product_id, std_weight_g, making_charge, sku_code, wire_size, endings, lock_type, extra, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)
        `);
        for (const p of products) {
          insert.run('wopt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8), p.id,
            p.std_weight_per_20in || 20, p.labour_per_gram || 0, p.sku, p.wire_size || '', p.endings || '', p.lock_type || '', now);
        }
        db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('weight_options_seeded', '1', ?)").run(now);
      })();
    }

    // 21. State on customer_accounts for region-specific pricing
    const acctCols3 = db.prepare("PRAGMA table_info(customer_accounts)").all().map(c => c.name);
    if (!acctCols3.includes('state')) {
      db.prepare("ALTER TABLE customer_accounts ADD COLUMN state TEXT").run();
    }
    const INDIAN_STATES_LIST = [
      'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
      'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
      'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
      'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
      'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
      'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir',
      'Ladakh', 'Chandigarh', 'Puducherry'
    ];
    function inferState(text) {
      if (!text) return null;
      for (const st of INDIAN_STATES_LIST) {
        if (new RegExp(`(^|[^a-zA-Z0-9])${st}([^a-zA-Z0-9]|$)`, 'i').test(String(text))) return st;
      }
      return null;
    }
    const emptyAccts = db.prepare("SELECT id, address FROM customer_accounts WHERE (state IS NULL OR state = '') AND address IS NOT NULL").all();
    for (const a of emptyAccts) {
      const st = inferState(a.address);
      if (st) db.prepare("UPDATE customer_accounts SET state = ? WHERE id = ?").run(st, a.id);
    }
    const emptyCusts = db.prepare("SELECT id, address FROM customers WHERE (state IS NULL OR state = '') AND address IS NOT NULL").all();
    for (const c of emptyCusts) {
      const st = inferState(c.address);
      if (st) db.prepare("UPDATE customers SET state = ? WHERE id = ?").run(st, c.id);
    }
  } catch (migErr) {
    console.warn('Database schema migration notice:', migErr.message);
  }
}

initializeSchema();

module.exports = {
  db,
  DB_PATH,
  DATA_DIR,
  initializeSchema
};
