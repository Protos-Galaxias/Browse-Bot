// Lightweight IndexedDB-backed storage with a chrome.storage-like API

type StorageChanges = Record<string, { oldValue?: any; newValue?: any }>;

type OnChangedListener = (changes: StorageChanges, areaName: 'local') => void;

class StorageEventHub {
    private listeners: Set<OnChangedListener> = new Set();
    private channel: BroadcastChannel | null = null;

    constructor() {
        try {
            this.channel = new BroadcastChannel('web-walker-storage');
            this.channel.onmessage = (event: MessageEvent) => {
                const data = event.data;
                if (data && data.type === 'storage-changes') {
                    this.emitLocal(data.changes, 'local');
                }
            };
        } catch {
            this.channel = null;
        }
    }

    addListener(listener: OnChangedListener): void {
        this.listeners.add(listener);
    }

    removeListener(listener: OnChangedListener): void {
        this.listeners.delete(listener);
    }

    hasListener(listener: OnChangedListener): boolean {
        return this.listeners.has(listener);
    }

    emit(changes: StorageChanges): void {
        // Emit locally
        this.emitLocal(changes, 'local');
        // Broadcast to other contexts
        try {
            this.channel?.postMessage({ type: 'storage-changes', changes });
        } catch {}
    }

    private emitLocal(changes: StorageChanges, areaName: 'local'): void {
        for (const l of this.listeners) {
            try { l(changes, areaName); } catch {}
        }
    }
}

class IDBStore {
    private dbPromise: Promise<IDBDatabase>;
    private readonly dbName = 'web-walker';
    private readonly storeName = 'kv';

