import {
    ArrowLeftRight,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Eye,
    FileText,
    Package,
    Plus,
    Printer,
    RotateCcw,
    Search,
    X
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { invoiceService } from "../db/invoiceService";
import { returnsService } from "../db/returnsService";
import { useDebounce } from "../hooks";
import {
    Invoice,
    InvoiceItem,
    RETURN_REASON_LABELS,
    ReturnReason,
    SalesReturn,
    SalesReturnWithItems
} from "../types";
import { Badge, Button, Card, ConfirmModal, EmptyState, Input, Modal, useToast } from "./ui";

interface SalesReturnsProps {
    userRole?: "admin" | "staff";
    userName?: string;
}

export const SalesReturns: React.FC<SalesReturnsProps> = ({ userRole = "staff", userName = "Staff" }) => {
    const toast = useToast();

    // Returns list state
    const [returns, setReturns] = useState<SalesReturn[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const PAGE_SIZE = 25;

    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const debouncedSearch = useDebounce(searchTerm, 300);

    // Create return modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [invoiceSearch, setInvoiceSearch] = useState("");
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
    const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
    const [returnReason, setReturnReason] = useState<ReturnReason>("customer_request");
    const [returnNotes, setReturnNotes] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    // View detail modal
    const [viewingReturn, setViewingReturn] = useState<SalesReturnWithItems | null>(null);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);

    // Cancel confirmation
    const [cancelConfirm, setCancelConfirm] = useState<{ open: boolean; return: SalesReturn | null }>({
        open: false,
        return: null,
    });
    const [isCancelling, setIsCancelling] = useState(false);

    // Stats
    const [stats, setStats] = useState({ totalReturns: 0, totalAmount: 0, todayReturns: 0, todayAmount: 0 });

    const loadReturns = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const [data, count, statsData] = await Promise.all([
                returnsService.getAll({
                    limit: PAGE_SIZE,
                    offset: (page - 1) * PAGE_SIZE,
                    fromDate: fromDate || undefined,
                    toDate: toDate || undefined,
                }),
                returnsService.getCount({ fromDate: fromDate || undefined, toDate: toDate || undefined }),
                returnsService.getStats(),
            ]);
            setReturns(data);
            setTotalCount(count);
            setStats(statsData);
        } catch (error) {
            console.error(error);
            setLoadError(true);
            toast.error("Failed to Load", "Could not load returns list");
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, fromDate, toDate]);

    useEffect(() => {
        loadReturns();
    }, [loadReturns]);

    useEffect(() => {
        setPage(1);
    }, [fromDate, toDate]);

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    const filteredReturns = useMemo(() => {
        if (!debouncedSearch) return returns;
        const search = debouncedSearch.toLowerCase();
        return returns.filter(r =>
            r.return_no.toLowerCase().includes(search) ||
            r.customer_name?.toLowerCase().includes(search) ||
            r.reason.toLowerCase().includes(search)
        );
    }, [returns, debouncedSearch]);

    // Load invoices for selection
    const loadInvoices = async () => {
        try {
            const allInvoices = await invoiceService.getAll();
            // Filter out returns (is_return = 1)
            setInvoices(allInvoices.filter(inv => !inv.is_return));
        } catch (error) {
            console.error(error);
        }
    };

    const openCreateModal = async () => {
        setIsLoadingInvoices(true);
        setShowCreateModal(true);
        setSelectedInvoice(null);
        setInvoiceItems([]);
        setSelectedItems(new Map());
        setReturnReason("customer_request");
        setReturnNotes("");
        setInvoiceSearch("");
        try {
            await loadInvoices();
        } catch (error) {
            console.error(error);
            toast.error("Error", "Failed to load invoices");
        } finally {
            setIsLoadingInvoices(false);
        }
    };

    const closeCreateModal = () => {
        setShowCreateModal(false);
        setSelectedInvoice(null);
        setInvoiceItems([]);
        setSelectedItems(new Map());
    };

    const selectInvoice = async (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        try {
            const items = await invoiceService.getItems(invoice.id);
            setInvoiceItems(items);
            setSelectedItems(new Map());
        } catch (error) {
            console.error(error);
            toast.error("Error", "Could not load invoice items");
        }
    };

    const toggleItemSelection = (itemId: string, maxQty: number) => {
        const newMap = new Map(selectedItems);
        if (newMap.has(itemId)) {
            newMap.delete(itemId);
        } else {
            newMap.set(itemId, maxQty);
        }
        setSelectedItems(newMap);
    };

    const updateItemQuantity = (itemId: string, qty: number, maxQty: number) => {
        const newMap = new Map(selectedItems);
        const clampedQty = Math.max(1, Math.min(qty, maxQty));
        newMap.set(itemId, clampedQty);
        setSelectedItems(newMap);
    };

    const calculateRefundAmount = () => {
        let total = 0;
        for (const [itemId, qty] of selectedItems) {
            const item = invoiceItems.find(i => i.id === itemId);
            if (item) {
                total += item.price * qty;
            }
        }
        return total;
    };

    const handleCreateReturn = async () => {
        if (!selectedInvoice) {
            toast.warning("Select Invoice", "Please select an invoice first");
            return;
        }
        if (selectedItems.size === 0) {
            toast.warning("Select Items", "Please select at least one item to return");
            return;
        }

        setIsCreating(true);
        try {
            const items = Array.from(selectedItems.entries()).map(([itemId, qty]) => {
                const item = invoiceItems.find(i => i.id === itemId)!;
                return {
                    productId: item.product_id,
                    quantity: qty,
                    rate: item.price,
                };
            });

            const result = await returnsService.create({
                invoiceId: selectedInvoice.id,
                reason: returnReason,
                notes: returnNotes.trim() || null,
                items,
                createdBy: userName,
            });

            toast.success("Return Created", `Return ${result.return_no} has been created. Stock updated.`);
            closeCreateModal();
            loadReturns();
        } catch (error) {
            console.error(error);
            const msg = error instanceof Error ? error.message : "Failed to create return";
            toast.error("Error", msg);
        } finally {
            setIsCreating(false);
        }
    };

    const viewReturnDetail = async (returnItem: SalesReturn) => {
        setIsLoadingDetail(true);
        try {
            const detail = await returnsService.getById(returnItem.id);
            setViewingReturn(detail);
        } catch (error) {
            console.error(error);
            toast.error("Error", "Could not load return details");
        } finally {
            setIsLoadingDetail(false);
        }
    };

    const handleCancelReturn = async () => {
        if (!cancelConfirm.return) return;

        setIsCancelling(true);
        try {
            await returnsService.cancel(cancelConfirm.return.id, userName);
            toast.success("Return Cancelled", "Stock has been reversed");
            setCancelConfirm({ open: false, return: null });
            loadReturns();
        } catch (error) {
            console.error(error);
            toast.error("Error", "Could not cancel return");
        } finally {
            setIsCancelling(false);
        }
    };

    const printReturn = (returnItem: SalesReturnWithItems) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Return ${returnItem.return_no}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 80mm; margin: 0 auto; }
          h1 { font-size: 18px; text-align: center; margin-bottom: 10px; }
          .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
          .info { font-size: 12px; margin-bottom: 10px; }
          .info div { margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { padding: 5px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f5f5f5; }
          .total { font-weight: bold; font-size: 14px; text-align: right; margin-top: 10px; }
          .footer { text-align: center; margin-top: 20px; font-size: 11px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>MOTORMODS</h1>
          <div>SALES RETURN / CREDIT NOTE</div>
        </div>
        <div class="info">
          <div><strong>Return #:</strong> ${returnItem.return_no}</div>
          <div><strong>Date:</strong> ${new Date(returnItem.return_date).toLocaleDateString()}</div>
          <div><strong>Customer:</strong> ${returnItem.customer_name || 'Walking Customer'}</div>
          <div><strong>Reason:</strong> ${RETURN_REASON_LABELS[returnItem.reason]}</div>
          ${returnItem.notes ? `<div><strong>Notes:</strong> ${returnItem.notes}</div>` : ''}
        </div>
        <table>
          <thead>
            <tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
          </thead>
          <tbody>
            ${returnItem.items.map(item => `
              <tr>
                <td>${item.product_name || 'Unknown'}</td>
                <td>${item.quantity}</td>
                <td>₹${item.rate.toLocaleString()}</td>
                <td>₹${item.line_total.toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="total">Refund Amount: ₹${returnItem.total_amount.toLocaleString()}</div>
        <div class="footer">Thank you for your business!</div>
      </body>
      </html>
    `;

        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.print();
    };

    const getStatusBadge = (status: string) => {
        if (status === 'cancelled') {
            return <Badge variant="danger">Cancelled</Badge>;
        }
        return <Badge variant="success">Completed</Badge>;
    };

    if (loading && returns.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (loadError && returns.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <p className="text-slate-500">Failed to load returns list</p>
                <button
                    onClick={loadReturns}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4">
                <Card className="flex items-center gap-4">
                    <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
                        <RotateCcw size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 font-medium">Total Returns</p>
                        <h3 className="text-2xl font-bold text-slate-800">{stats.totalReturns}</h3>
                    </div>
                </Card>

                <Card className="flex items-center gap-4">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                        <ArrowLeftRight size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 font-medium">Total Refunded</p>
                        <h3 className="text-2xl font-bold text-slate-800">₹{stats.totalAmount.toLocaleString()}</h3>
                    </div>
                </Card>

                <Card className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                        <Calendar size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 font-medium">Today's Returns</p>
                        <h3 className="text-2xl font-bold text-slate-800">{stats.todayReturns}</h3>
                    </div>
                </Card>

                <Card className="flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                        <FileText size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 font-medium">Today's Refund</p>
                        <h3 className="text-2xl font-bold text-slate-800">₹{stats.todayAmount.toLocaleString()}</h3>
                    </div>
                </Card>
            </div>

            {/* Returns Table */}
            <Card padding="none" className="flex flex-col flex-1 overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h2 className="text-lg font-bold text-slate-800">Sales Returns</h2>
                    <div className="flex items-center gap-3">
                        <div className="w-64">
                            <Input
                                placeholder="Search returns..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                leftIcon={<Search size={18} />}
                            />
                        </div>
                        <div className="w-40">
                            <Input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                            />
                        </div>
                        <div className="w-40">
                            <Input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                            />
                        </div>
                        <Button onClick={openCreateModal} leftIcon={<Plus size={18} />} className="shrink-0">
                            New Return
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    {filteredReturns.length === 0 ? (
                        <EmptyState
                            icon={RotateCcw}
                            title="No returns found"
                            description="Create a new return to process customer refunds"
                            action={
                                <Button onClick={openCreateModal} leftIcon={<Plus size={18} />}>
                                    New Return
                                </Button>
                            }
                        />
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Return #</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Reason</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredReturns.map((ret) => (
                                    <tr key={ret.id} className="hover:bg-slate-50/80 transition-colors group">
                                        <td className="p-4">
                                            <span className="font-mono font-semibold text-teal-600">{ret.return_no}</span>
                                        </td>
                                        <td className="p-4 text-slate-600">
                                            {new Date(ret.return_date).toLocaleDateString()}
                                        </td>
                                        <td className="p-4 text-slate-800">{ret.customer_name || "Walking Customer"}</td>
                                        <td className="p-4">
                                            <Badge variant="neutral">{RETURN_REASON_LABELS[ret.reason]}</Badge>
                                        </td>
                                        <td className="p-4 font-semibold text-slate-800">₹{ret.total_amount.toLocaleString()}</td>
                                        <td className="p-4">{getStatusBadge(ret.status)}</td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => viewReturnDetail(ret)}
                                                    leftIcon={<Eye size={14} />}
                                                >
                                                    View
                                                </Button>
                                                {ret.status !== 'cancelled' && userRole === 'admin' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setCancelConfirm({ open: true, return: ret })}
                                                        leftIcon={<X size={14} />}
                                                        className="text-red-600 hover:bg-red-50"
                                                    >
                                                        Cancel
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {filteredReturns.length > 0 && (
                    <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between">
                        <div className="text-sm text-slate-500">
                            Page <span className="font-semibold text-slate-700">{page}</span> of{" "}
                            <span className="font-semibold text-slate-700">{totalPages}</span> ({totalCount} returns)
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                leftIcon={<ChevronLeft size={16} />}
                            >
                                Prev
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                leftIcon={<ChevronRight size={16} />}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            {/* Create Return Modal */}
            <Modal
                isOpen={showCreateModal}
                onClose={closeCreateModal}
                title="Create Sales Return"
                size="lg"
            >
                <div className="space-y-6">
                    {/* Step 1: Select Invoice */}
                    {!selectedInvoice ? (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-600">Search and select the original invoice:</p>
                            <Input
                                placeholder="Search by invoice ID or customer name..."
                                value={invoiceSearch}
                                onChange={(e) => setInvoiceSearch(e.target.value)}
                                leftIcon={<Search size={18} />}
                            />
                            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl">
                                {isLoadingInvoices ? (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="w-6 h-6 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
                                        <span className="ml-2 text-slate-500">Loading invoices...</span>
                                    </div>
                                ) : invoices.length === 0 ? (
                                    <div className="text-center py-8 text-slate-500">
                                        <FileText size={32} className="mx-auto mb-2 text-slate-300" />
                                        <p>No invoices found</p>
                                        <p className="text-sm">Create an invoice first to process returns</p>
                                    </div>
                                ) : invoices
                                    .filter(inv => {
                                        if (!invoiceSearch) return true;
                                        const search = invoiceSearch.toLowerCase();
                                        return inv.id.toLowerCase().includes(search) ||
                                            inv.customer_name?.toLowerCase().includes(search);
                                    })
                                    .slice(0, 20)
                                    .map(inv => (
                                        <button
                                            key={inv.id}
                                            onClick={() => selectInvoice(inv)}
                                            className="w-full text-left px-4 py-3 hover:bg-teal-50 border-b border-slate-100 last:border-b-0 transition-colors"
                                        >
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <span className="font-mono text-sm font-semibold text-teal-600">
                                                        {inv.id.slice(0, 8).toUpperCase()}
                                                    </span>
                                                    <span className="text-slate-500 mx-2">•</span>
                                                    <span className="text-slate-700">{inv.customer_name || "Walking Customer"}</span>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-semibold text-slate-800">₹{inv.total_amount.toLocaleString()}</div>
                                                    <div className="text-xs text-slate-400">
                                                        {new Date(inv.created_at).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Selected Invoice Info */}
                            <div className="bg-teal-50 text-teal-800 p-4 rounded-xl flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-medium">Selected Invoice</p>
                                    <p className="font-mono font-bold">{selectedInvoice.id.slice(0, 8).toUpperCase()}</p>
                                    <p className="text-sm">{selectedInvoice.customer_name || "Walking Customer"}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-bold">₹{selectedInvoice.total_amount.toLocaleString()}</p>
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedInvoice(null)}>
                                        Change
                                    </Button>
                                </div>
                            </div>

                            {/* Step 2: Select Items */}
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-2">Select items to return:</p>
                                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                                    {invoiceItems.map(item => {
                                        const isSelected = selectedItems.has(item.id);
                                        const selectedQty = selectedItems.get(item.id) || 0;

                                        return (
                                            <div
                                                key={item.id}
                                                className={`p-4 flex items-center gap-4 ${isSelected ? 'bg-teal-50' : ''}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleItemSelection(item.id, item.quantity)}
                                                    className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                                />
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <Package size={16} className="text-slate-400" />
                                                        <span className="font-medium text-slate-800">{item.product_name || 'Unknown Product'}</span>
                                                    </div>
                                                    <p className="text-sm text-slate-500">
                                                        Original Qty: {item.quantity} × ₹{item.price.toLocaleString()}
                                                    </p>
                                                </div>
                                                {isSelected && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-slate-600">Return Qty:</span>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            max={item.quantity}
                                                            value={selectedQty}
                                                            onChange={(e) => updateItemQuantity(item.id, parseInt(e.target.value) || 1, item.quantity)}
                                                            className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-center"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Step 3: Reason & Notes */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Return Reason</label>
                                    <select
                                        value={returnReason}
                                        onChange={(e) => setReturnReason(e.target.value as ReturnReason)}
                                        className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                                    >
                                        {Object.entries(RETURN_REASON_LABELS).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Notes (Optional)</label>
                                    <Input
                                        value={returnNotes}
                                        onChange={(e) => setReturnNotes(e.target.value)}
                                        placeholder="Additional notes..."
                                    />
                                </div>
                            </div>

                            {/* Refund Summary */}
                            <div className="bg-slate-50 p-4 rounded-xl flex justify-between items-center">
                                <span className="text-slate-600">Refund Amount:</span>
                                <span className="text-2xl font-bold text-teal-600">₹{calculateRefundAmount().toLocaleString()}</span>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-4 border-t border-slate-100">
                                <Button variant="secondary" onClick={closeCreateModal} className="flex-1">
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleCreateReturn}
                                    isLoading={isCreating}
                                    disabled={selectedItems.size === 0}
                                    className="flex-1"
                                    leftIcon={<RotateCcw size={18} />}
                                >
                                    Process Return
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </Modal>

            {/* View Return Detail Modal */}
            <Modal
                isOpen={!!viewingReturn}
                onClose={() => setViewingReturn(null)}
                title={`Return ${viewingReturn?.return_no}`}
                size="md"
            >
                {isLoadingDetail ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : viewingReturn && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-slate-500">Return Date</p>
                                <p className="font-semibold text-slate-800">
                                    {new Date(viewingReturn.return_date).toLocaleDateString()}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Status</p>
                                <div>{getStatusBadge(viewingReturn.status)}</div>
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Customer</p>
                                <p className="font-semibold text-slate-800">{viewingReturn.customer_name || "Walking Customer"}</p>
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Reason</p>
                                <p className="font-semibold text-slate-800">{RETURN_REASON_LABELS[viewingReturn.reason]}</p>
                            </div>
                        </div>

                        {viewingReturn.notes && (
                            <div>
                                <p className="text-sm text-slate-500">Notes</p>
                                <p className="text-slate-700">{viewingReturn.notes}</p>
                            </div>
                        )}

                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="p-3 text-left font-semibold text-slate-600">Item</th>
                                        <th className="p-3 text-center font-semibold text-slate-600">Qty</th>
                                        <th className="p-3 text-right font-semibold text-slate-600">Rate</th>
                                        <th className="p-3 text-right font-semibold text-slate-600">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {viewingReturn.items.map(item => (
                                        <tr key={item.id}>
                                            <td className="p-3 text-slate-800">{item.product_name || 'Unknown'}</td>
                                            <td className="p-3 text-center text-slate-600">{item.quantity}</td>
                                            <td className="p-3 text-right text-slate-600">₹{item.rate.toLocaleString()}</td>
                                            <td className="p-3 text-right font-semibold text-slate-800">₹{item.line_total.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-teal-50 p-4 rounded-xl flex justify-between items-center">
                            <span className="font-semibold text-teal-800">Total Refund</span>
                            <span className="text-2xl font-bold text-teal-600">₹{viewingReturn.total_amount.toLocaleString()}</span>
                        </div>

                        <div className="flex gap-3 pt-4 border-t border-slate-100">
                            <Button variant="secondary" onClick={() => setViewingReturn(null)} className="flex-1">
                                Close
                            </Button>
                            <Button
                                onClick={() => printReturn(viewingReturn)}
                                className="flex-1"
                                leftIcon={<Printer size={18} />}
                            >
                                Print Return Slip
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Cancel Confirmation */}
            <ConfirmModal
                isOpen={cancelConfirm.open}
                onClose={() => setCancelConfirm({ open: false, return: null })}
                onConfirm={handleCancelReturn}
                title="Cancel Return"
                message={`Are you sure you want to cancel return ${cancelConfirm.return?.return_no}? This will reverse the stock changes.`}
                confirmText="Cancel Return"
                variant="danger"
                isLoading={isCancelling}
            />
        </div>
    );
};
