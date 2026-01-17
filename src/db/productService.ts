import { Product } from "../types";
import {
  deleteProductFromFirestore,
  syncProductToFirestore,
  syncStockQuantityToFirestore,
} from "./firestoreSync";
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

    // Sync to Firestore (fire and forget - don't block on cloud sync)
    const productToSync = await this.getById(fullProduct.id);
    if (productToSync) {
      syncProductToFirestore(productToSync).catch(console.error);
    }
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

    // Sync to Firestore (fire and forget)
    const updatedProduct = await this.getById(product.id);
    if (updatedProduct) {
      syncProductToFirestore(updatedProduct).catch(console.error);
    }
  },

  async delete(id: string): Promise<void> {
    if (!isTauriRuntime()) {
      const products = loadProducts().filter((p) => p.id !== id);
      saveProducts(products);
      return;
    }
    const db = await getDb();
    await db.execute("DELETE FROM products WHERE id = $1", [id]);

    // Delete from Firestore (fire and forget)
    deleteProductFromFirestore(id).catch(console.error);
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

    // Sync updated quantity to Firestore
    const updatedProduct = await this.getById(id);
    if (updatedProduct) {
      syncStockQuantityToFirestore(id, updatedProduct.quantity).catch(console.error);
    }
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
    // Validate thresholdDays to prevent SQL injection (must be a positive integer)
    const safeDays = Math.max(1, Math.min(365, Math.floor(Number(thresholdDays) || 120)));

    const now = new Date();
    const fastCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const slowCutoff = new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000);

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
    // Slow: sold 31 to threshold days ago (using parameterized value via string interpolation is safe here since safeDays is validated as integer)
    await db.execute(
      `UPDATE products SET fsn_classification = 'S' WHERE last_sale_date >= datetime('now', '-${safeDays} days') AND last_sale_date < datetime('now', '-30 days')`
    );
    // Non-moving: not sold in threshold days or never sold
    await db.execute(
      `UPDATE products SET fsn_classification = 'N' WHERE last_sale_date < datetime('now', '-${safeDays} days') OR last_sale_date IS NULL`
    );
  },

  // Disabled for production - no sample data seeding
  async seedData(): Promise<void> {
    // No-op in production
  }
};