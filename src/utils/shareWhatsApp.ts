import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../db/runtime";
import { InvoiceRecord, WholesaleStore } from "../types";
import { getInvoiceFilename, resolveExistingInvoicePdfPath } from "./getInvoicePath";

const normalizeWhatsAppPhone = (phone: string | null) => {
  if (!phone) return "";
  if (phone.startsWith("+91")) {
    return phone.slice(3);
  }
  return phone.replace(/\D/g, "");
};

const formatInvoiceDate = (isoDate: string): string => {
  return new Date(isoDate).toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildProfessionalMessage = (invoice: InvoiceRecord): string => {
  const customer = invoice.customer_name?.trim() && invoice.customer_name !== "Walking Customer"
    ? invoice.customer_name.trim()
    : "Customer";
  const total = invoice.grand_total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const invoiceDate = formatInvoiceDate(invoice.date);

  return [
    `Hello ${customer},`,
    "",
    "Please find your invoice attached.",
    `Invoice No: ${invoice.invoice_number}`,
    `Date: ${invoiceDate}`,
    `Total Amount: INR ${total}`,
    "",
    "Thank you for choosing MotorMods.",
  ].join("\n");
};

const toFileUri = (filePath: string) => `file:///${filePath.replace(/\\/g, "/")}`;

const openWhatsAppWithInvoiceAttachment = async (
  phone: string,
  message: string,
  invoiceNumber: string
): Promise<void> => {
  const pdfName = getInvoiceFilename(invoiceNumber);
  const text = encodeURIComponent(`${message}\n\nAttachment: ${pdfName}`);

  const desktopDeepLink = `whatsapp://send?phone=${phone}&text=${text}`;
  const webFallbackUrl = `https://wa.me/${phone}?text=${text}`;

  if (isTauriRuntime()) {
    try {
      const { openUrl, revealItemInDir } = await import("@tauri-apps/plugin-opener");
      let pdfPath: string | null = null;

      try {
        pdfPath = await resolveExistingInvoicePdfPath(invoiceNumber);
      } catch {
        // Continue with text-only deep link if PDF path cannot be resolved.
      }

      if (pdfPath) {
        try {
          await invoke("share_whatsapp_with_attachment", {
            deeplinkUrl: desktopDeepLink,
            pdfPath,
          });
          return;
        } catch {
          // Fall back to deeplink variants if native attach flow fails.
        }
      }

      const deeplinks: string[] = [];
      if (pdfPath) {
        const encodedFileUri = encodeURIComponent(toFileUri(pdfPath));
        deeplinks.push(`${desktopDeepLink}&attachment=${encodedFileUri}&document=${encodedFileUri}&media=${encodedFileUri}`);
        deeplinks.push(`${desktopDeepLink}&attachment=${encodedFileUri}`);
        deeplinks.push(`${desktopDeepLink}&document=${encodedFileUri}`);
      }
      deeplinks.push(desktopDeepLink);

      let opened = false;
      for (const link of deeplinks) {
        try {
          await openUrl(link);
          opened = true;
          break;
        } catch {
          // Try the next deep link variant.
        }
      }

      if (!opened) {
        await openUrl(webFallbackUrl);
      }

      try {
        if (pdfPath) {
          await revealItemInDir(pdfPath);
        }
      } catch {
        // Ignore if reveal is unavailable; deeplink was already opened.
      }

      return;
    } catch {
      // Fall through to browser fallback.
    }
  }

  try {
    const openerModule = await import("@tauri-apps/plugin-opener");
    if (openerModule.openUrl) {
      await openerModule.openUrl(webFallbackUrl);
      return;
    }
  } catch {
    // Fall back to browser open if plugin isn't available.
  }

  if (typeof window !== "undefined") {
    window.open(webFallbackUrl, "_blank");
  }
};

export const shareInvoiceOnWhatsApp = async (invoice: InvoiceRecord): Promise<void> => {
  const phone = normalizeWhatsAppPhone(invoice.customer_phone);
  const message = buildProfessionalMessage(invoice);
  await openWhatsAppWithInvoiceAttachment(phone, message, invoice.invoice_number);
};

/**
 * Build a professional WhatsApp message for wholesale invoices.
 * Includes line items, total, and pending amount info for credit invoices.
 */
const buildWholesaleMessage = (
  invoice: InvoiceRecord,
  store: WholesaleStore,
  pendingAmount: number
): string => {
  const total = invoice.grand_total.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const invoiceDate = formatInvoiceDate(invoice.date);

  const itemLines = (invoice.items || [])
    .map(
      (item, i) =>
        `${i + 1}. ${item.name} × ${item.qty} = ₹${item.total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    )
    .join("\n");

  const lines: string[] = [
    `Hello ${store.contact_person || store.store_name},`,
    "",
    `Here is your wholesale invoice from *MotorMods*.`,
    "",
    `Invoice No: ${invoice.invoice_number}`,
    `Date: ${invoiceDate}`,
    `Store: ${store.store_name}`,
    "",
    `*Items:*`,
    itemLines,
    "",
    `*Total Amount: ₹${total}*`,
  ];

  if (pendingAmount > 0) {
    const pending = pendingAmount.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    lines.push("");
    lines.push(`*Payment Pending: ₹${pending}*`);
    lines.push(`Please clear the pending amount at your earliest convenience.`);
  } else {
    lines.push("");
    lines.push(`Payment received. Thank you!`);
  }

  lines.push("");
  lines.push("Thank you for your business!");
  lines.push("— MotorMods");

  return lines.join("\n");
};

/**
 * Share a wholesale invoice on WhatsApp with pending amount info.
 * Uses the store's contact number.
 */
export const shareWholesaleInvoiceOnWhatsApp = async (
  invoice: InvoiceRecord,
  store: WholesaleStore,
  pendingAmount: number
): Promise<void> => {
  const phone = normalizeWhatsAppPhone(store.contact_number);
  const message = buildWholesaleMessage(invoice, store, pendingAmount);
  await openWhatsAppWithInvoiceAttachment(phone, message, invoice.invoice_number);
};

/**
 * Build and share a payment receipt message on WhatsApp.
 * Used when a credit payment is recorded for a wholesale invoice.
 */
export const sharePaymentReceiptOnWhatsApp = async (params: {
  store: WholesaleStore;
  invoiceNumber: string;
  billAmount: number;
  paidAmount: number;
  pendingAmount: number;
  paymentMode: string;
}): Promise<void> => {
  const { store, invoiceNumber, billAmount, paidAmount, pendingAmount, paymentMode } = params;
  const phone = normalizeWhatsAppPhone(store.contact_number);

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const lines = [
    `Hello ${store.contact_person || store.store_name},`,
    "",
    `*Payment Receipt — MotorMods*`,
    "",
    `Invoice: ${invoiceNumber}`,
    `Payment Mode: ${paymentMode.toUpperCase()}`,
    `Date: ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
    "",
    `Bill Amount: ₹${fmt(billAmount)}`,
    `Paid Now: ₹${fmt(paidAmount)}`,
    `Pending: ₹${fmt(pendingAmount)}`,
    "",
    pendingAmount <= 0
      ? `All dues cleared. Thank you!`
      : `Remaining balance: ₹${fmt(pendingAmount)}`,
    "",
    "Thank you for your payment!",
    "— MotorMods",
  ];

  const text = encodeURIComponent(lines.join("\n"));
  const desktopDeepLink = `whatsapp://send?phone=${phone}&text=${text}`;
  const webFallbackUrl = `https://wa.me/${phone}?text=${text}`;

  if (isTauriRuntime()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      try {
        await openUrl(desktopDeepLink);
        return;
      } catch {
        await openUrl(webFallbackUrl);
        return;
      }
    } catch {
      // Fall through.
    }
  }

  if (typeof window !== "undefined") {
    window.open(webFallbackUrl, "_blank");
  }
};
