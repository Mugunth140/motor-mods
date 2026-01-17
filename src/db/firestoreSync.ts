/**
 * Firestore Sync Service for MotorMods
 * 
 * This service handles synchronization of product/stock data
 * from the local SQLite database to Firestore for the PWA to consume.
 */

import {
    deleteDoc,
    doc,
    serverTimestamp,
    setDoc,
    Timestamp,
    writeBatch
} from "firebase/firestore";
import { Product } from "../types";
import { getFirestoreDb, isFirestoreSyncEnabled } from "./firebase";

const PRODUCTS_COLLECTION = "products";

/**
 * Firestore product document structure
 */
interface FirestoreProduct {
    id: string;
    name: string;
    sku: string | null;
    category: string | null;
    price: number;
    quantity: number;
    barcode: string | null;
    purchase_price: number;
    reorder_level: number;
    max_stock: number | null;
    last_sale_date: string | null;
    fsn_classification: string | null;
    updated_at: string;
    synced_at: Timestamp;
}

/**
 * Convert a local Product to Firestore format
 */
const toFirestoreProduct = (product: Product): Omit<FirestoreProduct, 'synced_at'> => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    category: product.category,
    price: product.price,
    quantity: product.quantity,
    barcode: product.barcode,
    purchase_price: product.purchase_price,
    reorder_level: product.reorder_level,
    max_stock: product.max_stock,
    last_sale_date: product.last_sale_date,
    fsn_classification: product.fsn_classification,
    updated_at: product.updated_at,
});

/**
 * Sync a single product to Firestore
 * Called after product create/update operations
 */
export const syncProductToFirestore = async (product: Product): Promise<boolean> => {
    if (!isFirestoreSyncEnabled()) {
        console.debug("Firestore sync disabled - skipping product sync");
        return false;
    }

    const db = getFirestoreDb();
    if (!db) return false;

    try {
        const docRef = doc(db, PRODUCTS_COLLECTION, product.id);
        await setDoc(docRef, {
            ...toFirestoreProduct(product),
            synced_at: serverTimestamp(),
        });
        console.log(`Product synced to Firestore: ${product.name}`);
        return true;
    } catch (error) {
        console.error(`Failed to sync product ${product.id}:`, error);
        return false;
    }
};

/**
 * Delete a product from Firestore
 * Called after local product deletion
 */
export const deleteProductFromFirestore = async (productId: string): Promise<boolean> => {
    if (!isFirestoreSyncEnabled()) {
        console.debug("Firestore sync disabled - skipping product delete");
        return false;
    }

    const db = getFirestoreDb();
    if (!db) return false;

    try {
        const docRef = doc(db, PRODUCTS_COLLECTION, productId);
        await deleteDoc(docRef);
        console.log(`Product deleted from Firestore: ${productId}`);
        return true;
    } catch (error) {
        console.error(`Failed to delete product ${productId} from Firestore:`, error);
        return false;
    }
};

/**
 * Bulk sync all products to Firestore
 * Useful for initial sync or manual full sync
 * Uses batched writes for efficiency (max 500 per batch)
 */
export const syncAllProductsToFirestore = async (products: Product[]): Promise<{
    success: boolean;
    synced: number;
    failed: number;
}> => {
    if (!isFirestoreSyncEnabled()) {
        console.warn("Firestore sync disabled - cannot perform bulk sync");
        return { success: false, synced: 0, failed: products.length };
    }

    const db = getFirestoreDb();
    if (!db) return { success: false, synced: 0, failed: products.length };

    const BATCH_SIZE = 500;
    let synced = 0;
    let failed = 0;

    try {
        // Process in batches of 500 (Firestore limit)
        for (let i = 0; i < products.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const batchProducts = products.slice(i, i + BATCH_SIZE);

            for (const product of batchProducts) {
                const docRef = doc(db, PRODUCTS_COLLECTION, product.id);
                batch.set(docRef, {
                    ...toFirestoreProduct(product),
                    synced_at: serverTimestamp(),
                });
            }

            await batch.commit();
            synced += batchProducts.length;
            console.log(`Batch synced: ${synced}/${products.length} products`);
        }

        console.log(`Full sync completed: ${synced} products synced`);
        return { success: true, synced, failed };
    } catch (error) {
        console.error("Bulk sync failed:", error);
        failed = products.length - synced;
        return { success: false, synced, failed };
    }
};

/**
 * Update only the stock quantity in Firestore
 * More efficient for quantity-only updates
 */
export const syncStockQuantityToFirestore = async (
    productId: string,
    newQuantity: number
): Promise<boolean> => {
    if (!isFirestoreSyncEnabled()) {
        console.debug("Firestore sync disabled - skipping stock sync");
        return false;
    }

    const db = getFirestoreDb();
    if (!db) return false;

    try {
        const docRef = doc(db, PRODUCTS_COLLECTION, productId);
        await setDoc(
            docRef,
            {
                quantity: newQuantity,
                synced_at: serverTimestamp(),
            },
            { merge: true }
        );
        console.log(`Stock synced to Firestore: ${productId} -> ${newQuantity}`);
        return true;
    } catch (error) {
        console.error(`Failed to sync stock for ${productId}:`, error);
        return false;
    }
};
