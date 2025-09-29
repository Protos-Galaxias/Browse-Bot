// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

// Lightweight IndexedDB-backed storage with a chrome.storage-like API

export type StorageChange = { oldValue?: any; newValue?: any };
export type StorageChangeListener = (changes: Record<string, StorageChange>, area: 'local') => void;

const DB_NAME = 'web-walker-ext-storage';
const STORE_NAME = 'kv';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllEntries(): Promise<Record<string, any>> {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
        const result: Record<string, any> = {};
        const request = store.openCursor();
        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
                result[String(cursor.key)] = cursor.value;
                cursor.continue();
            } else {
                resolve(result);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

async function getMany(keys: string[]): Promise<Record<string, any>> {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const out: Record<string, any> = {};
    for (const key of keys) {
        try {
            const val = await promisify(store.get(key));
            if (val !== undefined) out[key] = val;
        } catch {
            // ignore per-key errors
        }
    }
    return out;
}

function deepEqual(a: any, b: any): boolean {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return a === b; }
}

class OnChanged {
    private listeners: Set<StorageChangeListener> = new Set();
    private bc: BroadcastChannel | null = null;

    constructor() {
        try {
            this.bc = new BroadcastChannel('ext-storage');
            this.bc.onmessage = (ev: MessageEvent) => {
                const data = ev.data;
                if (data && data.type === 'storageChanged' && data.changes) {
                    this.emit(data.changes);
                }
            };
        } catch {
            this.bc = null;
        }
    }

    addListener = (callback: StorageChangeListener): void => {
        this.listeners.add(callback);
    };

    removeListener = (callback: StorageChangeListener): void => {
        this.listeners.delete(callback);
    };

    emit(changes: Record<string, StorageChange>): void {
        for (const cb of Array.from(this.listeners)) {
            try { cb(changes, 'local'); } catch {}
        }
    }

    broadcast(changes: Record<string, StorageChange>): void {
        this.emit(changes);
        try { this.bc?.postMessage({ type: 'storageChanged', changes }); } catch {}
    }
}

class LocalStorageArea {
    private onChanged: OnChanged;

    constructor(onChanged: OnChanged) {
        this.onChanged = onChanged;
    }

    async get(keys?: string | string[] | null): Promise<Record<string, any>> {
        if (keys === null || typeof keys === 'undefined') {
            return await getAllEntries();
        }
        if (typeof keys === 'string') {
            const out = await getMany([keys]);
            return out;
        }
        return await getMany(keys);
    }

    async set(items: Record<string, any>): Promise<void> {
        const keys = Object.keys(items);
        const before = keys.length ? await getMany(keys) : {};
        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            for (const key of keys) {
                try { store.put(items[key], key); } catch {}
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        const changes: Record<string, StorageChange> = {};
        for (const key of keys) {
            const oldValue = before[key];
            const newValue = items[key];
            if (!deepEqual(oldValue, newValue)) {
                changes[key] = {};
                if (oldValue !== undefined) changes[key].oldValue = oldValue;
                if (newValue !== undefined) changes[key].newValue = newValue;
            }
        }
        if (Object.keys(changes).length > 0) this.onChanged.broadcast(changes);
    }

    async clear(): Promise<void> {
        const before = await getAllEntries();
        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
        const changes: Record<string, StorageChange> = {};
        for (const [key, oldValue] of Object.entries(before)) {
            changes[key] = { oldValue, newValue: undefined };
        }
        if (Object.keys(changes).length > 0) this.onChanged.broadcast(changes);
    }
}

class ExtStorageRoot {
    public onChanged = new OnChanged();
    public local = new LocalStorageArea(this.onChanged);
}

export const extStorage = new ExtStorageRoot();


