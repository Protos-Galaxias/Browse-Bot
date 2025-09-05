// Avoid importing ExtStorage in the background (Firefox MV3 classic background scripts
// choke on top-level ESM imports via code-splitting). Implement minimal IDB helpers here.
const IDB_DB_NAME = 'web-walker-ext-storage';
const IDB_STORE = 'kv';
const IDB_VER = 1;

function idbOpen(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        try {
            const req = indexedDB.open(IDB_DB_NAME, IDB_VER);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
    });
}

function idbReq<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function idbGet(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    const db = await idbOpen();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    if (keys === null || typeof keys === 'undefined') {
        return new Promise((resolve, reject) => {
            const out: Record<string, unknown> = {};
            const cursor = store.openCursor();
            cursor.onsuccess = (ev) => {
                const c = (ev.target as IDBRequest<IDBCursorWithValue>).result;
                if (c) { out[String(c.key)] = c.value; c.continue(); } else resolve(out);
            };
            cursor.onerror = () => reject(cursor.error);
        });
    }
    const list = typeof keys === 'string' ? [keys] : keys;
    const out: Record<string, unknown> = {};
    for (const k of list) {
        try { const v = await idbReq(store.get(k)); if (v !== undefined) out[k] = v; } catch {}
    }
    return out;
}

async function idbSet(items: Record<string, unknown>): Promise<void> {
    const db = await idbOpen();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        for (const key of Object.keys(items)) { try { store.put(items[key], key); } catch {} }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function idbClear(): Promise<void> {
    const db = await idbOpen();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export type Theme = 'light' | 'dark' | 'system';

interface Config {
  apiKey: string;
  model: string;
  theme?: Theme;
  [key: string]: any;
}

export class ConfigService {
    private static instance: ConfigService;
    private config: Partial<Config> = {};
    private cache: Map<string, any> = new Map();
    private readonly CACHE_TTL = 0; // disable cache to always read fresh values

    private constructor() {}

    static getInstance(): ConfigService {
        if (!ConfigService.instance) {
            ConfigService.instance = new ConfigService();
        }
        return ConfigService.instance;
    }

    async initialize(): Promise<void> {
        try {
            const result = await idbGet(null);
            this.config = result as Config;
            this.cache.clear();
        } catch (error) {
            console.error('Failed to initialize ConfigService:', error);
            throw error;
        }
    }

    async get<T = any>(key: string, defaultValue?: T): Promise<T> {
    // Check cache first
        const cached = this.cache.get(key);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
            return cached.value;
        }

        // Get from storage
        try {
            const result = await idbGet(key);
            const value = result[key] !== undefined ? result[key] : defaultValue;

            // Update cache
            if (value !== undefined) {
                this.cache.set(key, {
                    value,
                    timestamp: Date.now()
                });
            }

            return value;
        } catch (error) {
            console.error(`Failed to get config value for key: ${key}`, error);
            return defaultValue as T;
        }
    }

    async set<T = any>(key: string, value: T): Promise<void> {
        try {
            await idbSet({ [key]: value });

            // Update cache
            this.cache.set(key, {
                value,
                timestamp: Date.now()
            });

            // Update in-memory config
            this.config = {
                ...this.config,
                [key]: value
            };
        } catch (error) {
            console.error(`Failed to set config value for key: ${key}`, error);
            throw error;
        }
    }

    async getAll(): Promise<Config> {
        try {
            const result = await idbGet(null);
            const config = result as Config;
            this.config = config;
            return config;
        } catch (error) {
            console.error('Failed to get all config values', error);
            throw error;
        }
    }

    async clear(): Promise<void> {
        try {
            await idbClear();
            this.config = {};
            this.cache.clear();
        } catch (error) {
            console.error('Failed to clear config', error);
            throw error;
        }
    }
}
