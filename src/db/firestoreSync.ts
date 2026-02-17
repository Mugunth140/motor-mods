/**
 * Firestore Sync Service for MotorMods
 * 
 * This service handles synchronization of product/stock data
 * from the local SQLite database to Firestore for the PWA to consume.
 * 
 * Production-grade features:
 * - Retry logic with exponential backoff
 * - Offline queue for failed syncs
 * - Batch operations for efficiency
 * - Error tracking and recovery
 */

import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    serverTimestamp,
    setDoc,
    Timestamp,
    writeBatch
} from "firebase/firestore";
import { Product } from "../types";
import { getFirestoreDb, isFirestoreSyncEnabled } from "./firebase";

const PRODUCTS_COLLECTION = "products";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const BATCH_SIZE = 500; // Firestore batch limit

// ============================================
// SYNC QUEUE FOR OFFLINE/FAILED OPERATIONS
// ============================================

interface SyncOperation {
    id: string;
    type: 'upsert' | 'delete' | 'clear';
    data?: Product;
    productId?: string;
    retryCount: number;
    createdAt: number;
}

// In-memory queue for pending sync operations
const syncQueue: SyncOperation[] = [];
let isProcessingQueue = false;

// ============================================
// EVENT DISPATCHERS FOR UI FEEDBACK
// ============================================

const dispatchSyncStart = () => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('firestore-sync-start'));
    }
};

const dispatchSyncEnd = () => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('firestore-sync-end'));
    }
};

const dispatchSyncError = (error: Error) => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('firestore-sync-error', { detail: error }));
    }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Sleep for a specified duration
 */
const sleep = (ms: number): Promise<void> => 
    new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry a function with exponential backoff
 */
async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = MAX_RETRIES,
    delayMs: number = RETRY_DELAY_MS
): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            if (attempt < maxRetries) {
                const backoffDelay = delayMs * Math.pow(2, attempt);
                console.warn(`Sync attempt ${attempt + 1} failed, retrying in ${backoffDelay}ms...`, error);
                await sleep(backoffDelay);
            }
        }
    }
    
    throw lastError;
}

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
 * Note: Firestore does not accept undefined values, so we convert them to null
 */
const toFirestoreProduct = (product: Product): Omit<FirestoreProduct, 'synced_at'> => ({
    id: product.id,
    name: product.name,
    sku: product.sku ?? null,
    category: product.category ?? null,
    price: product.price ?? 0,
    quantity: product.quantity ?? 0,
    barcode: product.barcode ?? null,
    purchase_price: product.purchase_price ?? 0,
    reorder_level: product.reorder_level ?? 5,
    max_stock: product.max_stock ?? null,
    last_sale_date: product.last_sale_date ?? null,
    fsn_classification: product.fsn_classification ?? null,
    updated_at: product.updated_at ?? new Date().toISOString(),
});

// ============================================
// SYNC QUEUE PROCESSOR
// ============================================

/**
 * Add an operation to the sync queue
 */
