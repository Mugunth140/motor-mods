import { Product } from "../types";
import { getDb } from "./index";
import { isTauriRuntime } from "./runtime";

const STORAGE_KEY = "motormods_products_v1";

const loadProducts = (): Product[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Product[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const saveProducts = (products: Product[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
};

const ensureProductsCategoryColumn = async (db: { select: Function; execute: Function }) => {
  const columns = (await db.select("PRAGMA table_info(products)")) as { name: string }[];
  const hasCategory = Array.isArray(columns) && columns.some((c) => c.name === "category");
  if (hasCategory) return;

  await db.execute("ALTER TABLE products ADD COLUMN category TEXT");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)");
};

export const productService = {
  async getAll(): Promise<Product[]> {
    if (!isTauriRuntime()) {
      return loadProducts().sort((a, b) => a.name.localeCompare(b.name));
    }
    const db = await getDb();
    await ensureProductsCategoryColumn(db);
    return await db.select<Product[]>(
      "SELECT id, name, sku, category, price, purchase_price, quantity, reorder_level, barcode, updated_at FROM products ORDER BY name ASC"
    );
  },

  async getById(id: string): Promise<Product | null> {
    if (!isTauriRuntime()) {
      const products = loadProducts();
      return products.find((p) => p.id === id) ?? null;
    }
    const db = await getDb();
    await ensureProductsCategoryColumn(db);
    const result = await db.select<Product[]>(
      "SELECT id, name, sku, category, price, purchase_price, quantity, reorder_level, barcode, updated_at FROM products WHERE id = $1",
      [id]
    );
    return result.length > 0 ? result[0] : null;
  },

  async add(product: Partial<Product> & Pick<Product, 'id' | 'name' | 'price' | 'quantity'>): Promise<void> {
    const fullProduct = {
      ...product,
      sku: product.sku ?? null,
      category: product.category ?? null,
      barcode: product.barcode ?? null,
      purchase_price: product.purchase_price ?? 0,
      reorder_level: product.reorder_level ?? 5,
      max_stock: product.max_stock ?? null,
      last_sale_date: product.last_sale_date ?? null,
      fsn_classification: product.fsn_classification ?? null,
    };

    if (!isTauriRuntime()) {
      const now = new Date().toISOString();
      const products = loadProducts();
      const next: Product = {
        ...fullProduct,
        updated_at: now,
      } as Product;
      const idx = products.findIndex((p) => p.id === product.id);
      if (idx >= 0) products[idx] = next;
      else products.push(next);
      saveProducts(products);
      return;
    }
    const db = await getDb();

    // Defensive migration: some older DBs may not have category column.
    await ensureProductsCategoryColumn(db);

    await db.execute(
      `INSERT INTO products (id, name, sku, category, price, quantity, barcode, purchase_price, reorder_level, max_stock)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        fullProduct.id, fullProduct.name, fullProduct.sku, fullProduct.category,
        fullProduct.price, fullProduct.quantity, fullProduct.barcode,
        fullProduct.purchase_price, fullProduct.reorder_level, fullProduct.max_stock
      ]
    );
  },

  async update(product: Product): Promise<void> {
    if (!isTauriRuntime()) {
      const products = loadProducts();
      const idx = products.findIndex((p) => p.id === product.id);
      if (idx < 0) return;
      products[idx] = { ...product, updated_at: new Date().toISOString() };
      saveProducts(products);
      return;
    }
    const db = await getDb();

    // Defensive migration: some older DBs may not have category column.
    await ensureProductsCategoryColumn(db);

    await db.execute(
      "UPDATE products SET name = $1, sku = $2, category = $3, price = $4, quantity = $5, purchase_price = $6, reorder_level = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8",
      [product.name, product.sku, product.category, product.price, product.quantity, product.purchase_price ?? 0, product.reorder_level ?? 5, product.id]
    );
  },

  async delete(id: string): Promise<void> {
    if (!isTauriRuntime()) {
      const products = loadProducts().filter((p) => p.id !== id);
      saveProducts(products);
      return;
    }
    const db = await getDb();
    await db.execute("DELETE FROM products WHERE id = $1", [id]);
  },

  async updateQuantity(id: string, delta: number): Promise<void> {
    if (!isTauriRuntime()) {
      const products = loadProducts();
      const idx = products.findIndex((p) => p.id === id);
      if (idx < 0) return;
      const nextQty = (products[idx].quantity ?? 0) + delta;
      products[idx] = { ...products[idx], quantity: nextQty, updated_at: new Date().toISOString() };
      saveProducts(products);
      return;
    }
    const db = await getDb();
    await db.execute(
      "UPDATE products SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [delta, id]
    );
  },

  async updateLastSaleDate(id: string): Promise<void> {
    const now = new Date().toISOString();
    if (!isTauriRuntime()) {
      const products = loadProducts();
      const idx = products.findIndex((p) => p.id === id);
      if (idx < 0) return;
      products[idx] = { ...products[idx], last_sale_date: now, updated_at: now };
      saveProducts(products);
      return;
    }
    const db = await getDb();
    await db.execute(
      "UPDATE products SET last_sale_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [now, id]
    );
  },

  async calculateFSN(thresholdDays: number = 120): Promise<void> {
    const now = new Date();
    const fastCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const slowCutoff = new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000);

    if (!isTauriRuntime()) {
      const products = loadProducts();
      for (const p of products) {
        if (!p.last_sale_date) {
          p.fsn_classification = 'N';
        } else {
          const saleDate = new Date(p.last_sale_date);
          if (saleDate >= fastCutoff) {
            p.fsn_classification = 'F';
          } else if (saleDate >= slowCutoff) {
            p.fsn_classification = 'S';
          } else {
            p.fsn_classification = 'N';
          }
        }
      }
      saveProducts(products);
      return;
    }

    const db = await getDb();
    // Fast: sold in last 30 days
    await db.execute(
      `UPDATE products SET fsn_classification = 'F' WHERE last_sale_date >= datetime('now', '-30 days')`
    );
    // Slow: sold 31 to threshold days ago
    await db.execute(
      `UPDATE products SET fsn_classification = 'S' WHERE last_sale_date >= datetime('now', '-${thresholdDays} days') AND last_sale_date < datetime('now', '-30 days')`
    );
    // Non-moving: not sold in threshold days or never sold
    await db.execute(
      `UPDATE products SET fsn_classification = 'N' WHERE last_sale_date < datetime('now', '-${thresholdDays} days') OR last_sale_date IS NULL`
    );
  },


  async seedData(): Promise<void> {
    if (!isTauriRuntime()) {
      const existing = loadProducts();
      if (existing.length > 0) return;
    } else {
      const db = await getDb();
      const count = await db.select<{ count: number }[]>("SELECT count(*) as count FROM products");
      if ((count[0]?.count ?? 0) > 0) return;
    }

    const sampleProducts = [
      { id: "p1", name: "Motul 7100 10W50 1L", sku: "OIL-M-7100-10W50", category: "Oils", price: 850.00, quantity: 24 },
      { id: "p2", name: "Motul 300V 10W40 1L", sku: "OIL-M-300V-10W40", category: "Oils", price: 1100.00, quantity: 12 },
      { id: "p3", name: "NGK Iridium Spark Plug CR9EIX", sku: "SP-NGK-CR9EIX", category: "Spark Plugs", price: 650.00, quantity: 50 },
      { id: "p4", name: "Brembo Brake Pads (Front) - KTM 390", sku: "BP-BREM-KTM390-F", category: "Brake Pads", price: 2400.00, quantity: 8 },
      { id: "p5", name: "K&N Air Filter - Kawasaki Z900", sku: "AF-KN-Z900", category: "Filters", price: 5500.00, quantity: 3 },
      { id: "p6", name: "Chain Lube - Motul C2", sku: "LUBE-M-C2", category: "Maintenance", price: 450.00, quantity: 30 },
      { id: "p7", name: "Chain Clean - Motul C1", sku: "CLEAN-M-C1", category: "Maintenance", price: 420.00, quantity: 25 },
      { id: "p8", name: "Pirelli Diablo Rosso III 110/70 R17", sku: "TYRE-P-DR3-110", category: "Tyres", price: 9500.00, quantity: 4 },
      { id: "p9", name: "Pirelli Diablo Rosso III 150/60 R17", sku: "TYRE-P-DR3-150", category: "Tyres", price: 11500.00, quantity: 4 },
      { id: "p10", name: "Mobile Phone Holder (Aluminum)", sku: "ACC-PH-AL", category: "Accessories", price: 850.00, quantity: 15 },
      { id: "p11", name: "USB Charger Waterproof", sku: "ACC-USB-WP", category: "Accessories", price: 600.00, quantity: 20 },
      { id: "p12", name: "Helmet Cleaner Spray", sku: "ACC-HELM-CL", category: "Accessories", price: 350.00, quantity: 18 },
      { id: "p13", name: "Castrol Power1 4T 10W40 1L", sku: "OIL-C-P1-10W40", category: "Oils", price: 720.00, quantity: 35 },
      { id: "p14", name: "Shell Advance Ultra 10W40 1L", sku: "OIL-SH-ADV-10W40", category: "Oils", price: 680.00, quantity: 28 },
      { id: "p15", name: "Bosch Spark Plug - Universal", sku: "SP-BOSCH-UNI", category: "Spark Plugs", price: 280.00, quantity: 60 },
      { id: "p16", name: "EBC Brake Pads (Rear) - RE 350", sku: "BP-EBC-RE350-R", category: "Brake Pads", price: 1800.00, quantity: 10 },
      { id: "p17", name: "Michelin Pilot Street 90/90 R17", sku: "TYRE-MIC-PS-90", category: "Tyres", price: 3200.00, quantity: 6 },
      { id: "p18", name: "Michelin Pilot Street 110/80 R17", sku: "TYRE-MIC-PS-110", category: "Tyres", price: 3800.00, quantity: 6 },
      { id: "p19", name: "MRF Nylogrip Plus 2.75-18", sku: "TYRE-MRF-NP-275", category: "Tyres", price: 2100.00, quantity: 8 },
      { id: "p20", name: "Ceat Zoom 100/90 R17", sku: "TYRE-CEAT-ZM-100", category: "Tyres", price: 2800.00, quantity: 5 },
      { id: "p21", name: "Bike Cover - Large (Waterproof)", sku: "ACC-COVER-L", category: "Accessories", price: 1200.00, quantity: 12 },
      { id: "p22", name: "Disc Lock with Alarm", sku: "ACC-LOCK-ALARM", category: "Accessories", price: 1500.00, quantity: 8 },
      { id: "p23", name: "LED Headlight Bulb H4", sku: "LIGHT-LED-H4", category: "Lighting", price: 950.00, quantity: 22 },
      { id: "p24", name: "Bar End Mirror Set", sku: "ACC-MIRROR-BAR", category: "Accessories", price: 1800.00, quantity: 7 },
      { id: "p25", name: "Riding Gloves - Full Finger", sku: "GEAR-GLOVE-FF", category: "Gear", price: 2200.00, quantity: 14 },
      { id: "p26", name: "Brake Fluid DOT 4 500ml", sku: "FLUID-BF-DOT4", category: "Fluids", price: 380.00, quantity: 40 },
      { id: "p27", name: "Coolant - Long Life 1L", sku: "FLUID-COOL-LL", category: "Fluids", price: 420.00, quantity: 32 },
      { id: "p28", name: "Battery Terminal Cleaner", sku: "MAINT-BAT-CLN", category: "Maintenance", price: 180.00, quantity: 25 },
      { id: "p29", name: "Multi-Tool Kit 17-in-1", sku: "TOOL-MULTI-17", category: "Tools", price: 680.00, quantity: 15 },
      { id: "p30", name: "Tire Pressure Gauge Digital", sku: "TOOL-GAUGE-DIG", category: "Tools", price: 550.00, quantity: 11 }
    ];

    for (const p of sampleProducts) {
      await this.add(p);
    }
  }
};