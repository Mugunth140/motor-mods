import { appConfigDir, appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir } from "@tauri-apps/plugin-fs";

export const getInvoiceFilename = (invoiceNumber: string) => `invoice_${invoiceNumber}.pdf`;

export const getInvoicesDir = async (): Promise<string> => {
  const root = await appConfigDir();
  const invoicesDir = await join(root, "invoices");
  const dirExists = await exists(invoicesDir);
  if (!dirExists) {
    await mkdir(invoicesDir, { recursive: true });
  }
  return invoicesDir;
};

export const getInvoicePdfPath = async (invoiceNumber: string): Promise<string> => {
  const invoicesDir = await getInvoicesDir();
  const filename = getInvoiceFilename(invoiceNumber);
  return await join(invoicesDir, filename);
};

export const resolveExistingInvoicePdfPath = async (invoiceNumber: string): Promise<string | null> => {
  const filename = getInvoiceFilename(invoiceNumber);

  const primaryPath = await getInvoicePdfPath(invoiceNumber);
  if (await exists(primaryPath)) {
    return primaryPath;
  }

  // Backward compatibility for invoices saved in AppData in older builds.
  const legacyRoot = await appDataDir();
  const legacyPath = await join(legacyRoot, "invoices", filename);
  if (await exists(legacyPath)) {
    return legacyPath;
  }

  return null;
};
