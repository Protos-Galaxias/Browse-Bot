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
            const result = await chrome.storage.local.get(null);
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
            const result = await chrome.storage.local.get(key);
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
            await chrome.storage.local.set({ [key]: value });

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
            const result = await chrome.storage.local.get(null);
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
            await chrome.storage.local.clear();
            this.config = {};
            this.cache.clear();
        } catch (error) {
            console.error('Failed to clear config', error);
            throw error;
        }
    }
}
