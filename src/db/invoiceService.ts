import { Invoice, InvoiceItem } from "../types";
import { getDb } from "./index";
import { productService } from "./productService";
import { isTauriRuntime } from "./runtime";
import { stockAdjustmentService } from "./stockAdjustmentService";

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
  async createInvoice(invoice: Invoice, items: Omit<InvoiceItem, "invoice_id">[]): Promise<void> {
    if (!isTauriRuntime()) {
      const invoices = loadInvoices();
      const invoiceItems = loadInvoiceItems();

      // Stock validation (web)
      const products = await productService.getAll();
      const byId = new Map(products.map((p) => [p.id, p] as const));
      for (const item of items) {
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

        // Deduct stock and log adjustment
        await productService.updateQuantity(item.product_id, -item.quantity);
        await productService.updateLastSaleDate(item.product_id);
        await stockAdjustmentService.create(
          item.product_id,
          'sale',
          -item.quantity,
          `Invoice ${invoice.id.slice(0, 8).toUpperCase()}`,
          'system'
        );
      }

      saveInvoices(invoices);
      saveInvoiceItems(invoiceItems);
      return;
    }

    const db = await getDb();

    // Stock validation (desktop)
    const productCosts = new Map<string, number>();
    for (const item of items) {
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
      "INSERT INTO invoices (id, customer_name, customer_phone, discount_amount, total_amount, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [invoice.id, invoice.customer_name, invoice.customer_phone ?? null, invoice.discount_amount ?? 0, invoice.total_amount, createdAt]
    );

    for (const item of items) {
      const costPrice = item.cost_price ?? productCosts.get(item.product_id) ?? 0;
      await db.execute(
        "INSERT INTO invoice_items (id, invoice_id, product_id, quantity, price, cost_price) VALUES ($1, $2, $3, $4, $5, $6)",
        [item.id, invoice.id, item.product_id, item.quantity, item.price, costPrice]
      );

      // Deduct stock and log adjustment
      await productService.updateQuantity(item.product_id, -item.quantity);
      await productService.updateLastSaleDate(item.product_id);
      await stockAdjustmentService.create(
        item.product_id,
        'sale',
        -item.quantity,
        `Invoice ${invoice.id.slice(0, 8).toUpperCase()}`,
        'system'
      );
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
      "SELECT id, customer_name, customer_phone, discount_amount, total_amount, created_at FROM invoices ORDER BY created_at DESC"
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

  async getStats(): Promise<{ totalInvoices: number; totalRevenue: number; todayRevenue: number; thisMonthCount: number }> {
    if (!isTauriRuntime()) {
      const invoices = loadInvoices();
      const totalInvoices = invoices.length;
      const totalRevenue = invoices.reduce((sum, i) => sum + (i.total_amount ?? 0), 0);

      const now = new Date();
      const todayKey = now.toDateString();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const todayRevenue = invoices
        .filter((i) => new Date(i.created_at).toDateString() === todayKey)
        .reduce((sum, i) => sum + (i.total_amount ?? 0), 0);

      const thisMonthCount = invoices.filter((i) => {
        const d = new Date(i.created_at);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return k === monthKey;
      }).length;

      return { totalInvoices, totalRevenue, todayRevenue, thisMonthCount };
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

    return {
      totalInvoices: totalResult[0]?.count ?? 0,
      totalRevenue: totalResult[0]?.total ?? 0,
      todayRevenue: todayResult[0]?.total ?? 0,
      thisMonthCount: monthResult[0]?.count ?? 0,
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

    const todayRevenue = todayResult[0]?.revenue ?? 0;
    const todayCost = todayResult[0]?.cost ?? 0;
    const thisMonthRevenue = monthResult[0]?.revenue ?? 0;
    const thisMonthCost = monthResult[0]?.cost ?? 0;

    return {
      todayProfit: todayRevenue - todayCost,
      todayRevenue,
      todayCost,
      thisMonthProfit: thisMonthRevenue - thisMonthCost,
      thisMonthRevenue,
      thisMonthCost,
      yesterdayProfit: (yesterdayResult[0]?.revenue ?? 0) - (yesterdayResult[0]?.cost ?? 0),
      lastMonthProfit: (lastMonthResult[0]?.revenue ?? 0) - (lastMonthResult[0]?.cost ?? 0),
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

  async seedData(): Promise<void> {
    if (!isTauriRuntime()) {
      const existing = loadInvoices();
      if (existing.length > 0) return;
    } else {
      const db = await getDb();
      const count = await db.select<{ count: number }[]>("SELECT count(*) as count FROM invoices");
      if ((count[0]?.count ?? 0) > 0) return;
    }

    // Sample invoices with different dates
    const now = new Date();
    const sampleInvoices = [
      // Today's invoices
      {
        invoice: {
          id: "inv-001",
          customer_name: "Rajesh Kumar",
          discount_amount: 0,
          total_amount: 3150.00,
          created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        },
        items: [
          { id: "item-001-1", product_id: "p1", quantity: 2, price: 850.00 },
          { id: "item-001-2", product_id: "p6", quantity: 3, price: 450.00 },
          { id: "item-001-3", product_id: "p3", quantity: 1, price: 650.00 },
        ]
      },
      {
        invoice: {
          id: "inv-002",
          customer_name: "Walking Customer",
          discount_amount: 0,
          total_amount: 1270.00,
          created_at: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
        },
        items: [
          { id: "item-002-1", product_id: "p7", quantity: 1, price: 420.00 },
          { id: "item-002-2", product_id: "p10", quantity: 1, price: 850.00 },
        ]
      },
      {
        invoice: {
          id: "inv-003",
          customer_name: "Priya Sharma",
          discount_amount: 0,
          total_amount: 21000.00,
          created_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(), // 30 min ago
        },
        items: [
          { id: "item-003-1", product_id: "p8", quantity: 1, price: 9500.00 },
          { id: "item-003-2", product_id: "p9", quantity: 1, price: 11500.00 },
        ]
      },

      // Yesterday's invoices
      {
        invoice: {
          id: "inv-004",
          customer_name: "Amit Singh",
          discount_amount: 0,
          total_amount: 2400.00,
          created_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 - 5 * 60 * 60 * 1000).toISOString(),
        },
        items: [
          { id: "item-004-1", product_id: "p4", quantity: 1, price: 2400.00 },
        ]
      },
      {
        invoice: {
          id: "inv-005",
          customer_name: "Sneha Patel",
          discount_amount: 0,
          total_amount: 8300.00,
          created_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString(),
        },
        items: [
          { id: "item-005-1", product_id: "p2", quantity: 2, price: 1100.00 },
          { id: "item-005-2", product_id: "p5", quantity: 1, price: 5500.00 },
          { id: "item-005-3", product_id: "p6", quantity: 1, price: 450.00 },
          { id: "item-005-4", product_id: "p3", quantity: 1, price: 650.00 },
        ]
      },

      // 3 days ago
      {
        invoice: {
          id: "inv-006",
          customer_name: "Walking Customer",
          discount_amount: 0,
          total_amount: 1800.00,
          created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
        items: [
          { id: "item-006-1", product_id: "p11", quantity: 3, price: 600.00 },
        ]
      },
      {
        invoice: {
          id: "inv-007",
          customer_name: "Vikram Mehta",
          discount_amount: 0,
          total_amount: 6100.00,
          created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000).toISOString(),
        },
        items: [
          { id: "item-007-1", product_id: "p17", quantity: 1, price: 3200.00 },
          { id: "item-007-2", product_id: "p13", quantity: 4, price: 720.00 },
        ]
      },

      // 5 days ago
      {
        invoice: {
          id: "inv-008",
          customer_name: "Anita Desai",
          discount_amount: 0,
          total_amount: 7400.00,
          created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        items: [
          { id: "item-008-1", product_id: "p18", quantity: 1, price: 3800.00 },
          { id: "item-008-2", product_id: "p16", quantity: 2, price: 1800.00 },
        ]
      },
      {
        invoice: {
          id: "inv-009",
          customer_name: "Rohan Gupta",
          discount_amount: 0,
          total_amount: 4900.00,
          created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000 - 4 * 60 * 60 * 1000).toISOString(),
        },
        items: [
          { id: "item-009-1", product_id: "p19", quantity: 2, price: 2100.00 },
          { id: "item-009-2", product_id: "p12", quantity: 2, price: 350.00 },
        ]
      },

      // 7 days ago
      {
        invoice: {
          id: "inv-010",
          customer_name: "Meera Iyer",
          discount_amount: 0,
          total_amount: 5480.00,
          created_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        items: [
          { id: "item-010-1", product_id: "p20", quantity: 1, price: 2800.00 },
          { id: "item-010-2", product_id: "p21", quantity: 1, price: 1200.00 },
          { id: "item-010-3", product_id: "p22", quantity: 1, price: 1500.00 },
        ]
      },

      // 10 days ago
      {
        invoice: {
          id: "inv-011",
          customer_name: "Karthik Reddy",
          discount_amount: 0,
          total_amount: 3730.00,
          created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        },
        items: [
          { id: "item-011-1", product_id: "p23", quantity: 2, price: 950.00 },
          { id: "item-011-2", product_id: "p24", quantity: 1, price: 1800.00 },
        ]
      },
      {
        invoice: {
          id: "inv-012",
          customer_name: "Walking Customer",
          discount_amount: 0,
          total_amount: 3650.00,
          created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString(),
        },
        items: [
          { id: "item-012-1", product_id: "p14", quantity: 4, price: 680.00 },
          { id: "item-012-2", product_id: "p26", quantity: 3, price: 380.00 },
          { id: "item-012-3", product_id: "p27", quantity: 2, price: 420.00 },
        ]
      },

      // 15 days ago
      {
        invoice: {
          id: "inv-013",
          customer_name: "Deepak Joshi",
          discount_amount: 0,
          total_amount: 6280.00,
          created_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        },
        items: [
          { id: "item-013-1", product_id: "p25", quantity: 2, price: 2200.00 },
          { id: "item-013-2", product_id: "p29", quantity: 2, price: 680.00 },
          { id: "item-013-3", product_id: "p30", quantity: 1, price: 550.00 },
          { id: "item-013-4", product_id: "p28", quantity: 1, price: 180.00 },
        ]
      },

      // 20 days ago
      {
        invoice: {
          id: "inv-014",
          customer_name: "Sunita Agarwal",
          discount_amount: 0,
          total_amount: 2650.00,
          created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        },
        items: [
          { id: "item-014-1", product_id: "p1", quantity: 3, price: 850.00 },
          { id: "item-014-2", product_id: "p15", quantity: 2, price: 280.00 },
        ]
      },
      {
        invoice: {
          id: "inv-015",
          customer_name: "Arjun Malhotra",
          discount_amount: 0,
          total_amount: 12300.00,
          created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000 - 5 * 60 * 60 * 1000).toISOString(),
        },
        items: [
          { id: "item-015-1", product_id: "p8", quantity: 1, price: 9500.00 },
          { id: "item-015-2", product_id: "p20", quantity: 1, price: 2800.00 },
        ]
      },
    ];

    // Insert all sample invoices
    for (const { invoice, items } of sampleInvoices) {
      await this.createInvoiceWithoutStockDeduction(invoice, items);
    }

    console.log(`Seeded ${sampleInvoices.length} sample invoices with transactions`);
  }
};
