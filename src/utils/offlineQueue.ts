import { RestaurantOrder } from '../types';

const DB_NAME = 'pollos_karen_offline_db';
const DB_VERSION = 3;
const STORE_ORDERS = 'offline_orders';
const STORE_MUTATIONS = 'offline_mutations';

export type OfflineMutationStatus = 'pending' | 'syncing' | 'failed' | 'conflict';

export interface OfflineMutation {
  id: string; // Idempotency key
  collection: string;
  docId: string;
  type: 'set' | 'update' | 'payment_transaction';
  payload: any;
  userId?: string;
  deviceId?: string;
  attempts?: number;
  lastError?: string;
  status?: OfflineMutationStatus;
  requiresReconciliation?: boolean;
  createdAt: string;
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const key = 'pk_device_id';
    let id = window.localStorage.getItem(key);
    if (!id) {
      id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      window.localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return 'dev_volatile';
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB no soportado en este navegador.'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_ORDERS)) {
        db.createObjectStore(STORE_ORDERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_MUTATIONS)) {
        db.createObjectStore(STORE_MUTATIONS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Error abriendo IndexedDB.'));
  });
}

export async function saveOfflineOrder(order: RestaurantOrder, userId?: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORDERS, 'readwrite');
    const store = tx.objectStore(STORE_ORDERS);
    const req = store.put({
      ...order,
      _offlineSyncPending: true,
      _offlineUserId: userId || 'unknown',
      _offlineDeviceId: getOrCreateDeviceId(),
      _offlineSavedAt: new Date().toISOString(),
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('No se pudo guardar orden offline.'));
  });
}

export async function getOfflineOrders(): Promise<RestaurantOrder[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ORDERS, 'readonly');
      const store = tx.objectStore(STORE_ORDERS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[offlineQueue] Error leyendo órdenes pendientes:', err);
    return [];
  }
}

export async function removeOfflineOrder(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORDERS, 'readwrite');
    const store = tx.objectStore(STORE_ORDERS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function saveOfflineMutation(mutation: OfflineMutation): Promise<void> {
  const db = await openDB();
  const enriched: OfflineMutation = {
    ...mutation,
    deviceId: mutation.deviceId || getOrCreateDeviceId(),
    attempts: mutation.attempts ?? 0,
    status: mutation.status || 'pending',
    requiresReconciliation:
      mutation.requiresReconciliation ?? mutation.type === 'payment_transaction',
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MUTATIONS, 'readwrite');
    const store = tx.objectStore(STORE_MUTATIONS);
    const req = store.put(enriched);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('No se pudo encolar mutación offline.'));
  });
}

export async function updateOfflineMutationStatus(
  id: string,
  status: OfflineMutationStatus,
  lastError?: string
): Promise<void> {
  const mutations = await getOfflineMutations();
  const target = mutations.find(m => m.id === id);
  if (!target) return;
  await saveOfflineMutation({
    ...target,
    status,
    attempts: (target.attempts || 0) + (status === 'failed' ? 1 : 0),
    lastError,
  });
}

export async function getOfflineMutations(): Promise<OfflineMutation[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MUTATIONS, 'readonly');
      const store = tx.objectStore(STORE_MUTATIONS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[offlineQueue] Error leyendo mutaciones pendientes:', err);
    return [];
  }
}

export async function removeOfflineMutation(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MUTATIONS, 'readwrite');
    const store = tx.objectStore(STORE_MUTATIONS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflinePendingCount(): Promise<number> {
  const [orders, mutations] = await Promise.all([getOfflineOrders(), getOfflineMutations()]);
  return orders.length + mutations.length;
}