const queueSyncOperation = (operation: Omit<SyncOperation, 'id' | 'retryCount' | 'createdAt'>) => {
    const queueItem: SyncOperation = {
        ...operation,
        id: `${operation.type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        retryCount: 0,
        createdAt: Date.now(),
    };
    syncQueue.push(queueItem);
    processQueue();
};

/**
 * Process the sync queue
 */
const processQueue = async () => {
    if (isProcessingQueue || syncQueue.length === 0) return;
    if (!isFirestoreSyncEnabled()) return;

    isProcessingQueue = true;
    dispatchSyncStart();

    try {
        while (syncQueue.length > 0) {
            const operation = syncQueue[0];
            
            try {
                switch (operation.type) {
                    case 'upsert':
                        if (operation.data) {
                            await syncProductToFirestoreInternal(operation.data);
                        }
                        break;
                    case 'delete':
                        if (operation.productId) {
                            await deleteProductFromFirestoreInternal(operation.productId);
                        }
                        break;
                    case 'clear':
                        await clearAllProductsFromFirestoreInternal();
                        break;
                }
                
                // Success - remove from queue
                syncQueue.shift();
            } catch (error) {
                operation.retryCount++;
                
                if (operation.retryCount >= MAX_RETRIES) {
                    console.error(`Sync operation failed after ${MAX_RETRIES} retries:`, operation, error);
                    dispatchSyncError(error instanceof Error ? error : new Error(String(error)));
                    syncQueue.shift(); // Remove failed operation
                } else {
                    // Move to end of queue for retry
                    syncQueue.shift();
                    syncQueue.push(operation);
                    await sleep(RETRY_DELAY_MS * Math.pow(2, operation.retryCount));
                }
            }
        }
    } finally {
        isProcessingQueue = false;
        dispatchSyncEnd();
    }
};

// ============================================
// INTERNAL SYNC FUNCTIONS (with retries)
// ============================================

/**
 * Internal function to sync a product to Firestore
 */
const syncProductToFirestoreInternal = async (product: Product): Promise<void> => {
    const db = getFirestoreDb();
    if (!db) throw new Error('Firestore not initialized');

    await withRetry(async () => {
        const docRef = doc(db, PRODUCTS_COLLECTION, product.id);
        await setDoc(docRef, {
            ...toFirestoreProduct(product),
            synced_at: serverTimestamp(),
        });
    });
    
    console.log(`Product synced to Firestore: ${product.name}`);
};

/**
 * Internal function to delete a product from Firestore
 */
const deleteProductFromFirestoreInternal = async (productId: string): Promise<void> => {
    const db = getFirestoreDb();
    if (!db) throw new Error('Firestore not initialized');

    await withRetry(async () => {
        const docRef = doc(db, PRODUCTS_COLLECTION, productId);
        await deleteDoc(docRef);
    });
    
    console.log(`Product deleted from Firestore: ${productId}`);
};

/**
 * Internal function to clear all products from Firestore
 */
const clearAllProductsFromFirestoreInternal = async (): Promise<void> => {
    const db = getFirestoreDb();
    if (!db) throw new Error('Firestore not initialized');

    await withRetry(async () => {
        const productsRef = collection(db, PRODUCTS_COLLECTION);
        const snapshot = await getDocs(productsRef);
        
        if (snapshot.empty) {
            console.log('No products to clear from Firestore');
            return;
        }

        // Delete in batches of 500 (Firestore limit)
        const docs = snapshot.docs;
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const batchDocs = docs.slice(i, i + BATCH_SIZE);
            
            for (const docSnap of batchDocs) {
                batch.delete(docSnap.ref);
            }
            
            await batch.commit();
            console.log(`Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchDocs.length} products`);
        }
    });
    
    console.log('All products cleared from Firestore');
};

// ============================================
// PUBLIC API
// ============================================

/**
 * Sync a single product to Firestore
 * Called after product create/update operations
 * Uses queue for reliability
 */
export const syncProductToFirestore = async (product: Product): Promise<boolean> => {
    if (!isFirestoreSyncEnabled()) {
        console.debug("Firestore sync disabled - skipping product sync");
        return false;
    }

    try {
        // Queue the operation for reliable sync
        queueSyncOperation({ type: 'upsert', data: product });
        return true;
    } catch (error) {
        console.error(`Failed to queue product sync ${product.id}:`, error);
        dispatchSyncError(error instanceof Error ? error : new Error(String(error)));
        return false;
    }
};

/**
 * Delete a product from Firestore
 * Called after local product deletion
 * Uses queue for reliability
 */
export const deleteProductFromFirestore = async (productId: string): Promise<boolean> => {
    if (!isFirestoreSyncEnabled()) {
        console.debug("Firestore sync disabled - skipping product delete");
        return false;
    }

    try {
        // Queue the operation for reliable sync
        queueSyncOperation({ type: 'delete', productId });
        return true;
    } catch (error) {
        console.error(`Failed to queue product delete ${productId}:`, error);
        dispatchSyncError(error instanceof Error ? error : new Error(String(error)));
        return false;
    }
};

/**
 * Clear all products from Firestore
 * Called when the local database is cleared
 * This is a critical operation that ensures PWA stays in sync
 * @throws Error if clear operation fails
 */
export const clearAllProductsFromFirestore = async (): Promise<boolean> => {
    if (!isFirestoreSyncEnabled()) {
        console.debug("Firestore sync disabled - skipping clear all");
        // Return true since there's nothing to clear if sync is disabled
        return true;
    }

    const db = getFirestoreDb();
    if (!db) {
        throw new Error("Firestore not initialized");
    }

    dispatchSyncStart();
    console.log('[Firestore Clear] Starting clear operation...');
    
    try {
        console.log('[Firestore Clear] Getting products collection reference...');
        const productsRef = collection(db, PRODUCTS_COLLECTION);
        
        console.log('[Firestore Clear] Fetching existing documents...');
        const snapshot = await getDocs(productsRef);
        
        if (snapshot.empty) {
            console.log('[Firestore Clear] No products to clear from Firestore');
            return true;
        }
        
        console.log(`[Firestore Clear] Found ${snapshot.docs.length} documents to delete`);

        // Delete in batches of 500 (Firestore limit)
        const docs = snapshot.docs;
        let deletedCount = 0;
        
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const batchDocs = docs.slice(i, i + BATCH_SIZE);
            
            for (const docSnap of batchDocs) {
                batch.delete(docSnap.ref);
            }
            
            await batch.commit();
            deletedCount += batchDocs.length;
            console.log(`Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchDocs.length} products (total: ${deletedCount}/${docs.length})`);
        }
        
        console.log(`All ${deletedCount} products cleared from Firestore successfully`);
        return true;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = (error as { code?: string })?.code || 'unknown';
        console.error("[Firestore Clear] Failed:", {
            message: errorMessage,
            code: errorCode,
            error
        });
        dispatchSyncError(error instanceof Error ? error : new Error(errorMessage));
        throw new Error(`Cloud sync failed (${errorCode}): ${errorMessage}`);
    } finally {
        dispatchSyncEnd();
    }
};

/**
 * Bulk sync all products to Firestore
 * Useful for initial sync or manual full sync
 * Uses batched writes for efficiency (max 500 per batch)
 * Includes retry logic for reliability
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

    let synced = 0;
    let failed = 0;

    dispatchSyncStart();
    try {
        // Process in batches of 500 (Firestore limit)
        for (let i = 0; i < products.length; i += BATCH_SIZE) {
            const batchProducts = products.slice(i, i + BATCH_SIZE);

            await withRetry(async () => {
                const batch = writeBatch(db);

                for (const product of batchProducts) {
                    const docRef = doc(db, PRODUCTS_COLLECTION, product.id);
                    batch.set(docRef, {
                        ...toFirestoreProduct(product),
                        synced_at: serverTimestamp(),
                    });
                }

                await batch.commit();
            });

            synced += batchProducts.length;
            console.log(`Batch synced: ${synced}/${products.length} products`);
        }

        console.log(`Full sync completed: ${synced} products synced`);
        return { success: true, synced, failed };
    } catch (error) {
        console.error("Bulk sync failed:", error);
        failed = products.length - synced;
        dispatchSyncError(error instanceof Error ? error : new Error(String(error)));
        return { success: false, synced, failed };
    } finally {
        dispatchSyncEnd();
    }
};

/**
 * Update only the stock quantity in Firestore
 * More efficient for quantity-only updates
 * Uses retry logic for reliability
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
        await withRetry(async () => {
            const docRef = doc(db, PRODUCTS_COLLECTION, productId);
            await setDoc(
                docRef,
                {
                    quantity: newQuantity,
                    updated_at: new Date().toISOString(),
                    synced_at: serverTimestamp(),
                },
                { merge: true }
            );
        });
        
        console.log(`Stock synced to Firestore: ${productId} -> ${newQuantity}`);
        return true;
    } catch (error) {
        console.error(`Failed to sync stock for ${productId}:`, error);
        dispatchSyncError(error instanceof Error ? error : new Error(String(error)));
        return false;
    }
};

// ============================================
// SYNC STATUS & UTILITIES
// ============================================

/**
 * Get the current sync queue status
 * Useful for debugging and monitoring
 */
export const getSyncQueueStatus = (): {
    pending: number;
    isProcessing: boolean;
} => ({
    pending: syncQueue.length,
    isProcessing: isProcessingQueue,
});

/**
 * Force process any pending sync operations
 * Useful after coming back online
 */
export const flushSyncQueue = (): void => {
    if (syncQueue.length > 0 && !isProcessingQueue) {
        processQueue();
    }
};

/**
 * Check if Firestore sync is healthy
 * Returns true if sync is enabled and no pending operations
 */
export const isSyncHealthy = (): boolean => {
    return isFirestoreSyncEnabled() && syncQueue.length === 0;
};

// ============================================
// WHOLESALE STORE SYNC
// ============================================

import { WholesaleStore } from "../types";

const WHOLESALE_STORES_COLLECTION = "wholesale_stores";

/**
 * Sync a wholesale store to Firestore
 */
export const syncWholesaleStoreToFirestore = async (store: WholesaleStore): Promise<boolean> => {
    if (!isFirestoreSyncEnabled()) return false;

    const db = getFirestoreDb();
    if (!db) return false;

    try {
        await withRetry(async () => {
            const docRef = doc(db, WHOLESALE_STORES_COLLECTION, store.id);
            await setDoc(docRef, {
                id: store.id,
                store_name: store.store_name,
                contact_person: store.contact_person,
                contact_number: store.contact_number ?? null,
                store_address: store.store_address ?? null,
                credit_limit: store.credit_limit ?? 0,
                is_active: store.is_active,
                created_at: store.created_at,
                updated_at: store.updated_at,
                synced_at: serverTimestamp(),
            });
        });
        return true;
    } catch (error) {
        console.error(`Failed to sync wholesale store ${store.id}:`, error);
        return false;
    }
};

/**
 * Delete a wholesale store from Firestore
 */
export const deleteWholesaleStoreFromFirestore = async (storeId: string): Promise<boolean> => {
    if (!isFirestoreSyncEnabled()) return false;

    const db = getFirestoreDb();
    if (!db) return false;

    try {
        await withRetry(async () => {
            const docRef = doc(db, WHOLESALE_STORES_COLLECTION, storeId);
            await deleteDoc(docRef);
        });
        return true;
    } catch (error) {
        console.error(`Failed to delete wholesale store ${storeId} from Firestore:`, error);
        return false;
    }
};
