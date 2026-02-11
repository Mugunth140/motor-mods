import { InvoiceRecord } from "../types";
import { getInvoiceFilename } from "./getInvoicePath";

const normalizeWhatsAppPhone = (phone: string | null) => {
  if (!phone) return "";
  if (phone.startsWith("+91")) {
    return phone.slice(3);
  }
  return phone.replace(/\D/g, "");
};

export const shareInvoiceOnWhatsApp = async (invoice: InvoiceRecord): Promise<void> => {
  const phone = normalizeWhatsAppPhone(invoice.customer_phone);
  const pdfName = getInvoiceFilename(invoice.invoice_number);
  const text = encodeURIComponent(`Invoice ${invoice.invoice_number}: ${pdfName}\nDownload attached.`);
  const url = `https://wa.me/${phone}?text=${text}`;
  try {
    const openerModule = await import("@tauri-apps/plugin-opener");
    const opener = openerModule.open ?? openerModule.openUrl ?? openerModule.openPath;
    if (opener) {
      await opener(url);
      return;
    }
  } catch {
    // Fall back to browser open if plugin isn't available.
  }

  if (typeof window !== "undefined") {
    window.open(url, "_blank");
  }
};
