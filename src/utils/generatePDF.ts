import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { InvoiceRecord } from "../types";
import { getInvoiceFilename } from "./getInvoicePath";

export const generateInvoicePdfBytes = async (invoice: InvoiceRecord): Promise<{ bytes: Uint8Array; filename: string }> => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const margin = 14;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("INVOICE", margin, y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  y += 8;

  doc.text(`Invoice #: ${invoice.invoice_number}`, margin, y);
  doc.text(`Date: ${new Date(invoice.date).toLocaleString("en-IN")}`, margin + 90, y);
  y += 6;

  doc.text(`Customer: ${invoice.customer_name || "Walking Customer"}`, margin, y);
  if (invoice.customer_phone) {
    doc.text(`Phone: ${invoice.customer_phone}`, margin + 90, y);
  }
  y += 6;

  const tableBody = invoice.items.map((item, idx) => [
    String(idx + 1),
    item.name,
    String(item.qty),
    `₹${item.rate.toLocaleString("en-IN")}`,
    `₹${item.total.toLocaleString("en-IN")}`,
  ]);

  autoTable(doc, {
    startY: y + 4,
    head: [["#", "Item", "Qty", "Rate", "Total"]],
    body: tableBody,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [20, 184, 166], textColor: [255, 255, 255], halign: "center" },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      2: { cellWidth: 15, halign: "center" },
      3: { cellWidth: 25, halign: "right" },
      4: { cellWidth: 25, halign: "right" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable.finalY || y + 20;
  const totalY = finalY + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Grand Total", margin + 120, totalY);
  doc.text(`₹${invoice.grand_total.toLocaleString("en-IN")}`, margin + 160, totalY, { align: "right" });

  const arrayBuffer = doc.output("arraybuffer");
  const bytes = new Uint8Array(arrayBuffer);
  const filename = getInvoiceFilename(invoice.invoice_number);
  return { bytes, filename };
};
