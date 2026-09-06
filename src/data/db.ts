/**
 * Thin IndexedDB wrapper.
 *
 * The app keeps the whole dataset in memory (a personal training log is a few
 * thousand rows even after years) and writes through to IndexedDB on every
 * mutation. That keeps all derived computation — load, readiness, score —
 * synchronous, which is what makes the UI feel instant offline.
 */

export const DB_NAME = 'hybrid-athlete';
export const DB_VERSION = 1;

export const STORES = {
  settings: 'settings',
  shiftTypes: 'shiftTypes',
  shifts: 'shifts',
  sessions: 'sessions',
  exercises: 'exercises',
  habits: 'habits',
  habitEntries: 'habitEntries',
  tasks: 'tasks',
  goals: 'goals',
  records: 'records',
  checkIns: 'checkIns',
  reviews: 'reviews',
  plans: 'plans',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

const KEY_PATHS: Record<StoreName, string> = {
  settings: 'key',
  shiftTypes: 'id',
  shifts: 'date',
  sessions: 'id',
  exercises: 'id',
  habits: 'id',
  habitEntries: 'id',
  tasks: 'id',
  goals: 'id',
  records: 'id',
  checkIns: 'date',
  reviews: 'weekStart',
  plans: 'id',
};

let dbPromise: Promise<IDBDatabase> | null = null;

export function isPersistenceAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: KEY_PATHS[name] });
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB konnte nicht geöffnet werden'));
    req.onblocked = () => reject(new Error('IndexedDB blockiert — bitte andere Tabs schließen'));
  });
  return dbPromise;
}

function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export function getAll<T>(store: StoreName): Promise<T[]> {
  return run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

export function put<T>(store: StoreName, value: T): Promise<void> {
  return run(store, 'readwrite', (s) => s.put(value)).then(() => undefined);
}

export function bulkPut<T>(store: StoreName, values: T[]): Promise<void> {
  if (values.length === 0) return Promise.resolve();
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        for (const v of values) os.put(v);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export function remove(store: StoreName, key: IDBValidKey): Promise<void> {
  return run(store, 'readwrite', (s) => s.delete(key)).then(() => undefined);
}

export function clearStore(store: StoreName): Promise<void> {
  return run(store, 'readwrite', (s) => s.clear()).then(() => undefined);
}

export function clearAll(): Promise<void> {
  return Promise.all(Object.values(STORES).map(clearStore)).then(() => undefined);
}

/** Settings and other singletons live in the `settings` store as keyed rows. */
export function getSingleton<T>(key: string): Promise<T | undefined> {
  return run<{ key: string; value: T } | undefined>(
    STORES.settings,
    'readonly',
    (s) => s.get(key) as IDBRequest<{ key: string; value: T } | undefined>,
  ).then((row) => row?.value);
}

export function putSingleton<T>(key: string, value: T): Promise<void> {
  return put(STORES.settings, { key, value });
}

/**
 * Ask the browser to keep the data even under storage pressure. Best effort:
 * Safari may decline, which is why export/backup exists as a first-class feature.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return null;
  }
}
