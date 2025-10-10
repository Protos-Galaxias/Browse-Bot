import { ProviderMeta } from './ProviderMeta';

type ProviderId = keyof typeof ProviderMeta;

export interface ProviderConfig {
    id: ProviderId;
    name: string;
    description?: string;
    needsApiKey: boolean;
    apiKeyUrl: string;
    apiKeyPlaceholder: string;
    needsBaseUrl: boolean;
    baseUrlPlaceholder: string;
    enabled: boolean;
    priority?: number;
}

// URL для загрузки конфигурации провайдеров
const PROVIDERS_CONFIG_URL = 'https://raw.githubusercontent.com/molchanovartem/web-walker-config/refs/heads/main/providers-config.json';

// Fallback конфигурация (если загрузка не удалась)
const FALLBACK_PROVIDERS: ProviderConfig[] = [
    {
        id: 'openrouter',
        name: 'OpenRouter',
        description: 'Доступ к 200+ моделям',
        needsApiKey: true,
        apiKeyUrl: 'https://openrouter.ai/keys',
        apiKeyPlaceholder: 'sk-or-...',
        needsBaseUrl: false,
        baseUrlPlaceholder: '',
        enabled: true,
        priority: 1
    },
    {
        id: 'openai',
        name: 'OpenAI',
        description: 'GPT-5, GPT-4.1-mini, ...',
        needsApiKey: true,
        apiKeyUrl: 'https://platform.openai.com/api-keys',
        apiKeyPlaceholder: 'sk-...',
        needsBaseUrl: false,
        baseUrlPlaceholder: '',
        enabled: true,
        priority: 2
    },
    {
        id: 'xai',
        name: 'xAI (Grok)',
        description: 'Модели Grok',
        needsApiKey: true,
        apiKeyUrl: 'https://console.x.ai/',
        apiKeyPlaceholder: 'xai-...',
        needsBaseUrl: false,
        baseUrlPlaceholder: '',
        enabled: true,
        priority: 3
    },
    {
        id: 'ollama',
        name: 'Ollama (Локально)',
        description: 'Запуск моделей локально',
        needsApiKey: false,
        apiKeyUrl: '',
        apiKeyPlaceholder: '',
        needsBaseUrl: true,
        baseUrlPlaceholder: 'http://localhost:11434',
        enabled: true,
        priority: 4
    }
];

export async function loadProvidersConfig(): Promise<ProviderConfig[]> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 секунд таймаут
        
        const response = await fetch(PROVIDERS_CONFIG_URL, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Валидация и фильтрация
        if (data.providers && Array.isArray(data.providers)) {
            const providers = data.providers
                .filter((p: any) => p.enabled !== false && Object.keys(ProviderMeta).includes(p.id))
                .sort((a: any, b: any) => (a.priority || 999) - (b.priority || 999));
            
            console.log(`[ProviderLoader] Loaded ${providers.length} providers from ${PROVIDERS_CONFIG_URL}`);
            return providers;
        } else {
            throw new Error('Invalid config format');
        }
    } catch (error) {
        console.warn('[ProviderLoader] Failed to load providers config, using fallback:', error);
        
        // Используем fallback конфигурацию
        return FALLBACK_PROVIDERS
            .filter(p => p.enabled)
            .sort((a, b) => (a.priority || 999) - (b.priority || 999));
    }
}

