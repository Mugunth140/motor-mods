import { message } from "@tauri-apps/plugin-dialog";
import { Edit3, Printer, Save, X } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { invoiceManagementService } from "../db/invoiceManagementService";
import { InvoiceRecord } from "../types";
import { Button, useToast } from "./ui";

interface InvoiceViewProps {
  invoice: InvoiceRecord;
  onInvoiceUpdated: (invoice: InvoiceRecord) => void;
}

const normalizePhoneForCompare = (phone: string | null): string => {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
};

export const InvoiceView: React.FC<InvoiceViewProps> = ({ invoice, onInvoiceUpdated }) => {
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [customerName, setCustomerName] = useState(invoice.customer_name || "");
  const [customerPhone, setCustomerPhone] = useState(invoice.customer_phone || "");
  const [nameError, setNameError] = useState<string>("");
  const [phoneError, setPhoneError] = useState<string>("");

  useEffect(() => {
    setIsEditing(false);
    setIsSaving(false);
    setCustomerName(invoice.customer_name || "");
    setCustomerPhone(invoice.customer_phone || "");
    setNameError("");
    setPhoneError("");
  }, [invoice]);

  const handlePrint = async () => {
    await message("Printer not configured", { title: "Print", kind: "warning" });
  };

  const productItems = invoice.items.filter(i => !i.item_type || i.item_type === "product");
  const serviceItems = invoice.items.filter(i => i.item_type === "service");
  const materialItems = invoice.items.filter(i => i.item_type === "material");
  const subtotal = invoice.subtotal > 0 ? invoice.subtotal : productItems.reduce((sum, i) => sum + i.total, 0);
  const discountAmount = invoice.discount_amount !== undefined
    ? invoice.discount_amount
    : Math.max(0, subtotal - invoice.grand_total);
  const materialsTotal = materialItems.reduce((sum, i) => sum + i.total, 0);
  const serviceTotal = serviceItems.reduce((sum, i) => sum + i.total, 0);

  const hasChanges = useMemo(() => {
    const nextName = customerName.trim() || "Walking Customer";
    const currentName = invoice.customer_name?.trim() || "Walking Customer";
    const nextPhone = normalizePhoneForCompare(customerPhone || null);
    const currentPhone = normalizePhoneForCompare(invoice.customer_phone);
    return nextName !== currentName || nextPhone !== currentPhone;
  }, [customerName, customerPhone, invoice.customer_name, invoice.customer_phone]);

  const validateEditForm = (): boolean => {
    setNameError("");
    setPhoneError("");
    const trimmedName = customerName.trim();
    const phoneDigits = customerPhone.replace(/\D/g, "");
    if (trimmedName.length > 120) {
      setNameError("Customer name must be 120 characters or less.");
      return false;
    }
    if (customerPhone.trim() && (phoneDigits.length < 10 || phoneDigits.length > 15)) {
      setPhoneError("Enter a valid phone number (10 to 15 digits).");
      return false;
    }
    return true;
  };

  const handleEditToggle = () => {
    if (isEditing) {
      setCustomerName(invoice.customer_name || "");
      setCustomerPhone(invoice.customer_phone || "");
      setNameError("");
      setPhoneError("");
      setIsEditing(false);
      return;
    }
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!validateEditForm()) return;
    if (!hasChanges) {
      setIsEditing(false);
      return;
    }
    try {
      setIsSaving(true);
      const updated = await invoiceManagementService.updateInvoiceCustomerDetails({
        invoiceId: invoice.id,
        customerName: customerName.trim() || "Walking Customer",
        customerPhone: customerPhone.trim() || null,
      });
      onInvoiceUpdated(updated);
      setIsEditing(false);
      toast.success("Invoice updated", "Customer details saved successfully.");
    } catch (error) {
      console.error(error);
      toast.error("Update failed", "Could not save customer details.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/60">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Invoice #{invoice.invoice_number}</h3>
          <p className="text-xs text-slate-500 mt-1">{new Date(invoice.date).toLocaleString("en-IN")}</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Customer */}
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 bg-slate-50/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Customer</span>
            {!isEditing && (
              <Button variant="outline" size="sm" onClick={handleEditToggle} leftIcon={<Edit3 size={14} />}>
                Edit
              </Button>
            )}
          </div>
          {isEditing ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Customer Name</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  maxLength={120}
                  placeholder="Walking Customer"
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${nameError ? "border-red-300 focus:border-red-500" : "border-slate-200 focus:border-indigo-500"}`}
                />
                {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Phone Number</label>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+91XXXXXXXXXX"
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${phoneError ? "border-red-300 focus:border-red-500" : "border-slate-200 focus:border-indigo-500"}`}
                />
                {phoneError && <p className="mt-1 text-xs text-red-500">{phoneError}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} isLoading={isSaving} disabled={!hasChanges || isSaving} leftIcon={<Save size={14} />} className="h-9">
                  Save Changes
                </Button>
                <Button variant="secondary" size="sm" onClick={handleEditToggle} disabled={isSaving} leftIcon={<X size={14} />} className="h-9">
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-slate-700 font-semibold">{invoice.customer_name || "Walking Customer"}</div>
              {invoice.customer_phone && <div className="text-sm text-slate-500">{invoice.customer_phone}</div>}
            </>
          )}
        </div>

        {/* Products — main table (full size) */}
        <div className="border border-slate-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500">
                <th className="text-left p-3">Item</th>
                <th className="text-center p-3">Qty</th>
                <th className="text-right p-3">Rate</th>
                <th className="text-right p-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productItems.map((item, idx) => (
                <tr key={`${item.name}-${idx}`}>
                  <td className="p-3 font-medium text-slate-800">{item.name}</td>
                  <td className="p-3 text-center text-slate-600">{item.qty}</td>
                  <td className="p-3 text-right text-slate-600">&#x20B9;{item.rate.toLocaleString("en-IN")}</td>
                  <td className="p-3 text-right font-semibold text-slate-800">&#x20B9;{item.total.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Service Charge — simple inline row, no table, comes before materials */}
        {serviceItems.length > 0 && (
          <div className="space-y-1">
            {serviceItems.map((item, idx) => (
              <div key={`svc-${idx}`} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0">Service</span>
                  <span className="text-xs text-slate-600 truncate">{item.name}</span>
                </div>
                <span className="text-xs font-semibold text-slate-700 shrink-0 ml-3">&#x20B9;{item.total.toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        )}

        {/* Materials Used — compact sub-table, grey/slate tones, smaller size */}
        {materialItems.length > 0 && (
          <div className="rounded-lg border border-slate-200/80 overflow-hidden">
            <div className="px-3 py-1.5 bg-slate-100/80 border-b border-slate-200/80">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Materials Used</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/60">
                  <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold text-slate-400">Item</th>
                  <th className="text-center px-2 py-1.5 text-[10px] font-semibold text-slate-400">Qty</th>
                  <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-slate-400">Rate</th>
                  <th className="text-right px-2.5 py-1.5 text-[10px] font-semibold text-slate-400">Amt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materialItems.map((item, idx) => (
                  <tr key={`mat-${item.name}-${idx}`}>
                    <td className="px-2.5 py-1.5 text-[11px] text-slate-600 font-medium">{item.name}</td>
                    <td className="px-2 py-1.5 text-[11px] text-center text-slate-500">{item.qty}</td>
                    <td className="px-2 py-1.5 text-[11px] text-right text-slate-500">&#x20B9;{item.rate.toLocaleString("en-IN")}</td>
                    <td className="px-2.5 py-1.5 text-[11px] text-right text-slate-600 font-semibold">&#x20B9;{item.total.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
          <div className="flex justify-between text-sm text-teal-900/80">
            <span>Subtotal</span>
            <span className="font-semibold">&#x20B9;{subtotal.toLocaleString("en-IN")}</span>
          </div>
          <div className="mt-2 flex justify-between text-sm text-teal-900/80">
            <span>Discount</span>
            <span className="font-semibold">- &#x20B9;{discountAmount.toLocaleString("en-IN")}</span>
          </div>
          {serviceTotal > 0 && (
            <div className="mt-2 flex justify-between text-sm text-teal-900/80">
              <span>Service Charge</span>
              <span className="font-semibold">&#x20B9;{serviceTotal.toLocaleString("en-IN")}</span>
            </div>
          )}
          {materialsTotal > 0 && (
            <div className="mt-2 flex justify-between text-sm text-teal-900/80">
              <span>Materials</span>
              <span className="font-semibold">&#x20B9;{materialsTotal.toLocaleString("en-IN")}</span>
            </div>
          )}
          <div className="mt-2 pt-2 border-t border-teal-200 flex justify-between items-center">
            <span className="font-bold text-teal-900">Grand Total</span>
            <span className="text-xl font-bold text-teal-600">&#x20B9;{invoice.grand_total.toLocaleString("en-IN")}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={handlePrint} leftIcon={<Printer size={18} />} className="flex-1 h-11">
            Print
          </Button>
          {!isEditing && (
            <Button variant="outline" onClick={handleEditToggle} leftIcon={<Edit3 size={18} />} className="flex-1 h-11">
              Edit Customer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};