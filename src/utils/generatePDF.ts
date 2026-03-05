import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { settingsService } from "../db/settingsService";
import { InvoiceRecord } from "../types";
import { getInvoiceFilename } from "./getInvoicePath";

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const asAmount = (amount: number): string => formatCurrency(amount);

const formatInvoiceDate = (isoDate: string): string => {
  return new Date(isoDate).toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const loadLogoAsDataUrl = async (): Promise<string | null> => {
  try {
    const response = await fetch("/logo.png", { cache: "no-cache" });
    if (!response.ok) return null;

    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read logo"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const getStoreName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return "Motor Mods";
  return trimmed;
};

const drawInvoiceDetailRow = (
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  value: string,
  valueColor: [number, number, number] = [15, 23, 42]
) => {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(label, x, y);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(valueColor[0], valueColor[1], valueColor[2]);
  doc.text(value, x + 26, y);
};

const drawFooter = (
  doc: jsPDF,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  footerText: string,
  pageNo: number,
  totalPages: number
) => {
  const footerY = pageHeight - 10;

  doc.setDrawColor(226, 232, 240);
  doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(footerText, margin, footerY);
  doc.text(`Page ${pageNo} of ${totalPages}`, pageWidth - margin, footerY, { align: "right" });
};

export const generateInvoicePdfBytes = async (invoice: InvoiceRecord): Promise<{ bytes: Uint8Array; filename: string }> => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const settings = await settingsService.getAll();
  const logoDataUrl = await loadLogoAsDataUrl();

  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const storeName = getStoreName(settings.store_name || "Motor Mods");
  const invoiceDate = formatInvoiceDate(invoice.date);
  const statusText = invoice.status === "pending" ? "PENDING" : "PAID";
  const isWholesale = invoice.sale_type === "wholesale";
  const customerName = invoice.customer_name?.trim() || "Walking Customer";
  const customerPhone = invoice.customer_phone?.trim() || "-";
  const billToName = isWholesale
    ? (invoice.store_name?.trim() || customerName || "Wholesale Store")
    : customerName;
  const billToContactPerson = invoice.store_contact_person?.trim() || "";
  const billToPhone = isWholesale
    ? (invoice.store_contact_number?.trim() || customerPhone || "-")
    : customerPhone;
  const billToAddress = isWholesale ? (invoice.store_address?.trim() || "") : "";

  const storeAddress = settings.store_address?.trim() || "";
  const storeContact = [settings.store_phone, settings.store_email].filter(Boolean).join("  |  ");

  const productItems = invoice.items.filter(i => !i.item_type || i.item_type === 'product');
  const materialLineItems = invoice.items.filter(i => i.item_type === 'material');
  const serviceLineItems = invoice.items.filter(i => i.item_type === 'service');

  const subtotal = invoice.subtotal > 0
    ? invoice.subtotal
    : productItems.reduce((sum, item) => sum + item.total, 0);
  const discount = invoice.discount_amount !== undefined
    ? invoice.discount_amount
    : Math.max(0, subtotal - invoice.grand_total);
  const materialsSubtotal = materialLineItems.reduce((sum, i) => sum + i.total, 0);
  const serviceSubtotal = serviceLineItems.reduce((sum, i) => sum + i.total, 0);
  const isCreditSale = invoice.payment_mode === "credit" || invoice.status === "pending";
  const derivedPaid = Math.max(0, Math.min(invoice.grand_total, invoice.paid_amount ?? (isCreditSale ? 0 : invoice.grand_total)));
  const paidAmount = isCreditSale
    ? invoice.status === "pending"
      ? derivedPaid
      : invoice.grand_total
    : invoice.grand_total;
  const outstandingAmount = Math.max(0, invoice.outstanding_amount ?? (invoice.grand_total - paidAmount));

  const invoiceInfoWidth = 72;
  const invoiceInfoX = pageWidth - margin - invoiceInfoWidth;
  const logoSize = logoDataUrl ? 30 : 0;
  const leftStartX = logoDataUrl ? margin + logoSize + 6 : margin;
  const leftMaxWidth = invoiceInfoX - leftStartX - 6;

  let y = 16;

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", margin, y - 2, logoSize, logoSize);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(storeName, leftStartX, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  let leftY = y + 12;
  if (storeAddress) {
    const addressLines = doc.splitTextToSize(storeAddress, leftMaxWidth);
    for (const line of addressLines) {
      doc.text(line, leftStartX, leftY);
      leftY += 4.2;
    }
  }
  if (storeContact) {
    doc.text(storeContact, leftStartX, leftY);
    leftY += 4.2;
  }

  const infoBoxY = y - 1;
  const infoBoxHeight = 33;
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(invoiceInfoX, infoBoxY, invoiceInfoWidth, infoBoxHeight, 2, 2, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text("INVOICE", invoiceInfoX + 4, infoBoxY + 7);

  drawInvoiceDetailRow(doc, invoiceInfoX + 4, infoBoxY + 13, "No", invoice.invoice_number);
  drawInvoiceDetailRow(doc, invoiceInfoX + 4, infoBoxY + 19, "Date", invoiceDate);

  const statusColor: [number, number, number] = invoice.status === "pending"
    ? [202, 138, 4]
    : [22, 163, 74];
  drawInvoiceDetailRow(doc, invoiceInfoX + 4, infoBoxY + 25, "Status", statusText, statusColor);

  const headerBottom = Math.max(
    infoBoxY + infoBoxHeight,
    leftY,
    logoDataUrl ? y - 2 + logoSize : y
  );

  y = headerBottom + 8;

  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text("BILL TO", margin, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(billToName, margin, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);

  let billToEndY = y + 12;
  if (isWholesale) {
    const detailLines: string[] = [];
    if (billToContactPerson) detailLines.push(`Contact: ${billToContactPerson}`);
    detailLines.push(`Phone: ${billToPhone}`);
    if (billToAddress) {
      const wrappedAddress = doc.splitTextToSize(`Address: ${billToAddress}`, pageWidth - (margin * 2) - 10);
      detailLines.push(...wrappedAddress);
    }

    let detailY = y + 12;
    for (const line of detailLines) {
      doc.text(line, margin, detailY);
      detailY += 4.2;
    }

    doc.text(`Payment: ${(invoice.payment_mode || "cash").toUpperCase()}`, pageWidth - margin, y + 7, { align: "right" });
    billToEndY = Math.max(billToEndY, detailY + 1);
  } else {
    doc.text(`Phone: ${billToPhone}`, pageWidth - margin, y + 7, { align: "right" });
  }

  y = billToEndY;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  const tableRows = productItems.map((item, index) => [
    String(index + 1),
    item.name || "-",
    String(item.qty),
    asAmount(item.rate),
    asAmount(item.total),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Description", "Qty", "Rate", "Amount"]],
    body: tableRows,
    theme: "grid",
    margin: { left: margin, right: margin },
    tableLineColor: [226, 232, 240],
    tableLineWidth: 0.2,
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 3,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 96 },
      2: { cellWidth: 16, halign: "center" },
      3: { cellWidth: 30, halign: "right" },
      4: { cellWidth: 30, halign: "right" },
    },
  });

  const lastAutoTable = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  let blockY = (lastAutoTable?.finalY || y) + 9;

  const totalsBoxWidth = 76;
  const hasMaterials = materialsSubtotal > 0;
  const hasService = serviceSubtotal > 0;
  const totalsBoxHeight = (isWholesale ? 42 : 30) + (hasMaterials ? 6 : 0) + (hasService ? 6 : 0);
  const totalsX = pageWidth - margin - totalsBoxWidth;

  if (blockY + totalsBoxHeight > pageHeight - 24) {
    doc.addPage();
    blockY = margin + 6;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text("Thank you for your business.", margin, blockY + 2);
  doc.text(
    isWholesale
      ? "Please verify this wholesale bill and settle dues as per terms."
      : "Please keep this invoice for warranty and service references.",
    margin,
    blockY + 7
  );
  doc.text("All amounts are in INR.", margin, blockY + 12);

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(totalsX, blockY, totalsBoxWidth, totalsBoxHeight, 2, 2, "FD");

  let rowY = blockY + 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text("Subtotal", totalsX + 4, rowY);
  doc.text(asAmount(subtotal), totalsX + totalsBoxWidth - 4, rowY, { align: "right" });

  rowY += 6;
  doc.text("Discount", totalsX + 4, rowY);
  doc.text(`- ${asAmount(discount)}`, totalsX + totalsBoxWidth - 4, rowY, { align: "right" });

  if (hasMaterials) {
    rowY += 6;
    doc.text("Materials", totalsX + 4, rowY);
    doc.text(asAmount(materialsSubtotal), totalsX + totalsBoxWidth - 4, rowY, { align: "right" });
  }

  if (hasService) {
    rowY += 6;
    doc.text("Service Charge", totalsX + 4, rowY);
    doc.text(asAmount(serviceSubtotal), totalsX + totalsBoxWidth - 4, rowY, { align: "right" });
  }

  rowY += 6;
  if (isWholesale) {
    doc.text("Paid", totalsX + 4, rowY);
    doc.text(asAmount(paidAmount), totalsX + totalsBoxWidth - 4, rowY, { align: "right" });

    rowY += 6;
    const dueColor: [number, number, number] = outstandingAmount > 0 ? [185, 28, 28] : [22, 163, 74];
    doc.setTextColor(71, 85, 105);
    doc.text("Outstanding Due", totalsX + 4, rowY);
    doc.setTextColor(dueColor[0], dueColor[1], dueColor[2]);
    doc.text(asAmount(outstandingAmount), totalsX + totalsBoxWidth - 4, rowY, { align: "right" });

    rowY += 6;
  }

  doc.setDrawColor(226, 232, 240);
  doc.line(totalsX + 4, rowY - 3, totalsX + totalsBoxWidth - 4, rowY - 3);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Grand Total (INR)", totalsX + 4, rowY + 1.5);
  doc.text(asAmount(invoice.grand_total), totalsX + totalsBoxWidth - 4, rowY + 1.5, { align: "right" });

  const footerText = storeAddress || storeContact || storeName;
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(doc, pageWidth, pageHeight, margin, footerText, page, totalPages);
  }

  const arrayBuffer = doc.output("arraybuffer");
  const bytes = new Uint8Array(arrayBuffer);
  const filename = getInvoiceFilename(invoice.invoice_number);
  return { bytes, filename };
};
