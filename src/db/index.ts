import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

/**
 * Closes the current database connection and clears the cached instance.
 * Call this before restore operations to ensure the new database file is used.
 */
export const closeDatabase = async (): Promise<void> => {
  if (db) {
    try {
      await db.close();
      console.log("[DB] Database connection closed");
    } catch (error) {
      console.error("[DB] Error closing database:", error);
    }
    db = null;
  }
};

/**
 * Checks if there's an active database connection
 */
export const isDatabaseConnected = (): boolean => {
  return db !== null;
};

const ensureSchema = async (database: Database) => {
  // ============================================
  // CORE TABLES
  // ============================================

  // ============================================
  // CORE TABLES
  // ============================================

  // Products table
  await database.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT,
      category TEXT,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      barcode TEXT,
      purchase_price REAL DEFAULT 0,
      reorder_level INTEGER DEFAULT 5,
      max_stock INTEGER,
      last_sale_date TEXT,
      fsn_classification TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Invoices table
  await database.execute(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      discount_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      payment_mode TEXT DEFAULT 'cash',
      is_return INTEGER DEFAULT 0,
      original_invoice_id TEXT,
      return_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(original_invoice_id) REFERENCES invoices(id)
    )
  `);

  // Invoice Items table
  await database.execute(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      cost_price REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `);

  // Indexes for Core Tables
  await database.execute("CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)");
  await database.execute("CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)");
  await database.execute("CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)");
  await database.execute("CREATE INDEX IF NOT EXISTS idx_products_last_sale_date ON products(last_sale_date)");
  await database.execute("CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)");
  await database.execute("CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_id)");
  await database.execute("CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at)");

  // ============================================
  // SETTINGS TABLE
  // ============================================
  await database.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default settings if not present
  const defaultSettings = [
    ['low_stock_method', 'reorder_level'],
    ['low_stock_percentage', '20'],
    ['low_stock_days_supply', '15'],
    ['non_moving_threshold_days', '120'],
    ['auto_backup_enabled', '1'],
    ['auto_backup_time', '23:00'],
    ['backup_retention_days', '30'],
  ];
  for (const [key, value] of defaultSettings) {
    await database.execute(
      "INSERT OR IGNORE INTO settings (key, value) VALUES ($1, $2)",
      [key, value]
    );
  }

  // ============================================
  // STOCK ADJUSTMENTS TABLE
  // ============================================
  await database.execute(`
    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      adjustment_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      notes TEXT,
      created_by TEXT DEFAULT 'system',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `);

  await database.execute("CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product ON stock_adjustments(product_id)");
  await database.execute("CREATE INDEX IF NOT EXISTS idx_stock_adjustments_date ON stock_adjustments(created_at)");
  await database.execute("CREATE INDEX IF NOT EXISTS idx_stock_adjustments_type ON stock_adjustments(adjustment_type)");

  // ============================================
  // SALES RETURNS TABLES
  // ============================================
  await database.execute(`
    CREATE TABLE IF NOT EXISTS sales_returns (
      id TEXT PRIMARY KEY,
      return_no TEXT UNIQUE NOT NULL,
      invoice_id TEXT NOT NULL,
      return_date TEXT NOT NULL,
      reason TEXT NOT NULL,
      total_amount REAL NOT NULL,
      notes TEXT,
      status TEXT DEFAULT 'completed',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id)
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS return_items (
      id TEXT PRIMARY KEY,
      return_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      rate REAL NOT NULL,
      line_total REAL NOT NULL,
      FOREIGN KEY(return_id) REFERENCES sales_returns(id) ON DELETE CASCADE,
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `);

  await database.execute("CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice ON sales_returns(invoice_id)");
  await database.execute("CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON sales_returns(return_date)");
  await database.execute("CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id)");

  // ============================================
  // BACKUP LOG TABLE
  // ============================================
  await database.execute(`
    CREATE TABLE IF NOT EXISTS backup_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_file TEXT NOT NULL,
      backup_date TEXT NOT NULL,
      backup_type TEXT DEFAULT 'auto',
      file_size INTEGER,
      status TEXT DEFAULT 'success',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await database.execute("CREATE INDEX IF NOT EXISTS idx_backup_log_date ON backup_log(backup_date)");

  // ============================================
  // USERS TABLE
  // ============================================
  await database.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await database.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)");
  await database.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)");

  // Seed default admin user if no users exist
  const userCount = await database.select<{ count: number }[]>("SELECT COUNT(*) as count FROM users");
  if (userCount[0].count === 0) {
    // Default admin: username "admin", password "admin123"
    // SHA-256 hash of "admin123"
    const defaultAdminHash = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";
    await database.execute(
      `INSERT INTO users (id, username, password_hash, role, name) VALUES ($1, $2, $3, $4, $5)`,
      ["user-admin-default", "admin", defaultAdminHash, "admin", "Administrator"]
    );
  }


  // ============================================
  // MIGRATIONS FOR OLDER DATABASES
  // ============================================

  // Products table migrations
  const productCols = await database.select<{ name: string }[]>("PRAGMA table_info(products)");
  const productColNames = new Set(productCols.map(c => c.name));

  if (!productColNames.has("category")) {
    await database.execute("ALTER TABLE products ADD COLUMN category TEXT");
  }
  if (!productColNames.has("barcode")) {
    await database.execute("ALTER TABLE products ADD COLUMN barcode TEXT");
  }
  if (!productColNames.has("purchase_price")) {
    await database.execute("ALTER TABLE products ADD COLUMN purchase_price REAL DEFAULT 0");
  }
  if (!productColNames.has("reorder_level")) {
    await database.execute("ALTER TABLE products ADD COLUMN reorder_level INTEGER DEFAULT 5");
  }
  if (!productColNames.has("max_stock")) {
    await database.execute("ALTER TABLE products ADD COLUMN max_stock INTEGER");
  }
  if (!productColNames.has("last_sale_date")) {
    await database.execute("ALTER TABLE products ADD COLUMN last_sale_date TEXT");
  }
  if (!productColNames.has("fsn_classification")) {
    await database.execute("ALTER TABLE products ADD COLUMN fsn_classification TEXT");
  }

  // Invoices table migrations
  const invoiceCols = await database.select<{ name: string }[]>("PRAGMA table_info(invoices)");
  const invoiceColNames = new Set(invoiceCols.map(c => c.name));

  if (!invoiceColNames.has("discount_amount")) {
    await database.execute("ALTER TABLE invoices ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0");
  }
  if (!invoiceColNames.has("customer_phone")) {
    await database.execute("ALTER TABLE invoices ADD COLUMN customer_phone TEXT");
  }
  if (!invoiceColNames.has("payment_mode")) {
    await database.execute("ALTER TABLE invoices ADD COLUMN payment_mode TEXT DEFAULT 'cash'");
  }
  if (!invoiceColNames.has("is_return")) {
    await database.execute("ALTER TABLE invoices ADD COLUMN is_return INTEGER DEFAULT 0");
  }
  if (!invoiceColNames.has("original_invoice_id")) {
    await database.execute("ALTER TABLE invoices ADD COLUMN original_invoice_id TEXT");
  }
  if (!invoiceColNames.has("return_reason")) {
    await database.execute("ALTER TABLE invoices ADD COLUMN return_reason TEXT");
  }

  // Invoice Items table migrations
  const invoiceItemCols = await database.select<{ name: string }[]>("PRAGMA table_info(invoice_items)");
  const invoiceItemColNames = new Set(invoiceItemCols.map(c => c.name));

  if (!invoiceItemColNames.has("cost_price")) {
    await database.execute("ALTER TABLE invoice_items ADD COLUMN cost_price REAL NOT NULL DEFAULT 0");
  }

  // Create any missing indexes
  await database.execute("CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)");
  await database.execute("CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)");
  await database.execute("CREATE INDEX IF NOT EXISTS idx_products_last_sale_date ON products(last_sale_date)");
  await database.execute("CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_id)");
  await database.execute("CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at)");
};

const migrateProductsSkuNullable = async (database: Database) => {
  // If the existing DB was created with sku NOT NULL, inserts with sku=null will fail.
  // SQLite cannot drop NOT NULL, so we recreate the table safely.
  const columns = await database.select<{ name: string; notnull: number }[]>(
    "PRAGMA table_info(products)"
  );
  const skuCol = columns.find((c) => c.name === "sku");
  if (!skuCol || skuCol.notnull === 0) return;

  await database.execute(`
    PRAGMA foreign_keys=OFF;
    BEGIN;

    ALTER TABLE products RENAME TO products_old;

    CREATE TABLE products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT,
      category TEXT,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      barcode TEXT,
      purchase_price REAL DEFAULT 0,
      reorder_level INTEGER DEFAULT 5,
      max_stock INTEGER,
      last_sale_date TEXT,
      fsn_classification TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO products (id, name, sku, category, price, quantity, barcode, purchase_price, reorder_level, max_stock, last_sale_date, fsn_classification, created_at, updated_at)
    SELECT id, name, sku, category, price, quantity, barcode, COALESCE(purchase_price, 0), COALESCE(reorder_level, 5), max_stock, last_sale_date, fsn_classification, created_at, updated_at
    FROM products_old;

    DROP TABLE products_old;

    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_last_sale_date ON products(last_sale_date);

    COMMIT;
    PRAGMA foreign_keys=ON;
  `);
};

export const getDb = async () => {
  if (db) return db;

  // Use the plugin-managed SQLite path (app data dir) consistently.
  // This also matches the connection name used by the Tauri plugin.
  db = await Database.load("sqlite:motormods.db");
  await ensureSchema(db);
  await migrateProductsSkuNullable(db);
  return db;
};
