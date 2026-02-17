import { BaseDirectory, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { InvoiceRecord, InvoiceRecordItem, PaymentMode, SaleType } from "../types";
import { generateInvoicePdfBytes } from "../utils/generatePDF";
import { getInvoiceFilename } from "../utils/getInvoicePath";
import { getDb } from "./index";
import { isTauriRuntime } from "./runtime";

const INVOICE_RECORDS_KEY = "motormods_invoice_records_v1";

const normalizePhone = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("91")) {
    return `+${digits}`;
  }
  return `+91${digits}`;
};

const formatInvoiceDateKey = (iso: string) => {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

const loadLocalInvoices = (): InvoiceRecord[] => {
  try {
    const raw = localStorage.getItem(INVOICE_RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InvoiceRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalInvoices = (records: InvoiceRecord[]) => {
  localStorage.setItem(INVOICE_RECORDS_KEY, JSON.stringify(records));
};

const generateInvoiceNumberLocal = (records: InvoiceRecord[], iso: string) => {
  const dateKey = formatInvoiceDateKey(iso);
  const todaysCount = records.filter((r) => r.invoice_number.startsWith(dateKey)).length;
  const seq = String(todaysCount + 1).padStart(3, "0");
  return `${dateKey}-${seq}`;
};

const persistInvoicePdf = async (record: InvoiceRecord) => {
  if (!isTauriRuntime()) return;

  const { bytes } = await generateInvoicePdfBytes(record);
  const filename = getInvoiceFilename(record.invoice_number);
  await mkdir("invoices", { baseDir: BaseDirectory.AppConfig, recursive: true });
  await writeFile(`invoices/${filename}`, bytes, { baseDir: BaseDirectory.AppConfig });
};

export const invoiceManagementService = {
  async saveInvoiceRecord(params: {
    invoiceId: string;
    customerName: string | null;
    customerPhone: string | null;
    subtotal: number;
    grandTotal: number;
    discountAmount: number;
    items: InvoiceRecordItem[];
    status?: "pending" | "paid";
    paymentMode?: PaymentMode;
    saleType?: SaleType;
    storeId?: string | null;
    storeName?: string | null;
    storeContactPerson?: string | null;
    storeContactNumber?: string | null;
    storeAddress?: string | null;
    paidAmount?: number;
    outstandingAmount?: number;
    createdAt?: string;
  }): Promise<InvoiceRecord> {
    const createdAt = params.createdAt || new Date().toISOString();
    const normalizedPhone = normalizePhone(params.customerPhone);
    const normalizedStoreContact = normalizePhone(params.storeContactNumber);
    const isCreditSale = (params.paymentMode ?? "cash") === "credit" || (params.status ?? "paid") === "pending";
    const paidAmount = params.paidAmount ?? (isCreditSale ? 0 : params.grandTotal);
    const outstandingAmount = params.outstandingAmount ?? Math.max(0, params.grandTotal - paidAmount);

    if (!isTauriRuntime()) {
      const records = loadLocalInvoices();
      const invoiceNumber = generateInvoiceNumberLocal(records, createdAt);
      const record: InvoiceRecord = {
        id: params.invoiceId,
        invoice_number: invoiceNumber,
        date: createdAt,
        customer_name: params.customerName,
        customer_phone: normalizedPhone,
        subtotal: params.subtotal,
        grand_total: params.grandTotal,
        items: params.items,
        status: params.status ?? "paid",
        payment_mode: params.paymentMode ?? "cash",
        sale_type: params.saleType ?? "retail",
        store_id: params.storeId ?? null,
        store_name: params.storeName ?? null,
        store_contact_person: params.storeContactPerson ?? null,
        store_contact_number: normalizedStoreContact,
        store_address: params.storeAddress ?? null,
        paid_amount: paidAmount,
        outstanding_amount: outstandingAmount,
      };
      records.unshift(record);
      saveLocalInvoices(records);
      return record;
    }

    const db = await getDb();

    const invoiceDateKey = formatInvoiceDateKey(createdAt);
    const countRows = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM invoices WHERE invoice_number LIKE $1",
      [`${invoiceDateKey}-%`]
    );
    const nextSeq = String((countRows[0]?.count ?? 0) + 1).padStart(3, "0");
    const invoiceNumber = `${invoiceDateKey}-${nextSeq}`;

    const itemsJson = JSON.stringify(params.items);

    await db.execute(
      `INSERT OR REPLACE INTO invoices (
        id,
        invoice_number,
        date,
        customer_name,
        customer_phone,
        subtotal,
        discount_amount,
        total_amount,
        grand_total,
        items,
        status,
        payment_mode,
        sale_type,
        store_id,
        is_return,
        original_invoice_id,
        return_reason,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 0, NULL, NULL, $15)`,
      [
        params.invoiceId,
        invoiceNumber,
        createdAt,
        params.customerName ?? "Walking Customer",
        normalizedPhone,
        params.subtotal,
        params.discountAmount,
        params.grandTotal,
        params.grandTotal,
        itemsJson,
        params.status ?? "paid",
        params.paymentMode ?? "cash",
        params.saleType ?? "retail",
        params.storeId ?? null,
        createdAt,
      ]
    );

    const record: InvoiceRecord = {
      id: params.invoiceId,
      invoice_number: invoiceNumber,
      date: createdAt,
      customer_name: params.customerName ?? "Walking Customer",
      customer_phone: normalizedPhone,
      subtotal: params.subtotal,
      grand_total: params.grandTotal,
      items: params.items,
      status: params.status ?? "paid",
      payment_mode: params.paymentMode ?? "cash",
      sale_type: params.saleType ?? "retail",
      store_id: params.storeId ?? null,
      store_name: params.storeName ?? null,
      store_contact_person: params.storeContactPerson ?? null,
      store_contact_number: normalizedStoreContact,
      store_address: params.storeAddress ?? null,
      paid_amount: paidAmount,
      outstanding_amount: outstandingAmount,
    };

    await persistInvoicePdf(record);

    return record;
  },

  async updateInvoiceCustomerDetails(params: {
    invoiceId: string;
    customerName: string | null;
    customerPhone: string | null;
  }): Promise<InvoiceRecord> {
    const customerName = params.customerName?.trim() || "Walking Customer";
    const customerPhone = normalizePhone(params.customerPhone);

    if (!isTauriRuntime()) {
      const records = loadLocalInvoices();
      const index = records.findIndex((record) => record.id === params.invoiceId);
      if (index < 0) {
        throw new Error("Invoice not found");
      }

      const updated: InvoiceRecord = {
        ...records[index],
        customer_name: customerName,
        customer_phone: customerPhone,
      };
      records[index] = updated;
      saveLocalInvoices(records);
      return updated;
    }

    const db = await getDb();
    await db.execute(
      `UPDATE invoices
       SET customer_name = $1, customer_phone = $2
       WHERE id = $3`,
      [customerName, customerPhone, params.invoiceId]
    );

    const updated = await this.getInvoiceRecordById(params.invoiceId);
    if (!updated) {
      throw new Error("Invoice not found after update");
    }

    await persistInvoicePdf(updated);
    return updated;
  },

  async getInvoiceRecords(): Promise<InvoiceRecord[]> {
    if (!isTauriRuntime()) {
      return loadLocalInvoices();
    }

    const db = await getDb();
    const rows = await db.select<{
      id: string;
      invoice_number: string;
      date: string;
      customer_name: string | null;
      customer_phone: string | null;
      subtotal: number;
      grand_total: number;
      items: string | null;
      status: "pending" | "paid" | null;
      payment_mode: string | null;
      sale_type: string | null;
      store_id: string | null;
      store_name: string | null;
      store_contact_person: string | null;
      store_contact_number: string | null;
      store_address: string | null;
      paid_amount: number | null;
    }[]>(
      `SELECT i.id, i.invoice_number, i.date, i.customer_name, i.customer_phone, i.subtotal, i.grand_total, i.items, i.status, i.payment_mode, i.sale_type, i.store_id, s.store_name,
              s.contact_person as store_contact_person, s.contact_number as store_contact_number, s.store_address as store_address,
              COALESCE((SELECT SUM(cp.amount) FROM credit_payments cp WHERE cp.invoice_id = i.id), 0) as paid_amount
       FROM invoices i
       LEFT JOIN wholesale_stores s ON i.store_id = s.id
       WHERE i.invoice_number IS NOT NULL
       ORDER BY i.date DESC`
    );

    return rows.map((row) => {
      const status = row.status === "pending" ? "pending" : "paid";
      const paymentMode = (row.payment_mode as "cash" | "card" | "upi" | "cheque" | "credit") ?? "cash";
      const grandTotal = row.grand_total ?? 0;
      const isCreditSale = paymentMode === "credit" || status === "pending";
      const paidAmount = isCreditSale
        ? status === "pending"
          ? Math.min(grandTotal, row.paid_amount ?? 0)
          : grandTotal
        : grandTotal;

      return {
        id: row.id,
        invoice_number: row.invoice_number,
        date: row.date,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        subtotal: row.subtotal ?? 0,
        grand_total: grandTotal,
        items: row.items ? (JSON.parse(row.items) as InvoiceRecordItem[]) : [],
        status,
        payment_mode: paymentMode,
        sale_type: (row.sale_type as "retail" | "wholesale") ?? "retail",
        store_id: row.store_id ?? null,
        store_name: row.store_name ?? null,
        store_contact_person: row.store_contact_person ?? null,
        store_contact_number: row.store_contact_number ?? null,
        store_address: row.store_address ?? null,
        paid_amount: paidAmount,
        outstanding_amount: Math.max(0, grandTotal - paidAmount),
      };
    });
  },

  async getInvoiceRecordById(id: string): Promise<InvoiceRecord | null> {
    if (!isTauriRuntime()) {
      const records = loadLocalInvoices();
      return records.find((r) => r.id === id) ?? null;
    }

    const db = await getDb();
    const rows = await db.select<{
      id: string;
      invoice_number: string;
      date: string;
      customer_name: string | null;
      customer_phone: string | null;
      subtotal: number;
      grand_total: number;
      items: string | null;
      status: "pending" | "paid" | null;
      payment_mode: string | null;
      sale_type: string | null;
      store_id: string | null;
      store_name: string | null;
      store_contact_person: string | null;
      store_contact_number: string | null;
      store_address: string | null;
      paid_amount: number | null;
    }[]>(
      `SELECT i.id, i.invoice_number, i.date, i.customer_name, i.customer_phone, i.subtotal, i.grand_total, i.items, i.status, i.payment_mode, i.sale_type, i.store_id, s.store_name,
              s.contact_person as store_contact_person, s.contact_number as store_contact_number, s.store_address as store_address,
              COALESCE((SELECT SUM(cp.amount) FROM credit_payments cp WHERE cp.invoice_id = i.id), 0) as paid_amount
       FROM invoices i
       LEFT JOIN wholesale_stores s ON i.store_id = s.id
       WHERE i.id = $1
       LIMIT 1`,
      [id]
    );

    const row = rows[0];
    if (!row) return null;

    const status = row.status === "pending" ? "pending" : "paid";
    const paymentMode = (row.payment_mode as "cash" | "card" | "upi" | "cheque" | "credit") ?? "cash";
    const grandTotal = row.grand_total ?? 0;
    const isCreditSale = paymentMode === "credit" || status === "pending";
    const paidAmount = isCreditSale
      ? status === "pending"
        ? Math.min(grandTotal, row.paid_amount ?? 0)
        : grandTotal
      : grandTotal;

    return {
      id: row.id,
      invoice_number: row.invoice_number,
      date: row.date,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      subtotal: row.subtotal ?? 0,
      grand_total: grandTotal,
      items: row.items ? (JSON.parse(row.items) as InvoiceRecordItem[]) : [],
      status,
      payment_mode: paymentMode,
      sale_type: (row.sale_type as "retail" | "wholesale") ?? "retail",
      store_id: row.store_id ?? null,
      store_name: row.store_name ?? null,
      store_contact_person: row.store_contact_person ?? null,
      store_contact_number: row.store_contact_number ?? null,
      store_address: row.store_address ?? null,
      paid_amount: paidAmount,
      outstanding_amount: Math.max(0, grandTotal - paidAmount),
    };
  },
};
