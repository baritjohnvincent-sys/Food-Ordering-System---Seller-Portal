/**
 * Food POS Offline Sync Queue Service
 * 
 * Manages database operations (Inventory and Orders) while offline.
 * Stores operations in IndexedDB (with a seamless LocalStorage fallback).
 * Provides a FIFO queue for the Background Synchronization Manager.
 */

export interface QueuedOperation {
  id: string;
  type: 'CREATE_PRODUCT' | 'UPDATE_PRODUCT' | 'DELETE_PRODUCT' | 'CREATE_ORDER' | 'UPDATE_ORDER';
  payload: any;
  timestamp: string;
}

const DB_NAME = 'FoodOfflineDB';
const STORE_NAME = 'operationQueue';
const LOCAL_STORAGE_KEY = 'food_offline_queue_fallback';

let dbInstance: IDBDatabase | null = null;

/**
 * Initializes IndexedDB.
 */
function initIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    try {
      const request = window.indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event: any) => {
        dbInstance = event.target.result;
        resolve(dbInstance!);
      };

      request.onerror = (event: any) => {
        console.warn('IndexedDB failed to open, falling back to LocalStorage:', event.target.error);
        reject(event.target.error);
      };
    } catch (e) {
      console.warn('IndexedDB blocked or restricted, falling back to LocalStorage:', e);
      reject(e);
    }
  });
}

/**
 * Gets the queue from LocalStorage fallback.
 */
function getLocalStorageQueue(): QueuedOperation[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('LocalStorage queue read error:', e);
    return [];
  }
}

/**
 * Saves the queue to LocalStorage fallback.
 */
function saveLocalStorageQueue(queue: QueuedOperation[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('LocalStorage queue write error:', e);
  }
}

/**
 * Core Service Layer API
 */
export const SyncQueueService = {
  /**
   * Adds an operation to the queue.
   */
  async enqueue(
    type: QueuedOperation['type'],
    payload: any
  ): Promise<QueuedOperation> {
    const operation: QueuedOperation = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    try {
      const db = dbInstance || (await initIndexedDB());
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(operation);

        request.onsuccess = () => {
          console.log(`[SyncQueue] Operation enqueued in IndexedDB: ${type}`, operation.id);
          resolve(operation);
        };

        request.onerror = (event: any) => {
          reject(event.target.error);
        };
      });
    } catch (error) {
      // Fallback to LocalStorage
      const queue = getLocalStorageQueue();
      queue.push(operation);
      saveLocalStorageQueue(queue);
      console.log(`[SyncQueue] Operation enqueued in LocalStorage (Fallback): ${type}`, operation.id);
      return operation;
    }
  },

  /**
   * Retrieves all queued operations, sorted by timestamp (FIFO order).
   */
  async getQueue(): Promise<QueuedOperation[]> {
    try {
      const db = dbInstance || (await initIndexedDB());
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          const results = request.result as QueuedOperation[];
          // Sort strictly by timestamp to preserve sequential order
          results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          resolve(results);
        };

        request.onerror = (event: any) => {
          reject(event.target.error);
        };
      });
    } catch (error) {
      // Fallback to LocalStorage
      const queue = getLocalStorageQueue();
      queue.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return queue;
    }
  },

  /**
   * Dequeues (removes) a completed operation.
   */
  async dequeue(id: string): Promise<void> {
    try {
      const db = dbInstance || (await initIndexedDB());
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => {
          console.log(`[SyncQueue] Operation dequeued from IndexedDB:`, id);
          resolve();
        };

        request.onerror = (event: any) => {
          reject(event.target.error);
        };
      });
    } catch (error) {
      // Fallback to LocalStorage
      let queue = getLocalStorageQueue();
      queue = queue.filter((op) => op.id !== id);
      saveLocalStorageQueue(queue);
      console.log(`[SyncQueue] Operation dequeued from LocalStorage (Fallback):`, id);
    }
  },

  /**
   * Clears the entire queue.
   */
  async clear(): Promise<void> {
    try {
      const db = dbInstance || (await initIndexedDB());
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = (event: any) => {
          reject(event.target.error);
        };
      });
    } catch (error) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }
};
