import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../db/runtime";

/**
 * Print result with success status and optional error message
 */
export interface PrintResult {
    success: boolean;
    error?: string;
    savedPath?: string;
}

/**
 * Check if the current platform is Windows
 */
export function isWindowsPlatform(): boolean {
    return navigator.platform.toLowerCase().includes('win');
}

/**
 * Print a PDF silently using SumatraPDF (Windows only).
 * @param pdfPath Absolute path to the PDF file
 * @param printerName Optional printer name (uses default if not specified)
 */
export async function printPdfSilent(pdfPath: string, printerName?: string): Promise<void> {
    if (!isTauriRuntime()) {
        console.warn("Silent printing is only available in the desktop app.");
        throw new Error("Silent printing requires the desktop application.");
    }

    await invoke("print_pdf_silent", {
        pdfPath,
        printerName: printerName ?? null,
    });
}

/**
 * Try to print a PDF silently. Returns success status instead of throwing.
 * Use this when you want the operation to continue even if printing fails.
 * @param pdfPath Absolute path to the PDF file
 * @param printerName Optional printer name (uses default if not specified)
 */
export async function tryPrintPdfSilent(pdfPath: string, printerName?: string): Promise<PrintResult> {
    if (!isTauriRuntime()) {
        return { success: false, error: "Silent printing requires the desktop application." };
    }

    try {
        await invoke("print_pdf_silent", {
            pdfPath,
            printerName: printerName ?? null,
        });
        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn("Silent printing failed:", errorMessage);
        return { success: false, error: errorMessage };
    }
}

/**
 * Save PDF using a file dialog (for non-Windows platforms)
 * @param pdfData The PDF as Uint8Array
 * @param defaultFilename Default filename suggestion
 */
export async function savePdfWithDialog(pdfData: Uint8Array, defaultFilename: string): Promise<PrintResult> {
    if (!isTauriRuntime()) {
        return { success: false, error: "Save dialog requires the desktop application." };
    }

    try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeFile } = await import("@tauri-apps/plugin-fs");

        const filePath = await save({
            defaultPath: defaultFilename,
            filters: [{ name: "PDF Files", extensions: ["pdf"] }],
            title: "Save Invoice PDF"
        });

        if (filePath) {
            await writeFile(filePath, pdfData);
            return { success: true, savedPath: filePath };
        } else {
            return { success: false, error: "Save cancelled by user" };
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Save PDF error:", errorMessage);
        return { success: false, error: errorMessage };
    }
}

/**
 * Check if printing is available (SumatraPDF is set up)
 */
export async function isPrintingAvailable(): Promise<boolean> {
    if (!isTauriRuntime()) {
        return false;
    }

    try {
        // We could add a specific check command, but for now just return true if in Tauri
        return true;
    } catch {
        return false;
    }
}
