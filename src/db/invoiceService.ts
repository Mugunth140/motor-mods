import { Invoice, InvoiceItem } from "../types";
import { getDb } from "./index";
import { productService } from "./productService";
import { isTauriRuntime } from "./runtime";
import { stockAdjustmentService } from "./stockAdjustmentService";

// Import for returns deduction
const RETURNS_KEY = "motormods_sales_returns_v1";

// Helper to load returns from localStorage (web fallback)
const loadReturnsForDeduction = (): Array<{ return_date: string; total_amount: number; status: string }> => {
  try {
    const raw = localStorage.getItem(RETURNS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const INVOICES_KEY = "motormods_invoices_v1";
const INVOICE_ITEMS_KEY = "motormods_invoice_items_v1";

const loadInvoices = (): Invoice[] => {
  try {
    const raw = localStorage.getItem(INVOICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Invoice[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveInvoices = (invoices: Invoice[]) => {
  localStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));
};

const loadInvoiceItems = (): InvoiceItem[] => {
  try {
    const raw = localStorage.getItem(INVOICE_ITEMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InvoiceItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveInvoiceItems = (items: InvoiceItem[]) => {
  localStorage.setItem(INVOICE_ITEMS_KEY, JSON.stringify(items));
};

export const invoiceService = {
  async createInvoice(
    invoice: Invoice,
    items: Omit<InvoiceItem, "invoice_id">[],
    options?: { skipStockValidationItemIds?: string[] }
  ): Promise<void> {
    const skipValidationSet = new Set(options?.skipStockValidationItemIds ?? []);

    if (!isTauriRuntime()) {
      const invoices = loadInvoices();
      const invoiceItems = loadInvoiceItems();

      // Stock validation (web)
      const products = await productService.getAll();
      const byId = new Map(products.map((p) => [p.id, p] as const));
      for (const item of items) {
        if (skipValidationSet.has(item.id)) {
          continue;
        }

        const p = byId.get(item.product_id);
        const available = p?.quantity ?? 0;
        if (available < item.quantity) {
          throw new Error(
            `Insufficient stock for ${p?.name ?? item.product_id}. Available ${available}, requested ${item.quantity}.`
          );
        }
      }

      const createdAt = invoice.created_at || new Date().toISOString();
      const nextInvoice: Invoice = {
        ...invoice,
        customer_phone: invoice.customer_phone ?? null,
        discount_amount: invoice.discount_amount ?? 0,
        created_at: createdAt,
      };

      const idx = invoices.findIndex((i) => i.id === invoice.id);
      if (idx >= 0) invoices[idx] = nextInvoice;
      else invoices.push(nextInvoice);

      for (const item of items) {
        const product = byId.get(item.product_id);
        const costPrice = product?.purchase_price ?? 0;
        const nextItem: InvoiceItem = {
          ...item,
          invoice_id: invoice.id,
          cost_price: item.cost_price ?? costPrice,
        };
        const itemIdx = invoiceItems.findIndex((x) => x.id === item.id);
        if (itemIdx >= 0) invoiceItems[itemIdx] = nextItem;
        else invoiceItems.push(nextItem);

        const isManualBilled = skipValidationSet.has(item.id);

        // Deduct stock only for regular inventory-tracked items.
        if (!isManualBilled) {
          await productService.updateQuantity(item.product_id, -item.quantity);
        }

        await productService.updateLastSaleDate(item.product_id);

        if (!isManualBilled) {
          await stockAdjustmentService.create(
            item.product_id,
            'sale',
            -item.quantity,
            `Invoice ${invoice.id.slice(0, 8).toUpperCase()}`,
            'system'
          );
        }
      }

      saveInvoices(invoices);
      saveInvoiceItems(invoiceItems);
      return;
    }

    const db = await getDb();

    // Stock validation (desktop)
    const productCosts = new Map<string, number>();
    for (const item of items) {
      if (skipValidationSet.has(item.id)) {
        productCosts.set(item.product_id, item.cost_price ?? 0);
        continue;
      }

      const rows = await db.select<{ quantity: number; name: string; purchase_price: number }[]>(
        "SELECT quantity, name, purchase_price FROM products WHERE id = $1",
        [item.product_id]
      );
      const available = rows[0]?.quantity ?? 0;
      const name = rows[0]?.name ?? item.product_id;
      const purchasePrice = rows[0]?.purchase_price ?? 0;
      productCosts.set(item.product_id, purchasePrice);
      if (available < item.quantity) {
        throw new Error(`Insufficient stock for ${name}. Available ${available}, requested ${item.quantity}.`);
      }
    }

    // Start a transaction if possible, but tauri-plugin-sql handles simple queries.
    // We'll run them sequentially for now.

    const createdAt = invoice.created_at || new Date().toISOString();
    await db.execute(
      "INSERT INTO invoices (id, customer_name, customer_phone, discount_amount, total_amount, payment_mode, sale_type, store_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [invoice.id, invoice.customer_name, invoice.customer_phone ?? null, invoice.discount_amount ?? 0, invoice.total_amount, invoice.payment_mode ?? 'cash', invoice.sale_type ?? 'retail', invoice.store_id ?? null, createdAt]
    );

    for (const item of items) {
      const costPrice = item.cost_price ?? productCosts.get(item.product_id) ?? 0;
      await db.execute(
        "INSERT INTO invoice_items (id, invoice_id, product_id, quantity, price, cost_price) VALUES ($1, $2, $3, $4, $5, $6)",
        [item.id, invoice.id, item.product_id, item.quantity, item.price, costPrice]
      );

      const isManualBilled = skipValidationSet.has(item.id);

      // Deduct stock only for regular inventory-tracked items.
      if (!isManualBilled) {
        await productService.updateQuantity(item.product_id, -item.quantity);
      }

      await productService.updateLastSaleDate(item.product_id);

      if (!isManualBilled) {
        await stockAdjustmentService.create(
          item.product_id,
          'sale',
          -item.quantity,
          `Invoice ${invoice.id.slice(0, 8).toUpperCase()}`,
          'system'
        );
      }
    }
  },

  async getAll(): Promise<Invoice[]> {
    if (!isTauriRuntime()) {
      return loadInvoices().sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    const db = await getDb();
    return await db.select<Invoice[]>(
      "SELECT i.id, i.customer_name, i.customer_phone, i.discount_amount, i.total_amount, i.created_at, i.payment_mode, i.sale_type, i.store_id, s.store_name FROM invoices i LEFT JOIN wholesale_stores s ON i.store_id = s.id ORDER BY i.created_at DESC"
    );
  },

  async getItems(invoiceId: string): Promise<InvoiceItem[]> {
    if (!isTauriRuntime()) {
      const items = loadInvoiceItems().filter((x) => x.invoice_id === invoiceId);
      const products = await productService.getAll();
      const byId = new Map(products.map((p) => [p.id, p] as const));
      return items.map((it) => ({
        ...it,
        cost_price: it.cost_price ?? 0,
        product_name: byId.get(it.product_id)?.name,
      }));
    }
    const db = await getDb();
    return await db.select<InvoiceItem[]>(
      `SELECT 
        ii.id, 
        ii.invoice_id, 
        ii.product_id, 
        ii.quantity, 
        ii.price,
        COALESCE(ii.cost_price, 0) as cost_price,
        p.name as product_name
      FROM invoice_items ii
      LEFT JOIN products p ON ii.product_id = p.id
      WHERE ii.invoice_id = $1`,
      [invoiceId]
    );
  },

  async getById(invoiceId: string): Promise<Invoice | null> {
    if (!isTauriRuntime()) {
      const invoices = loadInvoices();
      return invoices.find((i) => i.id === invoiceId) ?? null;
    }
    const db = await getDb();
    const result = await db.select<Invoice[]>(
      "SELECT id, customer_name, customer_phone, discount_amount, total_amount, created_at FROM invoices WHERE id = $1",
      [invoiceId]
    );
    return result.length > 0 ? result[0] : null;
  },

  async getStats(): Promise<{ totalInvoices: number; totalRevenue: number; todayRevenue: number; thisMonthCount: number; todayReturns: number; totalReturns: number }> {
    if (!isTauriRuntime()) {
      const invoices = loadInvoices();
      const returns = loadReturnsForDeduction().filter(r => r.status === 'completed');
      const totalInvoices = invoices.length;
      const grossRevenue = invoices.reduce((sum, i) => sum + (i.total_amount ?? 0), 0);
      const totalReturnsAmount = returns.reduce((sum, r) => sum + (r.total_amount ?? 0), 0);

      const now = new Date();
      const todayKey = now.toDateString();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const grossTodayRevenue = invoices
        .filter((i) => new Date(i.created_at).toDateString() === todayKey)
        .reduce((sum, i) => sum + (i.total_amount ?? 0), 0);

      const todayReturnsAmount = returns
        .filter((r) => new Date(r.return_date).toDateString() === todayKey)
        .reduce((sum, r) => sum + (r.total_amount ?? 0), 0);

      const thisMonthCount = invoices.filter((i) => {
        const d = new Date(i.created_at);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return k === monthKey;
      }).length;

      return {
        totalInvoices,
        totalRevenue: grossRevenue - totalReturnsAmount,
        todayRevenue: grossTodayRevenue - todayReturnsAmount,
        thisMonthCount,
        todayReturns: todayReturnsAmount,
        totalReturns: totalReturnsAmount,
      };
    }

    const db = await getDb();

    const totalResult = await db.select<{ count: number; total: number }[]>(
      "SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM invoices"
    );

    const todayResult = await db.select<{ total: number }[]>(
      "SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE date(created_at) = date('now')"
    );

    const monthResult = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM invoices WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
    );

    // Get returns to subtract
    const totalReturnsResult = await db.select<{ total: number }[]>(
      "SELECT COALESCE(SUM(total_amount), 0) as total FROM sales_returns WHERE status = 'completed'"
    );

    const todayReturnsResult = await db.select<{ total: number }[]>(
      "SELECT COALESCE(SUM(total_amount), 0) as total FROM sales_returns WHERE status = 'completed' AND date(return_date) = date('now')"
    );

    const totalReturnsAmount = totalReturnsResult[0]?.total ?? 0;
    const todayReturnsAmount = todayReturnsResult[0]?.total ?? 0;

    return {
      totalInvoices: totalResult[0]?.count ?? 0,
      totalRevenue: (totalResult[0]?.total ?? 0) - totalReturnsAmount,
      todayRevenue: (todayResult[0]?.total ?? 0) - todayReturnsAmount,
      thisMonthCount: monthResult[0]?.count ?? 0,
      todayReturns: todayReturnsAmount,
      totalReturns: totalReturnsAmount,
    };
  },

  async getProfitStats(): Promise<{
    todayProfit: number;
    todayRevenue: number;
    todayCost: number;
    thisMonthProfit: number;
    thisMonthRevenue: number;
    thisMonthCost: number;
    yesterdayProfit: number;
    lastMonthProfit: number;
  }> {
    if (!isTauriRuntime()) {
      const invoices = loadInvoices();
      const invoiceItems = loadInvoiceItems();
      const returns = loadReturnsForDeduction().filter(r => r.status === 'completed');

      const now = new Date();
      const todayKey = now.toDateString();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      let todayRevenue = 0, todayCost = 0;
      let yesterdayRevenue = 0, yesterdayCost = 0;
      let thisMonthRevenue = 0, thisMonthCost = 0;
      let lastMonthRevenue = 0, lastMonthCost = 0;

      for (const inv of invoices) {
        const invDate = new Date(inv.created_at);
        const invDateStr = invDate.toDateString();
        const items = invoiceItems.filter(it => it.invoice_id === inv.id);
        const revenue = inv.total_amount ?? 0;
        const cost = items.reduce((sum, it) => sum + ((it.cost_price ?? 0) * it.quantity), 0);

        if (invDateStr === todayKey) {
          todayRevenue += revenue;
          todayCost += cost;
        }
        if (invDateStr === yesterday) {
          yesterdayRevenue += revenue;
          yesterdayCost += cost;
        }
        if (invDate >= monthStart) {
          thisMonthRevenue += revenue;
          thisMonthCost += cost;
        }
        if (invDate >= lastMonthStart && invDate <= lastMonthEnd) {
          lastMonthRevenue += revenue;
          lastMonthCost += cost;
        }
      }

      // Subtract returns from revenue
      let todayReturnsAmount = 0, yesterdayReturnsAmount = 0;
      let thisMonthReturnsAmount = 0, lastMonthReturnsAmount = 0;

      for (const ret of returns) {
        const retDate = new Date(ret.return_date);
        const retDateStr = retDate.toDateString();
        const amount = ret.total_amount ?? 0;

        if (retDateStr === todayKey) {
          todayReturnsAmount += amount;
        }
        if (retDateStr === yesterday) {
          yesterdayReturnsAmount += amount;
        }
        if (retDate >= monthStart) {
          thisMonthReturnsAmount += amount;
        }
        if (retDate >= lastMonthStart && retDate <= lastMonthEnd) {
          lastMonthReturnsAmount += amount;
        }
      }

      // Apply returns deduction
      todayRevenue -= todayReturnsAmount;
      yesterdayRevenue -= yesterdayReturnsAmount;
      thisMonthRevenue -= thisMonthReturnsAmount;
      lastMonthRevenue -= lastMonthReturnsAmount;

      return {
        todayProfit: todayRevenue - todayCost,
        todayRevenue,
        todayCost,
        thisMonthProfit: thisMonthRevenue - thisMonthCost,
        thisMonthRevenue,
        thisMonthCost,
        yesterdayProfit: yesterdayRevenue - yesterdayCost,
        lastMonthProfit: lastMonthRevenue - lastMonthCost,
      };
    }

    const db = await getDb();

    // Today's stats
    const todayResult = await db.select<{ revenue: number; cost: number }[]>(`
      SELECT 
        COALESCE(SUM(i.total_amount), 0) as revenue,
        COALESCE(SUM(ii.cost_price * ii.quantity), 0) as cost
      FROM invoices i
      LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
      WHERE date(i.created_at) = date('now')
    `);

    // Yesterday's stats
    const yesterdayResult = await db.select<{ revenue: number; cost: number }[]>(`
      SELECT 
        COALESCE(SUM(i.total_amount), 0) as revenue,
        COALESCE(SUM(ii.cost_price * ii.quantity), 0) as cost
      FROM invoices i
      LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
      WHERE date(i.created_at) = date('now', '-1 day')
    `);

    // This month's stats
    const monthResult = await db.select<{ revenue: number; cost: number }[]>(`
      SELECT 
        COALESCE(SUM(i.total_amount), 0) as revenue,
        COALESCE(SUM(ii.cost_price * ii.quantity), 0) as cost
      FROM invoices i
      LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
      WHERE strftime('%Y-%m', i.created_at) = strftime('%Y-%m', 'now')
    `);

    // Last month's stats
    const lastMonthResult = await db.select<{ revenue: number; cost: number }[]>(`
      SELECT 
        COALESCE(SUM(i.total_amount), 0) as revenue,
        COALESCE(SUM(ii.cost_price * ii.quantity), 0) as cost
      FROM invoices i
      LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
      WHERE strftime('%Y-%m', i.created_at) = strftime('%Y-%m', 'now', '-1 month')
    `);

    // Get returns to subtract from profit
    const todayReturns = await db.select<{ total: number }[]>(
      "SELECT COALESCE(SUM(total_amount), 0) as total FROM sales_returns WHERE status = 'completed' AND date(return_date) = date('now')"
    );
    const yesterdayReturns = await db.select<{ total: number }[]>(
      "SELECT COALESCE(SUM(total_amount), 0) as total FROM sales_returns WHERE status = 'completed' AND date(return_date) = date('now', '-1 day')"
    );
    const thisMonthReturns = await db.select<{ total: number }[]>(
      "SELECT COALESCE(SUM(total_amount), 0) as total FROM sales_returns WHERE status = 'completed' AND strftime('%Y-%m', return_date) = strftime('%Y-%m', 'now')"
    );
    const lastMonthReturns = await db.select<{ total: number }[]>(
      "SELECT COALESCE(SUM(total_amount), 0) as total FROM sales_returns WHERE status = 'completed' AND strftime('%Y-%m', return_date) = strftime('%Y-%m', 'now', '-1 month')"
    );

    // Subtract returns from revenue
    const todayRevenue = (todayResult[0]?.revenue ?? 0) - (todayReturns[0]?.total ?? 0);
    const todayCost = todayResult[0]?.cost ?? 0;
    const yesterdayRevenue = (yesterdayResult[0]?.revenue ?? 0) - (yesterdayReturns[0]?.total ?? 0);
    const yesterdayCost = yesterdayResult[0]?.cost ?? 0;
    const thisMonthRevenue = (monthResult[0]?.revenue ?? 0) - (thisMonthReturns[0]?.total ?? 0);
    const thisMonthCost = monthResult[0]?.cost ?? 0;
    const lastMonthRevenue = (lastMonthResult[0]?.revenue ?? 0) - (lastMonthReturns[0]?.total ?? 0);
    const lastMonthCost = lastMonthResult[0]?.cost ?? 0;

    return {
      todayProfit: todayRevenue - todayCost,
      todayRevenue,
      todayCost,
      thisMonthProfit: thisMonthRevenue - thisMonthCost,
      thisMonthRevenue,
      thisMonthCost,
      yesterdayProfit: yesterdayRevenue - yesterdayCost,
      lastMonthProfit: lastMonthRevenue - lastMonthCost,
    };
  },

  async createInvoiceWithoutStockDeduction(invoice: Invoice, items: Omit<InvoiceItem, "invoice_id">[]): Promise<void> {
    if (!isTauriRuntime()) {
      const invoices = loadInvoices();
      const invoiceItems = loadInvoiceItems();

      const nextInvoice: Invoice = {
        ...invoice,
        discount_amount: invoice.discount_amount ?? 0,
        created_at: invoice.created_at || new Date().toISOString(),
      };

      const idx = invoices.findIndex((i) => i.id === invoice.id);
      if (idx >= 0) invoices[idx] = nextInvoice;
      else invoices.push(nextInvoice);

      for (const item of items) {
        const nextItem: InvoiceItem = { ...item, invoice_id: invoice.id };
        const itemIdx = invoiceItems.findIndex((x) => x.id === item.id);
        if (itemIdx >= 0) invoiceItems[itemIdx] = nextItem;
        else invoiceItems.push(nextItem);
      }

      saveInvoices(invoices);
      saveInvoiceItems(invoiceItems);
      return;
    }

    const db = await getDb();

    await db.execute(
      "INSERT INTO invoices (id, customer_name, discount_amount, total_amount, created_at) VALUES ($1, $2, $3, $4, $5)",
      [invoice.id, invoice.customer_name, invoice.discount_amount ?? 0, invoice.total_amount, invoice.created_at]
    );

    for (const item of items) {
      await db.execute(
        "INSERT INTO invoice_items (id, invoice_id, product_id, quantity, price) VALUES ($1, $2, $3, $4, $5)",
        [item.id, invoice.id, item.product_id, item.quantity, item.price]
      );
    }
  },

  // Disabled for production - no sample data seeding
  async seedData(): Promise<void> {
    // No-op in production
  },

  async deleteInvoice(invoiceId: string): Promise<void> {
    if (!isTauriRuntime()) {
      const invoices = loadInvoices();
      const invoiceItems = loadInvoiceItems();
      
      // Filter out the invoice and its items
      const filteredInvoices = invoices.filter(inv => inv.id !== invoiceId);
      const filteredItems = invoiceItems.filter(item => item.invoice_id !== invoiceId);
      
      saveInvoices(filteredInvoices);
      saveInvoiceItems(filteredItems);
      return;
    }

    const db = await getDb();
    
    // Delete invoice items first (foreign key constraint)
    await db.execute("DELETE FROM invoice_items WHERE invoice_id = $1", [invoiceId]);
    
    // Delete the invoice
    await db.execute("DELETE FROM invoices WHERE id = $1", [invoiceId]);
  }
};