    constructor() {
        this.dbPromise = new Promise((resolve, reject) => {
            const openReq = indexedDB.open(this.dbName, 1);
            openReq.onupgradeneeded = () => {
                const db = openReq.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'key' });
                }
            };
            openReq.onsuccess = () => resolve(openReq.result);
            openReq.onerror = () => reject(openReq.error);
        });
    }

    private async withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
        const db = await this.dbPromise;
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(this.storeName, mode);
            const store = tx.objectStore(this.storeName);
            Promise.resolve(fn(store)).then((result) => {
                tx.oncomplete = () => resolve(result);
                tx.onabort = () => reject(tx.error);
                tx.onerror = () => reject(tx.error);
            }).catch(reject);
        });
    }

    async getAllMap(): Promise<Record<string, any>> {
        return this.withStore('readonly', async (store) => {
            return await new Promise<Record<string, any>>((resolve, reject) => {
                const req = store.getAll();
                req.onsuccess = () => {
                    const out: Record<string, any> = {};
                    for (const row of req.result as Array<{ key: string; value: any }>) {
                        out[row.key] = row.value;
                    }
                    resolve(out);
                };
                req.onerror = () => reject(req.error);
            });
        });
    }

    async getMany(keys: string[]): Promise<Record<string, any>> {
        return this.withStore('readonly', async (store) => {
            const result: Record<string, any> = {};
            await Promise.all(keys.map((k) => new Promise<void>((resolve) => {
                const req = store.get(k);
                req.onsuccess = () => { const row = req.result as { key: string; value: any } | undefined; result[k] = row ? row.value : undefined; resolve(); };
                req.onerror = () => { result[k] = undefined; resolve(); };
            })));
            return result;
        });
    }

    async getOne(key: string): Promise<any> {
        return this.withStore('readonly', async (store) => {
            return await new Promise<any>((resolve) => {
                const req = store.get(key);
                req.onsuccess = () => { const row = req.result as { key: string; value: any } | undefined; resolve(row ? row.value : undefined); };
                req.onerror = () => resolve(undefined);
            });
        });
    }

    async setMany(obj: Record<string, any>): Promise<StorageChanges> {
        return this.withStore('readwrite', async (store) => {
            const changes: StorageChanges = {};
            await Promise.all(Object.keys(obj).map((key) => new Promise<void>((resolve) => {
                const getReq = store.get(key);
                getReq.onsuccess = () => {
                    const oldRow = getReq.result as { key: string; value: any } | undefined;
                    const oldValue = oldRow ? oldRow.value : undefined;
                    const newValue = obj[key];
                    const putReq = store.put({ key, value: newValue });
                    putReq.onsuccess = () => { changes[key] = { oldValue, newValue }; resolve(); };
                    putReq.onerror = () => { changes[key] = { oldValue, newValue }; resolve(); };
                };
                getReq.onerror = () => {
                    const newValue = obj[key];
                    const putReq = store.put({ key, value: newValue });
                    putReq.onsuccess = () => { changes[key] = { newValue }; resolve(); };
                    putReq.onerror = () => { changes[key] = { newValue }; resolve(); };
                };
            })));
            return changes;
        });
    }

    async clearAll(): Promise<StorageChanges> {
        return this.withStore('readwrite', async (store) => {
            const all: Record<string, any> = await new Promise((resolve, reject) => {
                const req = store.getAll();
                req.onsuccess = () => {
                    const out: Record<string, any> = {};
                    for (const row of req.result as Array<{ key: string; value: any }>) {
                        out[row.key] = row.value;
                    }
                    resolve(out);
                };
                req.onerror = () => reject(req.error);
            });
            const changes: StorageChanges = {};
            for (const [k, v] of Object.entries(all)) {
                changes[k] = { oldValue: v, newValue: undefined };
            }
            await new Promise<void>((resolve, reject) => {
                const req = store.clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
            return changes;
        });
    }
}

class LocalArea {
    private idb = new IDBStore();
    private events = new StorageEventHub();
    private migrationStarted = false;

    async get(keys: null | string | string[]): Promise<Record<string, any>> {
        // Kick off migration (non-blocking)
        this.ensureMigration();
        if (keys === null) {
            return await this.idb.getAllMap();
        }
        if (typeof keys === 'string') {
            const value = await this.idb.getOne(keys);
            return { [keys]: value };
        }
        return await this.idb.getMany(keys);
    }

    async set(items: Record<string, any>): Promise<void> {
        const changes = await this.idb.setMany(items);
        if (Object.keys(changes).length > 0) this.events.emit(changes);
    }

    async clear(): Promise<void> {
        const changes = await this.idb.clearAll();
        if (Object.keys(changes).length > 0) this.events.emit(changes);
    }

    get onChanged() {
        // Expose a subset compatible with chrome.storage.onChanged
        return {
            addListener: (listener: OnChangedListener) => this.events.addListener(listener),
            removeListener: (listener: OnChangedListener) => this.events.removeListener(listener),
            hasListener: (listener: OnChangedListener) => this.events.hasListener(listener)
        };
    }

    private async ensureMigration(): Promise<void> {
        if (this.migrationStarted) return;
        this.migrationStarted = true;
        try {
            // If there is already data in IDB, skip migration
            const existing = await this.idb.getAllMap();
            if (Object.keys(existing).length > 0) return;
        } catch {}
        try {
            // Best-effort migration from chrome.storage.local if available
            const chromeAny: any = (globalThis as any).chrome;
            if (chromeAny && chromeAny.storage && chromeAny.storage.local && typeof chromeAny.storage.local.get === 'function') {
                const payload = await chromeAny.storage.local.get(null);
                if (payload && typeof payload === 'object' && Object.keys(payload).length > 0) {
                    const changes = await this.idb.setMany(payload);
                    if (Object.keys(changes).length > 0) this.events.emit(changes);
                }
            }
        } catch {
            // Ignore migration errors
        }
    }
}

class StorageCompat {
    public local: LocalArea;
    public onChanged: { addListener: (listener: OnChangedListener) => void; removeListener: (listener: OnChangedListener) => void; hasListener: (listener: OnChangedListener) => boolean };

    constructor() {
        this.local = new LocalArea();
        // Mirror chrome.storage.onChanged shape
        this.onChanged = this.local.onChanged;
    }
}

export const storage = new StorageCompat();

export type { StorageChanges, OnChangedListener };


