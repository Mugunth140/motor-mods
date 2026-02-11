import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Invoice, InvoiceItem } from "../types";

export interface InvoiceData {
    invoice: Invoice;
    items: InvoiceItem[];
}

const COMPANY_DETAILS = {
    name: "Motor Mods",
    addressLines: [
        "Address Line 1",
        "Address Line 2",
        "City, State ZIP",
        "Country",
    ],
    phone: "+00 0000 000000",
    email: "info@motormods.com",
};

const BILL_TO_PLACEHOLDER = {
    name: "Customer Name",
    addressLines: [
        "Customer Address Line 1",
        "Customer Address Line 2",
        "City, State ZIP",
        "Country",
    ],
};

async function loadImageAsDataUrl(url: string): Promise<string | null> {
    try {
        const response = await fetch(url, { cache: "no-cache" });
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("Failed to read image"));
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

/**
 * Generate an A4 branded invoice PDF with logo and modern layout
 */
async function generateThermalInvoicePdf(data: InvoiceData): Promise<jsPDF> {
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let yPos = 16;

    const logoDataUrl = await loadImageAsDataUrl("/logo.png");

    // ============================================
    // HEADER
    // ============================================
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    doc.text("INVOICE", margin, yPos);

    if (logoDataUrl) {
        const logoWidth = 40;
        const logoHeight = 22;
        doc.addImage(
            logoDataUrl,
            "PNG",
            pageWidth - margin - logoWidth,
            yPos - 6,
            logoWidth,
            logoHeight
        );
    }

    yPos += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const companyLines = [
        COMPANY_DETAILS.name,
        ...COMPANY_DETAILS.addressLines,
        `Phone: ${COMPANY_DETAILS.phone}`,
        `Email: ${COMPANY_DETAILS.email}`,
    ];
    companyLines.forEach((line) => {
        doc.text(line, margin, yPos);
        yPos += 3.8;
    });

    yPos += 2;

    // ============================================
    // BILL TO + INVOICE DETAILS
    // ============================================
    const leftColX = margin;
    const rightColX = pageWidth - margin - 70;
    const detailLabelX = rightColX;
    const detailValueX = pageWidth - margin;

    const invoiceDate = new Date(data.invoice.created_at);
    const formattedDate = invoiceDate.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
    const dueDate = new Date(invoiceDate.getTime());
    dueDate.setDate(dueDate.getDate() + 7);
    const formattedDueDate = dueDate.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text("BILL TO", leftColX, yPos);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const customerName = data.invoice.customer_name || BILL_TO_PLACEHOLDER.name;
    const customerAddressLines = BILL_TO_PLACEHOLDER.addressLines;

    yPos += 5;
    doc.text(customerName, leftColX, yPos);
    customerAddressLines.forEach((line) => {
        yPos += 4;
        doc.text(line, leftColX, yPos);
    });

    const detailsStartY = yPos - 16;
    doc.setFont("helvetica", "bold");
    doc.text("Invoice No:", detailLabelX, detailsStartY);
    doc.text("Issue Date:", detailLabelX, detailsStartY + 5);
    doc.text("Due Date:", detailLabelX, detailsStartY + 10);

    doc.setFont("helvetica", "normal");
    doc.text(`#${data.invoice.id.slice(-8).toUpperCase()}`, detailValueX, detailsStartY, { align: "right" });
    doc.text(formattedDate, detailValueX, detailsStartY + 5, { align: "right" });
    doc.text(formattedDueDate, detailValueX, detailsStartY + 10, { align: "right" });

    yPos += 10;

    // ============================================
    // ITEMS TABLE
    // ============================================
    const tableData = data.items.map((item) => [
        item.product_name || `Product #${item.product_id.slice(-6)}`,
        item.quantity.toString(),
        item.price.toFixed(2),
        (item.quantity * item.price).toFixed(2),
    ]);

    autoTable(doc, {
        startY: yPos,
        head: [["Description", "Quantity", "Unit Price", "Amount"]],
        body: tableData,
        margin: { left: margin, right: margin },
        styles: {
            fontSize: 9,
            cellPadding: 3,
            textColor: [20, 20, 20],
            lineColor: [220, 220, 220],
            lineWidth: 0.2,
        },
        headStyles: {
            fillColor: [245, 245, 245],
            textColor: [20, 20, 20],
            fontStyle: "bold",
            halign: "left",
        },
        columnStyles: {
            0: { cellWidth: "auto" },
            1: { cellWidth: 25, halign: "center" },
            2: { cellWidth: 30, halign: "right" },
            3: { cellWidth: 30, halign: "right" },
        },
        theme: "grid",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yPos = (doc as any).lastAutoTable.finalY + 6;

    // ============================================
    // TOTALS SECTION
    // ============================================
    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const discount = data.invoice.discount_amount || 0;
    const taxRate = 0;
    const taxAmount = subtotal * taxRate;
    const total = data.invoice.total_amount || subtotal + taxAmount - discount;

    const totalsBoxWidth = 70;
    const totalsX = pageWidth - margin - totalsBoxWidth;
    const valueX = pageWidth - margin;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Subtotal:", totalsX, yPos);
    doc.text(subtotal.toFixed(2), valueX, yPos, { align: "right" });
    yPos += 5;

    doc.text(`VAT ${(taxRate * 100).toFixed(0)}%:`, totalsX, yPos);
    doc.text(taxAmount.toFixed(2), valueX, yPos, { align: "right" });
    yPos += 5;

    if (discount > 0) {
        doc.text("Discount:", totalsX, yPos);
        doc.text(`- ${discount.toFixed(2)}`, valueX, yPos, { align: "right" });
        yPos += 5;
    }

    doc.setFont("helvetica", "bold");
    doc.text("TOTAL:", totalsX, yPos);
    doc.text(total.toFixed(2), valueX, yPos, { align: "right" });
    yPos += 6;

    doc.setFillColor(245, 223, 80);
    doc.rect(totalsX - 2, yPos - 3.5, totalsBoxWidth + 2, 7, "F");
    doc.setTextColor(0, 0, 0);
    doc.text("TOTAL DUE:", totalsX, yPos + 1.5);
    doc.text(total.toFixed(2), valueX, yPos + 1.5, { align: "right" });

    yPos += 16;

    // ============================================
    // FOOTER
    // ============================================
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const footerText = `${COMPANY_DETAILS.name}, ${COMPANY_DETAILS.addressLines.join(", ")} | Email: ${COMPANY_DETAILS.email}`;
    doc.text(footerText, pageWidth / 2, pageHeight - 12, { align: "center" });

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
