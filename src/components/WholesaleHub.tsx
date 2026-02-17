import {
    BookOpen,
    CreditCard,
    Edit2,
    IndianRupee,
    MapPin,
    Phone,
    Plus,
    Search,
    Send,
    Store,
    Trash2,
    User
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { creditService } from "../db/creditService";
import { wholesaleStoreService } from "../db/wholesaleStoreService";
import { useAuthSession } from "../hooks";
import {
    CreditInvoiceSummary,
    PaymentMode,
    WholesaleStore,
    WholesaleStoreFormData,
    emptyStoreForm
} from "../types";
import { sharePaymentReceiptOnWhatsApp } from "../utils/shareWhatsApp";
import { Badge, Button, Card, ConfirmModal, EmptyState, Input, Modal, useToast } from "./ui";

type Tab = "stores" | "ledger";

export const WholesaleHub: React.FC = () => {
  const toast = useToast();
  const { session } = useAuthSession();
  const [activeTab, setActiveTab] = useState<Tab>("stores");

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Wholesale</h1>
          <p className="text-sm text-slate-500 mt-1">Manage stores and track credit payments</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab("stores")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "stores"
              ? "bg-white text-indigo-700 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Store size={16} />
          Store Management
        </button>
        <button
          onClick={() => setActiveTab("ledger")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "ledger"
              ? "bg-white text-indigo-700 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <BookOpen size={16} />
          Credit Ledger
        </button>
      </div>

      {activeTab === "stores" ? (
        <StoreManager toast={toast} />
      ) : (
        <CreditLedger toast={toast} isAdmin={session?.role === "admin"} />
      )}
    </div>
  );
};

// ============================================
// STORE MANAGER
// ============================================

const StoreManager: React.FC<{ toast: ReturnType<typeof useToast> }> = ({ toast }) => {
  const [stores, setStores] = useState<WholesaleStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingStore, setEditingStore] = useState<WholesaleStore | null>(null);
  const [form, setForm] = useState<WholesaleStoreFormData>(emptyStoreForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WholesaleStore | null>(null);

  const loadStores = useCallback(async () => {
    try {
      setLoading(true);
      const data = await wholesaleStoreService.getAll();
      setStores(data);
    } catch (error) {
      console.error(error);
      toast.error("Load Failed", "Could not load wholesale stores");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const filteredStores = useMemo(() => {
    if (!search) return stores;
    const lower = search.toLowerCase();
    return stores.filter(
      (s) =>
        s.store_name.toLowerCase().includes(lower) ||
        s.contact_person.toLowerCase().includes(lower) ||
        s.contact_number.includes(lower)
    );
  }, [stores, search]);

  const openAdd = () => {
    setEditingStore(null);
    setForm(emptyStoreForm);
    setShowModal(true);
  };

  const openEdit = (store: WholesaleStore) => {
    setEditingStore(store);
    setForm({
      store_name: store.store_name,
      contact_person: store.contact_person,
      contact_number: store.contact_number,
      store_address: store.store_address,
      credit_limit: store.credit_limit > 0 ? String(store.credit_limit) : "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.store_name.trim()) {
      toast.warning("Validation", "Store name is required");
      return;
    }
    if (!form.contact_person.trim()) {
      toast.warning("Validation", "Contact person is required");
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (editingStore) {
        const updated: WholesaleStore = {
          ...editingStore,
          store_name: form.store_name.trim(),
          contact_person: form.contact_person.trim(),
          contact_number: form.contact_number.trim(),
          store_address: form.store_address.trim(),
          credit_limit: parseFloat(form.credit_limit) || 0,
          updated_at: now,
        };
        await wholesaleStoreService.update(updated);
        toast.success("Store Updated", `${form.store_name} has been updated`);
      } else {
        const newStore: WholesaleStore = {
          id: crypto.randomUUID(),
          store_name: form.store_name.trim(),
          contact_person: form.contact_person.trim(),
          contact_number: form.contact_number.trim(),
          store_address: form.store_address.trim(),
          credit_limit: parseFloat(form.credit_limit) || 0,
          is_active: true,
          created_at: now,
          updated_at: now,
        };
        await wholesaleStoreService.add(newStore);
        toast.success("Store Added", `${form.store_name} has been added`);
      }
      setShowModal(false);
      loadStores();
    } catch (error) {
      console.error(error);
      toast.error("Save Failed", "Could not save store");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await wholesaleStoreService.deactivate(deleteTarget.id);
      toast.success("Store Deactivated", `${deleteTarget.store_name} has been deactivated`);
      setDeleteTarget(null);
      loadStores();
    } catch (error) {
      console.error(error);
      toast.error("Delete Failed", "Could not deactivate store");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search stores..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={openAdd} leftIcon={<Plus size={16} />}>
          Add Store
        </Button>
      </div>

      {/* Store List */}
      {filteredStores.length === 0 ? (
        <EmptyState
          icon={Store}
          title={search ? "No stores found" : "No wholesale stores yet"}
          description={search ? "Try a different search" : "Add your first wholesale store to get started"}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredStores.map((store) => (
            <Card key={store.id} className="hover:shadow-md transition-shadow">
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                      <Store size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">{store.store_name}</h3>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <User size={12} /> {store.contact_person}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(store)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(store)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-slate-600">
                  {store.contact_number && (
                    <p className="flex items-center gap-2">
                      <Phone size={14} className="text-slate-400" />
                      {store.contact_number}
                    </p>
                  )}
                  {store.store_address && (
                    <p className="flex items-center gap-2">
                      <MapPin size={14} className="text-slate-400" />
                      <span className="line-clamp-1">{store.store_address}</span>
                    </p>
                  )}
                  {store.credit_limit > 0 && (
                    <p className="flex items-center gap-2">
                      <CreditCard size={14} className="text-slate-400" />
                      Credit Limit: ₹{store.credit_limit.toLocaleString()} / sale
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingStore ? "Edit Store" : "Add Store"}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Store Name *"
            placeholder="e.g. ABC Auto Parts"
            value={form.store_name}
            onChange={(e) => setForm({ ...form, store_name: e.target.value })}
          />
          <Input
            label="Contact Person *"
            placeholder="e.g. John Doe"
            value={form.contact_person}
            onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
          />
          <Input
            label="Contact Number"
            placeholder="e.g. 9876543210"
            type="tel"
            value={form.contact_number}
            onChange={(e) => setForm({ ...form, contact_number: e.target.value })}
          />
          <Input
            label="Store Address"
            placeholder="e.g. 123 Market St"
            value={form.store_address}
            onChange={(e) => setForm({ ...form, store_address: e.target.value })}
          />
          <Input
            label="Per-Sale Credit Limit (₹)"
            placeholder="0 = no limit"
            type="number"
            value={form.credit_limit}
            onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
          />
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSave} className="flex-1" disabled={saving}>
              {saving ? "Saving..." : editingStore ? "Update" : "Add Store"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Deactivate Store"
        message={`Are you sure you want to deactivate "${deleteTarget?.store_name}"? The store will no longer appear in billing but its records will be kept.`}
        confirmText="Deactivate"
        variant="danger"
      />
    </div>
  );
};

// ============================================
// CREDIT LEDGER
// ============================================

const CreditLedger: React.FC<{ toast: ReturnType<typeof useToast>; isAdmin?: boolean }> = ({ toast, isAdmin = false }) => {
  const [stores, setStores] = useState<WholesaleStore[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [ledger, setLedger] = useState<CreditInvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unpaid" | "partial" | "paid">("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentMode>("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "pending_desc" | "pending_asc">("date_desc");

  // Payment modal
  const [paymentTarget, setPaymentTarget] = useState<CreditInvoiceSummary | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Payment history modal
  const [historyTarget, setHistoryTarget] = useState<CreditInvoiceSummary | null>(null);

  // Delete payment confirmation
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<{ paymentId: string; invoiceId: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [storeList, ledgerData] = await Promise.all([
        wholesaleStoreService.getAll(),
        creditService.getCreditLedger(selectedStoreId || undefined),
      ]);
      setStores(storeList);
      setLedger(ledgerData);
    } catch (error) {
      console.error(error);
      toast.error("Load Failed", "Could not load credit ledger");
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredLedger = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();

    const filtered = ledger.filter((entry) => {
      const matchesSearch =
        !search ||
        entry.store.store_name.toLowerCase().includes(search) ||
        (entry.invoice.invoice_number || "").toLowerCase().includes(search);

      const matchesStatus = statusFilter === "all" || entry.status === statusFilter;
      const invoicePaymentMode = entry.invoice.payment_mode ?? "cash";
      const matchesPayment = paymentFilter === "all" || invoicePaymentMode === paymentFilter;

      return matchesSearch && matchesStatus && matchesPayment;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "date_asc":
          return new Date(a.invoice.date).getTime() - new Date(b.invoice.date).getTime();
        case "date_desc":
          return new Date(b.invoice.date).getTime() - new Date(a.invoice.date).getTime();
        case "amount_asc":
          return a.invoice.grand_total - b.invoice.grand_total;
        case "amount_desc":
          return b.invoice.grand_total - a.invoice.grand_total;
        case "pending_asc":
          return a.outstanding - b.outstanding;
        case "pending_desc":
          return b.outstanding - a.outstanding;
      }
    });

    return filtered;
  }, [ledger, paymentFilter, searchQuery, sortBy, statusFilter]);

  const totalOutstanding = useMemo(
    () => filteredLedger.reduce((sum, s) => sum + s.outstanding, 0),
    [filteredLedger]
  );

  const pendingCount = useMemo(
    () => filteredLedger.filter((s) => s.status !== "paid").length,
    [filteredLedger]
  );

  const handleRecordPayment = async () => {
    if (!paymentTarget) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      toast.warning("Invalid Amount", "Please enter a valid payment amount");
      return;
    }
    if (amount > paymentTarget.outstanding) {
      toast.warning("Exceeds Outstanding", `Outstanding amount is only ₹${paymentTarget.outstanding.toLocaleString()}`);
      return;
    }

    setRecordingPayment(true);
    try {
      await creditService.recordPayment({
        storeId: paymentTarget.store.id,
        invoiceId: paymentTarget.invoice.id,
        amount,
        paymentMode,
        notes: paymentNotes.trim() || null,
      });

      const newPending = paymentTarget.outstanding - amount;

      // Send payment receipt via WhatsApp
      try {
        await sharePaymentReceiptOnWhatsApp({
          store: paymentTarget.store,
          invoiceNumber: paymentTarget.invoice.invoice_number,
          billAmount: paymentTarget.invoice.grand_total,
          paidAmount: paymentTarget.total_paid + amount,
          pendingAmount: newPending,
          paymentMode,
        });
      } catch (whatsappError) {
        console.error("WhatsApp receipt failed:", whatsappError);
      }

      toast.success(
        "Payment Recorded",
        `₹${amount.toLocaleString()} received for Invoice #${paymentTarget.invoice.invoice_number}${newPending <= 0 ? " — Fully Paid!" : ""}`
      );

      setPaymentTarget(null);
      setPaymentAmount("");
      setPaymentMode("cash");
      setPaymentNotes("");
      loadData();
    } catch (error) {
      console.error(error);
      toast.error("Payment Failed", "Could not record payment");
    } finally {
      setRecordingPayment(false);
    }
  };

  const handleResendReceipt = async (summary: CreditInvoiceSummary, payment?: { amount: number; payment_mode: PaymentMode }) => {
    try {
      const pendingAmount = summary.outstanding;
      await sharePaymentReceiptOnWhatsApp({
        store: summary.store,
        invoiceNumber: summary.invoice.invoice_number,
        billAmount: summary.invoice.grand_total,
        paidAmount: summary.total_paid,
        pendingAmount,
        paymentMode: payment?.payment_mode || "cash",
      });
      toast.success("Receipt Sent", "Receipt shared via WhatsApp");
    } catch (error) {
      console.error("WhatsApp share failed:", error);
      toast.error("Send Failed", "Could not open WhatsApp");
    }
  };

  const handleDeletePayment = async () => {
    if (!deletePaymentTarget) return;
    try {
      await creditService.deletePayment(deletePaymentTarget.paymentId, deletePaymentTarget.invoiceId);
      toast.success("Payment Deleted", "Payment record has been removed");
      setDeletePaymentTarget(null);
      // Refresh history target
      if (historyTarget) {
        setHistoryTarget(null);
      }
      loadData();
    } catch (error) {
      console.error(error);
      toast.error("Delete Failed", "Could not delete payment record");
    }
  };

  const statusBadge = (status: CreditInvoiceSummary["status"]) => {
    switch (status) {
      case "unpaid":
        return <Badge variant="danger">Unpaid</Badge>;
      case "partial":
        return <Badge variant="warning">Partial</Badge>;
      case "paid":
        return <Badge variant="success">Paid</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-red-500 h-22">
          <div className="h-full p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
              <IndianRupee size={22} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Outstanding</p>
              <p className="text-xl font-bold text-slate-800">₹{totalOutstanding.toLocaleString()}</p>
            </div>
          </div>
        </Card>

        <Card className="border-l-4 border-l-amber-500 h-22">
          <div className="h-full p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <BookOpen size={22} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Pending Invoices</p>
              <p className="text-xl font-bold text-slate-800">{pendingCount}</p>
            </div>
          </div>
        </Card>

        <Card className="border-l-4 border-l-indigo-500 h-22">
          <div className="h-full p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Store size={22} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Invoices</p>
              <p className="text-xl font-bold text-slate-800">{filteredLedger.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <Search size={16} className="text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by store or invoice..."
            className="flex-1 bg-transparent text-sm text-slate-700 outline-none"
          />
        </div>

        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 w-72">
          <Store size={16} className="text-slate-400" />
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="flex-1 bg-transparent text-sm text-slate-700 outline-none font-medium"
          >
            <option value="">All Stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.store_name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <BookOpen size={16} className="text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "unpaid" | "partial" | "paid")}
            className="flex-1 bg-transparent text-sm text-slate-700 outline-none font-medium"
          >
            <option value="all">All Status</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <CreditCard size={16} className="text-slate-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "pending_desc" | "pending_asc")}
            className="flex-1 bg-transparent text-sm text-slate-700 outline-none font-medium"
          >
            <option value="date_desc">Sort: Newest</option>
            <option value="date_asc">Sort: Oldest</option>
            <option value="amount_desc">Sort: Bill High → Low</option>
            <option value="amount_asc">Sort: Bill Low → High</option>
            <option value="pending_desc">Sort: Pending High → Low</option>
            <option value="pending_asc">Sort: Pending Low → High</option>
          </select>
        </div>

        <div className="md:col-span-2 xl:col-span-4 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <CreditCard size={16} className="text-slate-400" />
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as "all" | PaymentMode)}
            className="bg-transparent text-sm text-slate-700 outline-none font-medium"
          >
            <option value="all">All Payment Modes</option>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="credit">Credit</option>
          </select>
          {(searchQuery || statusFilter !== "all" || paymentFilter !== "all" || sortBy !== "date_desc") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
                setPaymentFilter("all");
                setSortBy("date_desc");
              }}
              className="ml-auto text-xs font-semibold text-indigo-700 hover:text-indigo-800"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Ledger Table */}
      {ledger.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No wholesale invoices"
          description={selectedStoreId ? "No invoices found for this store" : "Create wholesale invoices from the Billing page"}
        />
      ) : filteredLedger.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No matching results"
          description="Try changing filters or search terms"
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider px-5 py-3">Invoice</th>
                  <th className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider px-5 py-3">Store</th>
                  <th className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider px-5 py-3">Date</th>
                  <th className="text-right text-xs font-bold text-slate-400 uppercase tracking-wider px-5 py-3">Bill Amount</th>
                  <th className="text-right text-xs font-bold text-slate-400 uppercase tracking-wider px-5 py-3">Paid</th>
                  <th className="text-right text-xs font-bold text-slate-400 uppercase tracking-wider px-5 py-3">Pending</th>
                  <th className="text-center text-xs font-bold text-slate-400 uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="text-center text-xs font-bold text-slate-400 uppercase tracking-wider px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedger.map((summary) => (
                  <tr key={summary.invoice.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-semibold text-sm text-slate-800">
                        #{summary.invoice.invoice_number}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm text-slate-700">{summary.store.store_name}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm text-slate-500">
                        {new Date(summary.invoice.date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-sm font-medium text-slate-700">
                        ₹{summary.invoice.grand_total.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-sm font-medium text-green-600">
                        ₹{summary.total_paid.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-sm font-bold ${summary.outstanding > 0 ? "text-red-600" : "text-slate-400"}`}>
                        ₹{summary.outstanding.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {statusBadge(summary.status)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {summary.status !== "paid" && (
                          <button
                            onClick={() => {
                              setPaymentTarget(summary);
                              setPaymentAmount("");
                              setPaymentMode("cash");
                              setPaymentNotes("");
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1"
                          >
                            Record Payment
                          </button>
                        )}
                        <button
                          onClick={() => handleResendReceipt(summary)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition-colors flex items-center gap-1"
                          title="Resend receipt via WhatsApp"
                        >
                          Resend
                        </button>
                        {summary.payments.length > 0 && (
                          <button
                            onClick={() => setHistoryTarget(summary)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                          >
                            History
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Record Payment Modal */}
      <Modal
        isOpen={!!paymentTarget}
        onClose={() => setPaymentTarget(null)}
        title="Record Payment"
        size="md"
      >
        {paymentTarget && (
          <div className="space-y-4">
            {/* Invoice Info */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Invoice</span>
                <span className="font-semibold text-slate-800">#{paymentTarget.invoice.invoice_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Store</span>
                <span className="font-medium text-slate-700">{paymentTarget.store.store_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Bill Amount</span>
                <span className="font-medium text-slate-700">₹{paymentTarget.invoice.grand_total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Already Paid</span>
                <span className="font-medium text-green-600">₹{paymentTarget.total_paid.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                <span className="font-bold text-slate-700">Outstanding</span>
                <span className="font-bold text-red-600">₹{paymentTarget.outstanding.toLocaleString()}</span>
              </div>
            </div>

            {/* Items */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Items in this invoice</p>
              <div className="bg-slate-50 rounded-xl p-3 space-y-1 max-h-32 overflow-y-auto">
                {(paymentTarget.invoice.items || []).map((item, i) => (
                  <div key={i} className="flex justify-between text-xs text-slate-600">
                    <span>{item.name} × {item.qty}</span>
                    <span>₹{item.total.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Form */}
            <Input
              label="Payment Amount (₹)"
              type="number"
              placeholder={`Max ₹${paymentTarget.outstanding.toLocaleString()}`}
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              autoFocus
            />

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 ml-1">Payment Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {(["cash", "upi", "card"] as PaymentMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setPaymentMode(mode)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      paymentMode === mode
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {mode === "cash" ? "Cash" : mode === "upi" ? "UPI" : "Card"}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="Notes (optional)"
              placeholder="e.g. Partial payment for week 1"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
            />

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={() => setPaymentTarget(null)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleRecordPayment}
                className="flex-1"
                disabled={recordingPayment}
              >
                {recordingPayment ? "Recording..." : "Record & Send Receipt"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Payment History Modal */}
      <Modal
        isOpen={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        title={`Payment History — #${historyTarget?.invoice.invoice_number || ""}`}
        size="md"
      >
        {historyTarget && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="text-sm text-slate-500">Bill Amount</p>
                <p className="text-lg font-bold text-slate-800">₹{historyTarget.invoice.grand_total.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Outstanding</p>
                <p className={`text-lg font-bold ${historyTarget.outstanding > 0 ? "text-red-600" : "text-green-600"}`}>
                  ₹{historyTarget.outstanding.toLocaleString()}
                </p>
              </div>
            </div>

            {historyTarget.payments.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">No payments recorded yet</p>
            ) : (
              <div className="space-y-2">
                {historyTarget.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-green-600">₹{payment.amount.toLocaleString()}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(payment.payment_date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {payment.notes && (
                        <p className="text-xs text-slate-400 mt-0.5">{payment.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral" size="sm">
                        {payment.payment_mode.toUpperCase()}
                      </Badge>
                      <button
                        onClick={() => handleResendReceipt(historyTarget, { amount: payment.amount, payment_mode: payment.payment_mode })}
                        className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                        title="Resend receipt"
                      >
                        <Send size={14} />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => setDeletePaymentTarget({ paymentId: payment.id, invoiceId: historyTarget.invoice.id })}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                          title="Delete payment (Admin)"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setHistoryTarget(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Payment Confirmation */}
      <ConfirmModal
        isOpen={!!deletePaymentTarget}
        onClose={() => setDeletePaymentTarget(null)}
        onConfirm={handleDeletePayment}
        title="Delete Payment"
        message="Are you sure you want to delete this payment record? This will update the invoice's outstanding balance."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
};
