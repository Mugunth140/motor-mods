import { InvoiceRecord } from "../types";
import { getInvoiceFilename } from "./getInvoicePath";
import { resolveExistingInvoicePdfPath } from "./getInvoicePath";
import { isTauriRuntime } from "../db/runtime";
import { invoke } from "@tauri-apps/api/core";

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

export const shareInvoiceOnWhatsApp = async (invoice: InvoiceRecord): Promise<void> => {
  const phone = normalizeWhatsAppPhone(invoice.customer_phone);
  const pdfName = getInvoiceFilename(invoice.invoice_number);
  const message = buildProfessionalMessage(invoice);
  const text = encodeURIComponent(`${message}\n\nAttachment: ${pdfName}`);

  const desktopDeepLink = `whatsapp://send?phone=${phone}&text=${text}`;
  const webFallbackUrl = `https://wa.me/${phone}?text=${text}`;

  if (isTauriRuntime()) {
    try {
      const { openUrl, revealItemInDir } = await import("@tauri-apps/plugin-opener");
      let pdfPath: string | null = null;

      try {
        pdfPath = await resolveExistingInvoicePdfPath(invoice.invoice_number);
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
