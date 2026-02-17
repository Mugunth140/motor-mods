import { v4 as uuidv4 } from "uuid";
import { CreditInvoiceSummary, CreditPayment, InvoiceRecord, PaymentMode, WholesaleStore } from "../types";
import { getDb } from "./index";
import { invoiceManagementService } from "./invoiceManagementService";
import { isTauriRuntime } from "./runtime";
import { wholesaleStoreService } from "./wholesaleStoreService";

const PAYMENTS_KEY = "motormods_credit_payments_v1";

const loadPayments = (): CreditPayment[] => {
  try {
    const raw = localStorage.getItem(PAYMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CreditPayment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const savePayments = (payments: CreditPayment[]) => {
  localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
};

export const creditService = {
  /**
   * Record a payment against a specific wholesale credit invoice.
   */
  async recordPayment(params: {
    storeId: string;
    invoiceId: string;
    amount: number;
    paymentMode: PaymentMode;
    paymentDate?: string;
    notes?: string | null;
  }): Promise<CreditPayment> {
    const payment: CreditPayment = {
      id: uuidv4(),
      store_id: params.storeId,
      invoice_id: params.invoiceId,
      amount: params.amount,
      payment_mode: params.paymentMode,
      payment_date: params.paymentDate || new Date().toISOString(),
      notes: params.notes ?? null,
      created_at: new Date().toISOString(),
    };

    if (!isTauriRuntime()) {
      const payments = loadPayments();
      payments.unshift(payment);
      savePayments(payments);

      // Auto-update invoice status if fully paid
      await this.updateInvoiceStatusIfPaid(params.invoiceId);
      return payment;
    }

    const db = await getDb();
    await db.execute(
      `INSERT INTO credit_payments (id, store_id, invoice_id, amount, payment_mode, payment_date, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        payment.id,
        payment.store_id,
        payment.invoice_id,
        payment.amount,
        payment.payment_mode,
        payment.payment_date,
        payment.notes,
        payment.created_at,
      ]
    );

    await this.updateInvoiceStatusIfPaid(params.invoiceId);
    return payment;
  },

  /**
   * Delete a payment record (admin only — caller is responsible for auth check).
   */
  async deletePayment(paymentId: string, invoiceId: string): Promise<void> {
    if (!isTauriRuntime()) {
      const payments = loadPayments().filter((p) => p.id !== paymentId);
      savePayments(payments);
      await this.updateInvoiceStatusIfPaid(invoiceId);
      return;
    }

    const db = await getDb();
    await db.execute("DELETE FROM credit_payments WHERE id = $1", [paymentId]);
    await this.updateInvoiceStatusIfPaid(invoiceId);
  },

  /**
   * Get all payments for a specific invoice.
   */
  async getPaymentsByInvoice(invoiceId: string): Promise<CreditPayment[]> {
    if (!isTauriRuntime()) {
      return loadPayments()
        .filter((p) => p.invoice_id === invoiceId)
        .sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
    }
    const db = await getDb();
    return await db.select<CreditPayment[]>(
      "SELECT * FROM credit_payments WHERE invoice_id = $1 ORDER BY payment_date DESC",
      [invoiceId]
    );
  },

  /**
   * Get all payments for a specific store.
   */
  async getPaymentsByStore(storeId: string): Promise<CreditPayment[]> {
    if (!isTauriRuntime()) {
      return loadPayments()
        .filter((p) => p.store_id === storeId)
        .sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
    }
    const db = await getDb();
    return await db.select<CreditPayment[]>(
      "SELECT * FROM credit_payments WHERE store_id = $1 ORDER BY payment_date DESC",
      [storeId]
    );
  },

  /**
   * Get total paid amount for a specific invoice.
   */
  async getTotalPaidForInvoice(invoiceId: string): Promise<number> {
    const payments = await this.getPaymentsByInvoice(invoiceId);
    return payments.reduce((sum, p) => sum + p.amount, 0);
  },

  /**
   * Get total outstanding amount for a specific store.
   */
  async getTotalOutstandingForStore(storeId: string): Promise<number> {
    const invoices = await this.getWholesaleCreditInvoicesByStore(storeId);
    let outstanding = 0;
    for (const inv of invoices) {
      if (inv.payment_mode && inv.payment_mode !== "credit") continue;
      const paid = await this.getTotalPaidForInvoice(inv.id);
      outstanding += Math.max(0, inv.grand_total - paid);
    }
    return outstanding;
  },

  /**
   * Get all wholesale credit invoices (status pending) for a store.
   */
  async getWholesaleCreditInvoicesByStore(storeId: string): Promise<InvoiceRecord[]> {
    const allInvoices = await invoiceManagementService.getInvoiceRecords();
    return allInvoices.filter(
      (inv) =>
        inv.store_id === storeId &&
        inv.sale_type === "wholesale" &&
        (inv.payment_mode === "credit" || inv.status === "pending")
    );
  },

  /**
   * Get full credit ledger summaries for a store (or all stores if no storeId).
   */
  async getCreditLedger(storeId?: string): Promise<CreditInvoiceSummary[]> {
    const allInvoices = await invoiceManagementService.getInvoiceRecords();
    const wholesaleInvoices = allInvoices.filter(
      (inv) =>
        inv.sale_type === "wholesale" &&
        inv.store_id &&
        (storeId ? inv.store_id === storeId : true)
    );

    const summaries: CreditInvoiceSummary[] = [];

    for (const invoice of wholesaleInvoices) {
      const store = await wholesaleStoreService.getById(invoice.store_id!);
      if (!store) continue;

      const payments = await this.getPaymentsByInvoice(invoice.id);
      const isCreditSale = invoice.payment_mode === "credit" || invoice.status === "pending";

      let totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      let outstanding = Math.max(0, invoice.grand_total - totalPaid);
      let status: CreditInvoiceSummary["status"] = "unpaid";

      // Non-credit wholesale invoices are fully paid at billing time.
      if (!isCreditSale) {
        totalPaid = invoice.grand_total;
        outstanding = 0;
        status = "paid";
      } else if (totalPaid >= invoice.grand_total) {
        status = "paid";
      } else if (totalPaid > 0) {
        status = "partial";
      }

      summaries.push({
        invoice,
        store,
        total_paid: totalPaid,
        outstanding,
        payments,
        status,
      });
    }

    // Sort: unpaid first, then partial, then paid
    const statusOrder = { unpaid: 0, partial: 1, paid: 2 };
    summaries.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return new Date(b.invoice.date).getTime() - new Date(a.invoice.date).getTime();
    });

    return summaries;
  },

  /**
   * If total payments >= invoice grand_total, update invoice status to 'paid'.
   */
  async updateInvoiceStatusIfPaid(invoiceId: string): Promise<void> {
    const allRecords = await invoiceManagementService.getInvoiceRecords();
    const invoice = allRecords.find((r) => r.id === invoiceId) ?? null;
    if (!invoice) return;

    const totalPaid = await this.getTotalPaidForInvoice(invoiceId);
    const isCreditSale = invoice.payment_mode === "credit" || invoice.status === "pending";
    const newStatus = isCreditSale && totalPaid < invoice.grand_total ? "pending" : "paid";

    if (invoice.status === newStatus) return;

    if (!isTauriRuntime()) {
      const INVOICE_RECORDS_KEY = "motormods_invoice_records_v1";
      try {
        const raw = localStorage.getItem(INVOICE_RECORDS_KEY);
        if (!raw) return;
        const records = JSON.parse(raw) as InvoiceRecord[];
        const idx = records.findIndex((r) => r.id === invoiceId);
        if (idx >= 0) {
          records[idx] = { ...records[idx], status: newStatus };
          localStorage.setItem(INVOICE_RECORDS_KEY, JSON.stringify(records));
        }
      } catch {
        // ignore
      }
      return;
    }

    const db = await getDb();
    await db.execute("UPDATE invoices SET status = $1 WHERE id = $2", [newStatus, invoiceId]);
  },

  /**
   * Get outstanding summary per store (for dashboard or overview).
   */
  async getStoreOutstandingSummary(): Promise<
    Array<{ store: WholesaleStore; total_outstanding: number; pending_invoices: number }>
  > {
    const stores = await wholesaleStoreService.getAll();
    const allInvoices = await invoiceManagementService.getInvoiceRecords();
    const allPayments = isTauriRuntime()
      ? await (async () => {
          const db = await getDb();
          return await db.select<CreditPayment[]>("SELECT * FROM credit_payments");
        })()
      : loadPayments();

    const paymentsByInvoice = new Map<string, number>();
    for (const p of allPayments) {
      paymentsByInvoice.set(p.invoice_id, (paymentsByInvoice.get(p.invoice_id) ?? 0) + p.amount);
    }

    return stores.map((store) => {
      const storeInvoices = allInvoices.filter(
        (inv) => inv.store_id === store.id && inv.sale_type === "wholesale"
      );
      let totalOutstanding = 0;
      let pendingCount = 0;

      for (const inv of storeInvoices) {
        const isCreditSale = inv.payment_mode === "credit" || inv.status === "pending";
        if (!isCreditSale) continue;

        const paid = paymentsByInvoice.get(inv.id) ?? 0;
        const remaining = Math.max(0, inv.grand_total - paid);
        if (remaining > 0) {
          totalOutstanding += remaining;
          pendingCount++;
        }
      }

      return { store, total_outstanding: totalOutstanding, pending_invoices: pendingCount };
    });
  },
};
