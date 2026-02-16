import { WholesaleStore } from "../types";
import { deleteWholesaleStoreFromFirestore, syncWholesaleStoreToFirestore } from "./firestoreSync";
import { getDb } from "./index";
import { isTauriRuntime } from "./runtime";

const STORAGE_KEY = "motormods_wholesale_stores_v1";

const loadStores = (): WholesaleStore[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WholesaleStore[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveStores = (stores: WholesaleStore[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stores));
};

export const wholesaleStoreService = {
  async getAll(): Promise<WholesaleStore[]> {
    if (!isTauriRuntime()) {
      return loadStores()
        .filter((s) => s.is_active)
        .sort((a, b) => a.store_name.localeCompare(b.store_name));
    }
    const db = await getDb();
    return await db.select<WholesaleStore[]>(
      "SELECT * FROM wholesale_stores WHERE is_active = 1 ORDER BY store_name ASC"
    );
  },

  async getAllIncludingInactive(): Promise<WholesaleStore[]> {
    if (!isTauriRuntime()) {
      return loadStores().sort((a, b) => a.store_name.localeCompare(b.store_name));
    }
    const db = await getDb();
    return await db.select<WholesaleStore[]>(
      "SELECT * FROM wholesale_stores ORDER BY store_name ASC"
    );
  },

  async getById(id: string): Promise<WholesaleStore | null> {
    if (!isTauriRuntime()) {
      return loadStores().find((s) => s.id === id) ?? null;
    }
    const db = await getDb();
    const rows = await db.select<WholesaleStore[]>(
      "SELECT * FROM wholesale_stores WHERE id = $1 LIMIT 1",
      [id]
    );
    return rows[0] ?? null;
  },

  async add(store: WholesaleStore): Promise<void> {
    if (!isTauriRuntime()) {
      const stores = loadStores();
      stores.push(store);
      saveStores(stores);
      syncWholesaleStoreToFirestore(store).catch(console.error);
      return;
    }
    const db = await getDb();
    await db.execute(
      `INSERT INTO wholesale_stores (id, store_name, contact_person, contact_number, store_address, credit_limit, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        store.id,
        store.store_name,
        store.contact_person,
        store.contact_number,
        store.store_address,
        store.credit_limit,
        store.is_active ? 1 : 0,
        store.created_at,
        store.updated_at,
      ]
    );
    syncWholesaleStoreToFirestore(store).catch(console.error);
  },

  async update(store: WholesaleStore): Promise<void> {
    const now = new Date().toISOString();
    const updated = { ...store, updated_at: now };

    if (!isTauriRuntime()) {
      const stores = loadStores();
      const idx = stores.findIndex((s) => s.id === store.id);
      if (idx < 0) return;
      stores[idx] = updated;
      saveStores(stores);
      syncWholesaleStoreToFirestore(updated).catch(console.error);
      return;
    }
    const db = await getDb();
    await db.execute(
      `UPDATE wholesale_stores
       SET store_name = $1, contact_person = $2, contact_number = $3,
           store_address = $4, credit_limit = $5, is_active = $6, updated_at = $7
       WHERE id = $8`,
      [
        updated.store_name,
        updated.contact_person,
        updated.contact_number,
        updated.store_address,
        updated.credit_limit,
        updated.is_active ? 1 : 0,
        updated.updated_at,
        updated.id,
      ]
    );
    syncWholesaleStoreToFirestore(updated).catch(console.error);
  },

  async deactivate(id: string): Promise<void> {
    if (!isTauriRuntime()) {
      const stores = loadStores();
      const idx = stores.findIndex((s) => s.id === id);
      if (idx < 0) return;
      stores[idx] = { ...stores[idx], is_active: false, updated_at: new Date().toISOString() };
      saveStores(stores);
      return;
    }
    const db = await getDb();
    await db.execute(
      "UPDATE wholesale_stores SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    );
  },

  async delete(id: string): Promise<void> {
    if (!isTauriRuntime()) {
      const stores = loadStores().filter((s) => s.id !== id);
      saveStores(stores);
      deleteWholesaleStoreFromFirestore(id).catch(console.error);
      return;
    }
    const db = await getDb();
    await db.execute("DELETE FROM wholesale_stores WHERE id = $1", [id]);
    deleteWholesaleStoreFromFirestore(id).catch(console.error);
  },
};
