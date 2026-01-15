import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { settingsService } from "../db/settingsService";
import { Invoice, InvoiceItem } from "../types";

export interface InvoiceData {
    invoice: Invoice;
    items: InvoiceItem[];
}

/**
 * Generate a clean, thermal-printer-friendly invoice PDF
 * Optimized for 80mm thermal printers (black and white only)
 * Clean lines, no gray backgrounds, high contrast
 */
async function generateThermalInvoicePdf(data: InvoiceData): Promise<jsPDF> {
    const settings = await settingsService.getAll();
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 12;
    let yPos = margin;

    // ============================================
    // HEADER - Store Name (centered, bold)
    // ============================================
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(settings.store_name || "MotorMods", pageWidth / 2, yPos + 8, { align: "center" });
    yPos += 12;

    // Store contact info (centered, smaller)
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const contactParts: string[] = [];
    if (settings.store_address) contactParts.push(settings.store_address);
    if (contactParts.length > 0) {
        doc.text(contactParts.join(""), pageWidth / 2, yPos, { align: "center" });
        yPos += 4;
    }

    const phoneParts: string[] = [];
    if (settings.store_phone) phoneParts.push(`Tel: ${settings.store_phone}`);
    if (settings.store_email) phoneParts.push(`Email: ${settings.store_email}`);
    if (phoneParts.length > 0) {
        doc.text(phoneParts.join("  |  "), pageWidth / 2, yPos, { align: "center" });
        yPos += 4;
    }

    // Separator line
    yPos += 2;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    // ============================================
    // INVOICE TITLE & NUMBER
    // ============================================
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("TAX INVOICE", pageWidth / 2, yPos, { align: "center" });
    yPos += 8;

    // Invoice details in a clean 2-column layout
    const invoiceDate = new Date(data.invoice.created_at);
    const formattedDate = invoiceDate.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
    const formattedTime = invoiceDate.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
    });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    // Left column - Invoice info
    const leftCol = margin;
    const rightCol = pageWidth / 2 + 10;

    doc.setFont("helvetica", "bold");
    doc.text("Invoice No:", leftCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(`#${data.invoice.id.slice(-8).toUpperCase()}`, leftCol + 28, yPos);

    doc.setFont("helvetica", "bold");
    doc.text("Date:", rightCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(formattedDate, rightCol + 15, yPos);

    yPos += 5;

    doc.setFont("helvetica", "bold");
    doc.text("Time:", leftCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(formattedTime, leftCol + 28, yPos);

    doc.setFont("helvetica", "bold");
    doc.text("Payment:", rightCol, yPos);
    doc.setFont("helvetica", "normal");
    const paymentMode = (data.invoice.payment_mode || "cash").charAt(0).toUpperCase() +
        (data.invoice.payment_mode || "cash").slice(1);
    doc.text(paymentMode, rightCol + 22, yPos);

    yPos += 8;

    // Separator line
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;

    // ============================================
    // CUSTOMER INFO
    // ============================================
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Customer:", leftCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(data.invoice.customer_name || "Walking Customer", leftCol + 25, yPos);

    if (data.invoice.customer_phone) {
        yPos += 5;
        doc.setFont("helvetica", "bold");
        doc.text("Phone:", leftCol, yPos);
        doc.setFont("helvetica", "normal");
        doc.text(data.invoice.customer_phone, leftCol + 25, yPos);
    }

    yPos += 8;

    // Double line separator before items
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 1;
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;

    // ============================================
    // ITEMS TABLE - Clean, no background colors
    // ============================================
    const tableData = data.items.map((item, index) => [
        (index + 1).toString(),
        item.product_name || `Product #${item.product_id.slice(-6)}`,
        item.quantity.toString(),
        `${item.price.toLocaleString("en-IN")}`,
        `${(item.quantity * item.price).toLocaleString("en-IN")}`,
    ]);

    autoTable(doc, {
        startY: yPos,
        head: [["#", "Item Description", "Qty", "Rate", "Amount"]],
        body: tableData,
        margin: { left: margin, right: margin },
        styles: {
            fontSize: 9,
            cellPadding: 3,
            lineColor: [0, 0, 0],
            lineWidth: 0.2,
            textColor: [0, 0, 0],
        },
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: "bold",
            fontSize: 9,
            halign: "center",
        },
        columnStyles: {
            0: { cellWidth: 10, halign: "center" },
            1: { cellWidth: "auto" },
            2: { cellWidth: 15, halign: "center" },
            3: { cellWidth: 28, halign: "right" },
            4: { cellWidth: 32, halign: "right" },
        },
        bodyStyles: {
            fillColor: [255, 255, 255],
        },
        alternateRowStyles: {
            fillColor: [255, 255, 255],
        },
        theme: "grid",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yPos = (doc as any).lastAutoTable.finalY + 5;

    // ============================================
    // TOTALS SECTION - Right aligned, clean
    // ============================================
    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const discount = data.invoice.discount_amount || 0;
    const total = data.invoice.total_amount;

    const totalsX = pageWidth - margin - 70;
    const valuesX = pageWidth - margin;

    // Separator
    doc.setLineWidth(0.3);
    doc.line(totalsX - 5, yPos, pageWidth - margin, yPos);
    yPos += 5;

    doc.setFontSize(10);

    // Subtotal
    doc.setFont("helvetica", "normal");
    doc.text("Subtotal:", totalsX, yPos);
    doc.text(`Rs. ${subtotal.toLocaleString("en-IN")}`, valuesX, yPos, { align: "right" });
    yPos += 5;

    // Discount (if any)
    if (discount > 0) {
        doc.text("Discount:", totalsX, yPos);
        doc.text(`- Rs. ${discount.toLocaleString("en-IN")}`, valuesX, yPos, { align: "right" });
        yPos += 5;
    }

    // Total line
    doc.setLineWidth(0.5);
    doc.line(totalsX - 5, yPos, pageWidth - margin, yPos);
    yPos += 6;

    // Grand Total (bold, larger)
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL:", totalsX, yPos);
    doc.text(`Rs. ${total.toLocaleString("en-IN")}`, valuesX, yPos, { align: "right" });
    yPos += 3;

    // Double line after total
    doc.setLineWidth(0.5);
    doc.line(totalsX - 5, yPos, pageWidth - margin, yPos);
    yPos += 1;
    doc.line(totalsX - 5, yPos, pageWidth - margin, yPos);

    yPos += 10;

    // ============================================
    // FOOTER
    // ============================================
    
    // Separator
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Thank you for your business!", pageWidth / 2, yPos, { align: "center" });
    yPos += 4;
    doc.setFontSize(8);
    doc.text("Goods once sold will not be taken back or exchanged.", pageWidth / 2, yPos, { align: "center" });

    return doc;
}

/**
 * Generate a professional invoice PDF matching the garage invoice style
 * Features: Logo on right, store info below, bill-to section, invoice details bar, clean item table
 */
export async function generateInvoicePdf(data: InvoiceData): Promise<string> {
    const doc = await generateThermalInvoicePdf(data);
    return doc.output("dataurlstring");
}

/**
 * Save invoice PDF to a file and return the path
 * Used for silent printing on Windows
 */
export async function saveInvoicePdf(data: InvoiceData): Promise<string> {
    const doc = await generateThermalInvoicePdf(data);

    // Save to temp directory (Windows only - for silent printing)
    const filename = `Invoice_${data.invoice.id.slice(-8).toUpperCase()}_${Date.now()}.pdf`;
    const tempDir = await import("@tauri-apps/api/path").then(p => p.tempDir());
    const filePath = `${tempDir}${filename}`;

    const pdfBlob = doc.output("blob");
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { writeFile } = await import("@tauri-apps/plugin-fs");
    await writeFile(filePath, uint8Array);

    return filePath;
}

/**
 * Generate invoice PDF as Uint8Array (for save dialog on non-Windows)
 * Returns both the PDF bytes and a suggested filename
 */
export async function generateInvoicePdfBytes(data: InvoiceData): Promise<{ bytes: Uint8Array; filename: string }> {
    const doc = await generateThermalInvoicePdf(data);

    const filename = `Invoice_${data.invoice.id.slice(-8).toUpperCase()}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const pdfBlob = doc.output("blob");
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    return { bytes, filename };
}
