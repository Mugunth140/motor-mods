import { message } from "@tauri-apps/plugin-dialog";
import { MessageCircle, Printer, X } from "lucide-react";
import React from "react";
import { InvoiceRecord } from "../types";
import { shareInvoiceOnWhatsApp } from "../utils/shareWhatsApp";
import { Button, useToast } from "./ui";

interface InvoiceViewProps {
  invoice: InvoiceRecord;
  onClose: () => void;
}

export const InvoiceView: React.FC<InvoiceViewProps> = ({ invoice, onClose }) => {
  const toast = useToast();

  const handleWhatsApp = async () => {
    if (!invoice.customer_phone) {
      toast.warning("Missing Phone", "Add a customer phone to send WhatsApp");
      return;
    }
    await shareInvoiceOnWhatsApp(invoice);
    toast.success("WhatsApp opened with invoice", "Message ready to send");
  };

  const handlePrint = async () => {
    await message("Printer not configured", { title: "Print", kind: "warning" });
  };

  const subtotal = invoice.items.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/60">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Invoice #{invoice.invoice_number}</h3>
          <p className="text-xs text-slate-500 mt-1">
            {new Date(invoice.date).toLocaleString("en-IN")}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
          title="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-5 space-y-5">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Customer</span>
          <div className="text-slate-700 font-semibold">{invoice.customer_name || "Walking Customer"}</div>
          {invoice.customer_phone && (
            <div className="text-sm text-slate-500">{invoice.customer_phone}</div>
          )}
        </div>

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
              {invoice.items.map((item, idx) => (
                <tr key={`${item.name}-${idx}`}>
                  <td className="p-3 font-medium text-slate-800">{item.name}</td>
                  <td className="p-3 text-center text-slate-600">{item.qty}</td>
                  <td className="p-3 text-right text-slate-600">₹{item.rate.toLocaleString("en-IN")}</td>
                  <td className="p-3 text-right font-semibold text-slate-800">₹{item.total.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
          <div className="flex justify-between text-sm text-teal-900/80">
            <span>Subtotal</span>
            <span className="font-semibold">₹{subtotal.toLocaleString("en-IN")}</span>
          </div>
          <div className="mt-2 pt-2 border-t border-teal-200 flex justify-between items-center">
            <span className="font-bold text-teal-900">Grand Total</span>
            <span className="text-xl font-bold text-teal-600">₹{invoice.grand_total.toLocaleString("en-IN")}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleWhatsApp} leftIcon={<MessageCircle size={18} />} className="flex-1 h-11 bg-teal-600 hover:bg-teal-700">
            Send WhatsApp
          </Button>
          <Button variant="secondary" onClick={handlePrint} leftIcon={<Printer size={18} />} className="flex-1 h-11">
            Print
          </Button>
        </div>
      </div>
    </div>
  );
};
