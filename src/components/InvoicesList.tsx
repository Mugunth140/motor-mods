import {
  Calendar,
  CreditCard,
  DollarSign,
  Eye,
  MessageCircle,
  Receipt,
  Search,
  Store,
  Undo2,
  User,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { invoiceManagementService } from "../db/invoiceManagementService";
import { invoiceService } from "../db/invoiceService";
import { productService } from "../db/productService";
import { stockAdjustmentService } from "../db/stockAdjustmentService";
import { useAuthSession, useDebounce } from "../hooks";
import { InvoiceRecord } from "../types";
import { shareInvoiceOnWhatsApp } from "../utils/shareWhatsApp";
import { InvoiceView } from "./InvoiceView";
import { Button, ConfirmModal, EmptyState, Modal, useToast } from "./ui";

export const InvoicesList: React.FC = () => {
  const { session } = useAuthSession();
  const toast = useToast();
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);

  // Undo state
  const [undoInvoiceId, setUndoInvoiceId] = useState<string | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 300);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const records = await invoiceManagementService.getInvoiceRecords();
      setInvoices(records);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load invoices", "Please try again");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [toast]);

  const filteredInvoices = useMemo(() => {
    const search = debouncedSearch.trim().toLowerCase();
    return invoices.filter((inv) => {
      const matchSearch = !search ||
        inv.customer_name?.toLowerCase().includes(search) ||
        inv.invoice_number.toLowerCase().includes(search) ||
        (inv.customer_phone || "").toLowerCase().includes(search) ||
        (inv.store_name || "").toLowerCase().includes(search);

      const matchDate = !dateFilter ||
        new Date(inv.date).toISOString().slice(0, 10) === dateFilter;

      return matchSearch && matchDate;
    });
  }, [invoices, debouncedSearch, dateFilter]);

  const handleWhatsApp = async (invoice: InvoiceRecord) => {
    if (!invoice.customer_phone) {
      toast.warning("Missing Phone", "Add a customer phone to send WhatsApp");
      return;
    }
    await shareInvoiceOnWhatsApp(invoice);
    toast.success("WhatsApp opened", "WhatsApp draft opened with invoice details and attachment.");
  };

  const handleUndoInvoice = async () => {
    if (!undoInvoiceId) return;

    setIsUndoing(true);
    try {
      // Get invoice items to restore stock
      const items = await invoiceService.getItems(undoInvoiceId);

      // Restore stock for each item
      for (const item of items) {
        await productService.updateQuantity(item.product_id, item.quantity);
        await stockAdjustmentService.create(
          item.product_id,
          'other',
          item.quantity,
          `Undo invoice ${undoInvoiceId.slice(0, 8).toUpperCase()}`,
          session?.name || 'admin'
        );
      }

      // Delete the invoice
      await invoiceService.deleteInvoice(undoInvoiceId);

      toast.success("Invoice Deleted", "Invoice deleted and stock restored successfully");

      // Refresh invoices list
      await fetchInvoices();
    } catch (error) {
      console.error("Failed to undo invoice:", error);
      toast.error("Error", "Failed to delete invoice and restore stock");
    } finally {
      setIsUndoing(false);
      setUndoInvoiceId(null);
    }
  };

  const handleInvoiceUpdated = (updated: InvoiceRecord) => {
    setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
    setSelectedInvoice(updated);
  };

  const getPaymentModeDisplay = (inv: InvoiceRecord) => {
    const mode = inv.payment_mode || "cash";
    switch (mode) {
      case "credit":
        return { label: "Credit", color: "text-amber-600", bg: "bg-amber-50" };
      case "upi":
        return { label: "UPI", color: "text-emerald-600", bg: "bg-emerald-50" };
      case "card":
        return { label: "Card", color: "text-blue-600", bg: "bg-blue-50" };
      default:
        return { label: "Cash", color: "text-green-600", bg: "bg-green-50" };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <Receipt size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Invoices</h2>
            <p className="text-xs text-slate-500">Search, view, and share billing invoices</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search customer, phone, invoice#"
              className="pl-9 pr-3 h-10 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          <div className="relative">
            <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="pl-9 pr-3 h-10 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        </div>
      </div>

      {filteredInvoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices found"
          description="Complete a bill to create invoices, or adjust your filters."
        />
      ) : (
        <>
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-4">Invoice#</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Phone</th>
                  <th className="p-4">Payment</th>
                  <th className="p-4">Total</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => {
                  const isWholesale = inv.sale_type === "wholesale";
                  const displayName = isWholesale
                    ? (inv.store_name || inv.customer_name || "Unknown Store")
                    : (inv.customer_name || "Walking Customer");
                  const pm = getPaymentModeDisplay(inv);

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/60">
                      <td className="p-4 font-mono font-semibold text-slate-800">{inv.invoice_number}</td>
                      <td className="p-4 text-slate-600">{new Date(inv.date).toLocaleString("en-IN")}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isWholesale ? "bg-indigo-50" : "bg-slate-100"}`}>
                            {isWholesale
                              ? <Store size={14} className="text-indigo-500" />
                              : <User size={14} className="text-slate-400" />
                            }
                          </div>
                          <span className="font-medium text-slate-700">{displayName}</span>
                        </div>
                      </td>
                      <td className="p-4 text-slate-600">{inv.customer_phone || "-"}</td>
                      <td className="p-4">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${pm.bg} ${pm.color}`}>
                          {pm.label}
                        </div>
                      </td>
                      <td className="p-4 font-semibold text-slate-800">₹{inv.grand_total.toLocaleString("en-IN")}</td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedInvoice(inv)} leftIcon={<Eye size={14} />}>
                            View
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleWhatsApp(inv)} leftIcon={<MessageCircle size={14} />}>
                            WhatsApp
                          </Button>
                          {session?.role === "admin" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setUndoInvoiceId(inv.id)}
                              leftIcon={<Undo2 size={14} />}
                              className="hover:bg-red-50 hover:text-red-600"
                            >
                              Undo
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile view */}
          <div className="md:hidden">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <Virtuoso
                style={{ height: 500 }}
                totalCount={filteredInvoices.length}
                itemContent={(index) => {
                  const inv = filteredInvoices[index];
                  const isWholesale = inv.sale_type === "wholesale";
                  const displayName = isWholesale
                    ? (inv.store_name || inv.customer_name || "Unknown Store")
                    : (inv.customer_name || "Walking Customer");
                  const pm = getPaymentModeDisplay(inv);

                  return (
                    <div className="p-4 border-b border-slate-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-400">Invoice#</p>
                          <p className="font-mono font-semibold text-slate-800">{inv.invoice_number}</p>
                        </div>
                        <span className="text-sm font-bold text-teal-600">₹{inv.grand_total.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        {new Date(inv.date).toLocaleString("en-IN")}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isWholesale ? "bg-indigo-50" : "bg-slate-100"}`}>
                          {isWholesale
                            ? <Store size={12} className="text-indigo-500" />
                            : <User size={12} className="text-slate-400" />
                          }
                        </div>
                        <span className="text-sm text-slate-700 font-medium">{displayName}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-slate-500">{inv.customer_phone || "No phone"}</span>
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${pm.bg} ${pm.color}`}>
                          {pm.label}
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setSelectedInvoice(inv)} leftIcon={<Eye size={14} />}>
                          View
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => handleWhatsApp(inv)} leftIcon={<MessageCircle size={14} />}>
                          WhatsApp
                        </Button>
                        {session?.role === "admin" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setUndoInvoiceId(inv.id)}
                            leftIcon={<Undo2 size={14} />}
                            className="hover:bg-red-50 hover:text-red-600"
                          >
                            Undo
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
            </div>
          </div>
        </>
      )}

      <Modal isOpen={!!selectedInvoice} onClose={() => setSelectedInvoice(null)} title="Invoice Preview" size="lg">
        {selectedInvoice && (
          <InvoiceView invoice={selectedInvoice} onInvoiceUpdated={handleInvoiceUpdated} />
        )}
      </Modal>

      {/* Undo Invoice Confirmation Modal */}
      <ConfirmModal
        isOpen={!!undoInvoiceId}
        onClose={() => setUndoInvoiceId(null)}
        onConfirm={handleUndoInvoice}
        title="Undo Invoice"
        message="This will permanently delete the invoice and restore the stock quantities. This action cannot be reversed."
        confirmText={isUndoing ? "Deleting..." : "Delete & Restore Stock"}
        variant="danger"
        isLoading={isUndoing}
      />
    </div>
  );
};
