import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir } from "@tauri-apps/plugin-fs";

export const getInvoiceFilename = (invoiceNumber: string) => `invoice_${invoiceNumber}.pdf`;

export const getInvoicesDir = async (): Promise<string> => {
  const root = await appDataDir();
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
