import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    Clock,
    DollarSign,
    Eye,
    FileText,
    Package,
    Printer,
    Receipt,
    RotateCcw,
    Search,
    TrendingUp,
    User
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { invoiceService } from "../db/invoiceService";
import { returnsService } from "../db/returnsService";
import { useDebounce, useInvoices } from "../hooks";
import { Invoice, InvoiceItem } from "../types";
import { Badge, Button, Card, EmptyState, Modal, useToast } from "./ui";

// Invoice Detail Modal Component
const InvoiceDetailModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  items: InvoiceItem[];
  isLoading: boolean;
}> = ({ isOpen, onClose, invoice, items, isLoading }) => {
  const toast = useToast();

  const subtotalAmount = useMemo(
    () => items.reduce((sum, it) => sum + it.quantity * it.price, 0),
    [items]
  );

  const discountAmount = Math.max(0, Math.min(invoice?.discount_amount ?? 0, subtotalAmount));

  const handlePrint = async () => {
    if (!invoice) return;

    const isWindows = navigator.platform.toLowerCase().includes('win');
    
    if (isWindows) {
      // Windows: Silent print
      toast.info("Printing", "Sending invoice to printer...");
      
      try {
        const { saveInvoicePdf } = await import("../utils/invoiceGenerator");
        const { tryPrintPdfSilent } = await import("../utils/printService");
        
        const invoiceData = {
          invoice: {
            id: invoice.id,
            customer_name: invoice.customer_name || "Walking Customer",
            customer_phone: invoice.customer_phone || null,
            discount_amount: invoice.discount_amount || 0,
            total_amount: invoice.total_amount,
            payment_mode: (invoice.payment_mode || "cash") as "cash" | "card" | "upi" | "cheque" | "credit",
            created_at: invoice.created_at,
          },
          items: items.map((item) => ({
            id: item.id,
            invoice_id: item.invoice_id,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            price: item.price,
            cost_price: item.cost_price,
          })),
        };

        const pdfPath = await saveInvoicePdf(invoiceData);
        const printResult = await tryPrintPdfSilent(pdfPath);
        
        if (printResult.success) {
          toast.success("Print Sent", "Invoice sent to printer");
        } else {
          toast.warning("Print Failed", printResult.error || "Could not print invoice");
        }
      } catch (error) {
        console.error("Print error:", error);
        toast.error("Error", "Failed to print invoice");
      }
    } else {
      // Linux/macOS: Save dialog
      toast.info("Generating PDF", "Creating invoice document...");

      try {
        const { generateInvoicePdfBytes } = await import("../utils/invoiceGenerator");
        const { savePdfWithDialog } = await import("../utils/printService");
        
        const invoiceData = {
          invoice: {
            id: invoice.id,
            customer_name: invoice.customer_name || "Walking Customer",
            customer_phone: invoice.customer_phone || null,
            discount_amount: invoice.discount_amount || 0,
            total_amount: invoice.total_amount,
            payment_mode: (invoice.payment_mode || "cash") as "cash" | "card" | "upi" | "cheque" | "credit",
            created_at: invoice.created_at,
          },
          items: items.map((item) => ({
            id: item.id,
            invoice_id: item.invoice_id,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            price: item.price,
            cost_price: item.cost_price,
          })),
        };

        const { bytes, filename } = await generateInvoicePdfBytes(invoiceData);
        const saveResult = await savePdfWithDialog(bytes, filename);
        
        if (saveResult.success && saveResult.savedPath) {
          toast.success("Invoice Saved", `Saved to ${saveResult.savedPath}`);
        } else if (saveResult.error && saveResult.error !== "Save cancelled by user") {
          toast.warning("Save Failed", saveResult.error || "Could not save invoice");
        } else {
          toast.info("Cancelled", "Save was cancelled");
        }
      } catch (error) {
        console.error("PDF generation error:", error);
        toast.error("Error", "Failed to generate invoice PDF");
      }
    }
  };

  if (!invoice) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Invoice Details" size="lg">
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6" id="invoice-print-content">
          {/* Invoice Header */}
          <div className="flex justify-between items-start pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Invoice #{invoice.id.slice(0, 8).toUpperCase()}</h3>
              <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
                <Calendar size={14} />
                {new Date(invoice.created_at).toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">Customer</p>
              <p className="font-semibold text-slate-800">{invoice.customer_name || "Walking Customer"}</p>
              {invoice.customer_phone && (
                <p className="text-sm text-slate-500">{invoice.customer_phone}</p>
              )}
            </div>
          </div>

          {/* Invoice Items */}
          <div>
            <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Package size={16} />
              Items ({items.length})
            </h4>
            <div className="bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/50">
                    <th className="text-left p-3 font-semibold text-slate-600">Product</th>
                    <th className="text-center p-3 font-semibold text-slate-600">Qty</th>
                    <th className="text-right p-3 font-semibold text-slate-600">Price</th>
                    <th className="text-right p-3 font-semibold text-slate-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3 text-slate-800 font-medium">
                        {item.product_name || `Product ID: ${item.product_id.slice(0, 8)}`}
                      </td>
                      <td className="p-3 text-center text-slate-600">{item.quantity}</td>
                      <td className="p-3 text-right text-slate-600">₹{item.price.toLocaleString()}</td>
                      <td className="p-3 text-right font-bold text-slate-800">
                        ₹{(item.quantity * item.price).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-indigo-50 rounded-xl p-4 space-y-2 border border-indigo-100">
            <div className="flex justify-between text-sm text-indigo-900/80">
              <span>Subtotal</span>
              <span className="font-semibold">₹{subtotalAmount.toLocaleString()}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-indigo-900/80">
                <span>Discount</span>
                <span className="font-semibold">-₹{discountAmount.toLocaleString()}</span>
              </div>
            )}
            <div className="pt-2 border-t border-indigo-200 flex justify-between items-center">
              <span className="font-bold text-indigo-900">Total Amount</span>
              <span className="text-2xl font-bold text-indigo-600">₹{invoice.total_amount.toLocaleString()}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-100 no-print">
            <Button variant="secondary" onClick={onClose} className="flex-1 h-11">
              Close
            </Button>
            <Button onClick={handlePrint} leftIcon={<Printer size={18} />} className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-700">
              Print Invoice
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export const Invoices: React.FC = () => {
  const { invoices, loading } = useInvoices();
  const toast = useToast();

  // Search
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Pagination
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);

  // Stats
  const [stats, setStats] = useState({
    totalInvoices: 0,
    totalRevenue: 0,
    todayRevenue: 0,
    thisMonthCount: 0,
  });

  // Invoice detail modal
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  // Track returned invoice IDs
  const [returnedInvoiceIds, setReturnedInvoiceIds] = useState<Set<string>>(new Set());

  // Load stats and returned IDs
  useEffect(() => {
    const loadData = async () => {
      try {
        const [s, returnedIds] = await Promise.all([
          invoiceService.getStats(),
          returnsService.getReturnedInvoiceIds()
        ]);
        setStats(s);
        setReturnedInvoiceIds(returnedIds);
      } catch (error) {
        console.error("Failed to load data:", error);
      }
    };
    loadData();
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    if (!debouncedSearch) return invoices;
    const search = debouncedSearch.toLowerCase();
    return invoices.filter(inv =>
      (inv.customer_name?.toLowerCase() || "walking customer").includes(search) ||
      inv.id.toLowerCase().includes(search)
    );
  }, [invoices, debouncedSearch]);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  }, [filteredInvoices.length]);

  const pagedInvoices = useMemo(() => {
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredInvoices.slice(start, start + PAGE_SIZE);
  }, [filteredInvoices, page, totalPages]);

  const handleViewInvoice = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsDetailOpen(true);
    setIsLoadingItems(true);

    try {
      const items = await invoiceService.getItems(invoice.id);
      setInvoiceItems(items);
    } catch (error) {
      console.error(error);
      toast.error("Error", "Failed to load invoice details");
    } finally {
      setIsLoadingItems(false);
    }
  };

  const closeDetailModal = () => {
    setIsDetailOpen(false);
    setSelectedInvoice(null);
    setInvoiceItems([]);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-8rem)] animate-in fade-in duration-500">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <FileText size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Invoices</p>
            <h3 className="text-2xl font-bold text-slate-800">{stats.totalInvoices}</h3>
          </div>
        </Card>

        <Card className="flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Revenue</p>
            <h3 className="text-2xl font-bold text-slate-800">₹{stats.totalRevenue.toLocaleString()}</h3>
          </div>
        </Card>

        <Card className="flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Today's Revenue</p>
            <h3 className="text-2xl font-bold text-slate-800">₹{stats.todayRevenue.toLocaleString()}</h3>
          </div>
        </Card>

        <Card className="flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">This Month</p>
            <h3 className="text-2xl font-bold text-slate-800">{stats.thisMonthCount} invoices</h3>
          </div>
        </Card>
      </div>

      {/* Invoice List */}
      <div className="flex flex-col flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800">Transaction History</h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="Search by customer or invoice ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 h-10 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-80"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar">
          {pagedInvoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={searchTerm ? "No invoices found" : "No invoices yet"}
              description={searchTerm
                ? "Try adjusting your search terms"
                : "Create your first invoice from the Billing tab"}
            />
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Invoice ID</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date & Time</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                          <Receipt size={18} className="text-indigo-600" />
                        </div>
                        <div>
                          <div className="font-mono font-bold text-slate-800">
                            #{inv.id.slice(0, 8).toUpperCase()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-slate-600 font-medium">
                        <Calendar size={14} className="text-slate-400" />
                        {formatDate(inv.created_at)}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                          <User size={14} className="text-slate-500" />
                        </div>
                        <span className="font-medium text-slate-700">
                          {inv.customer_name || "Walking Customer"}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg text-slate-800">
                          ₹{inv.total_amount.toLocaleString()}
                        </span>
                        {returnedInvoiceIds.has(inv.id) && (
                          <Badge variant="warning" size="sm" className="flex items-center gap-1">
                            <RotateCcw size={10} />
                            Returned
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewInvoice(inv)}
                          leftIcon={<Eye size={14} />}
                          className="hover:bg-indigo-50 hover:text-indigo-600"
                        >
                          View
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {filteredInvoices.length > 0 && (
          <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between">
            <div className="text-sm text-slate-500">
              Page <span className="font-semibold text-slate-700">{Math.min(page, totalPages)}</span> of{" "}
              <span className="font-semibold text-slate-700">{totalPages}</span> ({filteredInvoices.length} invoices)
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                leftIcon={<ChevronLeft size={16} />}
              >
                Prev
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                leftIcon={<ChevronRight size={16} />}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Invoice Detail Modal */}
      <InvoiceDetailModal
        isOpen={isDetailOpen}
        onClose={closeDetailModal}
        invoice={selectedInvoice}
        items={invoiceItems}
        isLoading={isLoadingItems}
      />
    </div>
  );
};
