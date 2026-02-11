import { writeFile } from "@tauri-apps/plugin-fs";
import { InvoiceRecord, InvoiceRecordItem, PaymentMode } from "../types";
import { generateInvoicePdfBytes } from "../utils/generatePDF";
import { getInvoicePdfPath } from "../utils/getInvoicePath";
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
    createdAt?: string;
  }): Promise<InvoiceRecord> {
    const createdAt = params.createdAt || new Date().toISOString();
    const normalizedPhone = normalizePhone(params.customerPhone);

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
        is_return,
        original_invoice_id,
        return_reason,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, NULL, NULL, $13)`,
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
    };

    const { bytes } = await generateInvoicePdfBytes(record);
    const pdfPath = await getInvoicePdfPath(invoiceNumber);
    await writeFile(pdfPath, bytes);

    return record;
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
    }[]>(
      `SELECT id, invoice_number, date, customer_name, customer_phone, subtotal, grand_total, items, status
       FROM invoices
       WHERE invoice_number IS NOT NULL
       ORDER BY date DESC`
    );

    return rows.map((row) => ({
      id: row.id,
      invoice_number: row.invoice_number,
      date: row.date,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      subtotal: row.subtotal ?? 0,
      grand_total: row.grand_total ?? 0,
      items: row.items ? (JSON.parse(row.items) as InvoiceRecordItem[]) : [],
      status: row.status === "pending" ? "pending" : "paid",
    }));
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
    }[]>(
      `SELECT id, invoice_number, date, customer_name, customer_phone, subtotal, grand_total, items, status
       FROM invoices
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      invoice_number: row.invoice_number,
      date: row.date,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      subtotal: row.subtotal ?? 0,
      grand_total: row.grand_total ?? 0,
      items: row.items ? (JSON.parse(row.items) as InvoiceRecordItem[]) : [],
      status: row.status === "pending" ? "pending" : "paid",
    };
  },
};
