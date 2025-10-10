<script lang="ts">
    import { onMount } from 'svelte';
    import { _ } from 'svelte-i18n';
    import { ProviderMeta } from '../services/ProviderMeta';
    import { extStorage } from '../services/ExtStorage';

    export let onComplete: () => void;

    type ProviderId = keyof typeof ProviderMeta;
    
    interface ProviderConfig {
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

    let step: 'provider' | 'credentials' = 'provider';
    let providers: ProviderConfig[] = [];
    let selectedProvider: ProviderId | null = null;
    let apiKeyInput = '';
    let baseUrlInput = '';
    let saving = false;
    let errorMessage = '';
    let loading = true;
    let loadError = '';

    // URL для загрузки конфигурации провайдеров
    // Положи providers-config.json на любой статический хостинг (GitHub/GitLab Raw, Pages, Cloudflare R2, etc.)
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

    onMount(async () => {
        await loadProvidersConfig();
    });

    async function loadProvidersConfig() {
        loading = true;
        loadError = '';
        
        try {
            // Пробуем загрузить конфигурацию с внешнего URL
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
                providers = data.providers
                    .filter((p: any) => p.enabled !== false && Object.keys(ProviderMeta).includes(p.id))
                    .sort((a: any, b: any) => (a.priority || 999) - (b.priority || 999));
                
                console.log(`[Wizard] Loaded ${providers.length} providers from ${PROVIDERS_CONFIG_URL}`);
            } else {
                throw new Error('Invalid config format');
            }
        } catch (error) {
            console.warn('[Wizard] Failed to load providers config, using fallback:', error);
            loadError = error instanceof Error ? error.message : 'Unknown error';
            
            // Используем fallback конфигурацию
            providers = FALLBACK_PROVIDERS
                .filter(p => p.enabled)
                .sort((a, b) => (a.priority || 999) - (b.priority || 999));
        } finally {
            loading = false;
        }
    }

    function selectProvider(providerId: ProviderId) {
        selectedProvider = providerId;
        step = 'credentials';
        errorMessage = '';
        
        // Set default values
        const provider = providers.find(p => p.id === providerId);
        if (provider?.needsBaseUrl && providerId === 'ollama') {
            baseUrlInput = 'http://localhost:11434';
        }
    }

    function goBack() {
        step = 'provider';
        selectedProvider = null;
        apiKeyInput = '';
        baseUrlInput = '';
        errorMessage = '';
    }

    async function saveAndContinue() {
        if (!selectedProvider) return;
        
        const provider = providers.find(p => p.id === selectedProvider);
        if (!provider) return;

        // Validation
        if (provider.needsApiKey && !apiKeyInput.trim()) {
            errorMessage = $_('wizard.errors.apiKeyRequired');
            return;
        }
        
        if (provider.needsBaseUrl && !baseUrlInput.trim()) {
            errorMessage = $_('wizard.errors.baseUrlRequired');
            return;
        }

        saving = true;
        errorMessage = '';

        try {
            const meta = ProviderMeta[selectedProvider];
            const settings: Record<string, any> = {
                provider: selectedProvider
            };

            // Save API key or base URL
            if (provider.needsApiKey && meta.storageApiKey) {
                settings[meta.storageApiKey] = apiKeyInput.trim();
            }
            
            if (provider.needsBaseUrl && meta.storageBaseURL) {
                settings[meta.storageBaseURL] = baseUrlInput.trim();
            }

            // Set default model
            settings[meta.storageModels] = meta.defaultModels;
            settings[meta.storageActiveModel] = meta.defaultModelName;
            
            // Legacy fields for backward compatibility
            settings.models = meta.defaultModels;
            settings.activeModel = meta.defaultModelName;
            if (meta.storageApiKey) {
                settings.apiKey = settings[meta.storageApiKey];
            }

            await extStorage.local.set(settings);
            
            // Notify background service
            try {
                chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG' });
            } catch (e) {
                console.warn('Failed to notify background:', e);
            }

            onComplete();
        } catch (error) {
            console.error('Failed to save settings:', error);
            errorMessage = $_('wizard.errors.saveFailed');
            saving = false;
        }
    }

    function getProviderDisplayName(id: ProviderId): string {
        const provider = providers.find(p => p.id === id);
        return provider?.name || id;
    }
</script>

<div class="wizard-container">
    <div class="wizard-content">
        {#if step === 'provider'}
            <div class="wizard-step">
                <h1 class="wizard-title">{$_('wizard.welcome')}</h1>
                <p class="wizard-description">{$_('wizard.selectProvider')}</p>

                {#if loading}
                    <div class="loading-state">
                        <div class="loading-spinner"></div>
                        <p>{$_('wizard.loadingProviders')}</p>
                    </div>
                {:else}
                    <div class="providers-grid">
                        {#each providers as provider (provider.id)}
                            <button
                                class="provider-card"
                                on:click={() => selectProvider(provider.id)}
                            >
                                <div class="provider-name">{provider.name}</div>
                                {#if provider.description}
                                    <div class="provider-description">{provider.description}</div>
                                {/if}
                            </button>
                        {/each}
                    </div>

                    {#if loadError}
                        <div class="info-message">
                            ⚠️ {$_('wizard.usingFallback')}
                        </div>
                    {/if}

                    <div class="wizard-actions">
                        <button class="refresh-btn" on:click={loadProvidersConfig}>
                            🔄 {$_('wizard.reload')}
                        </button>
                    </div>
                {/if}
            </div>
        {:else if step === 'credentials' && selectedProvider}
            {@const provider = providers.find(p => p.id === selectedProvider)}
            <div class="wizard-step">
                <h1 class="wizard-title">{$_('wizard.setupProvider', { values: { provider: getProviderDisplayName(selectedProvider) } })}</h1>
                
                {#if provider?.needsApiKey}
                    <div class="form-group">
                        <label class="form-label" for="wizard-api-key">
                            {$_('wizard.apiKey')}
                        </label>
                        <input
                            id="wizard-api-key"
                            type="password"
                            class="form-input"
                            bind:value={apiKeyInput}
                            placeholder={provider.apiKeyPlaceholder}
                            disabled={saving}
                        />
                        {#if provider.apiKeyUrl}
                            <a href={provider.apiKeyUrl} target="_blank" rel="noopener noreferrer" class="help-link">
                                📝 {$_('wizard.getApiKey')}
                            </a>
                        {/if}
                    </div>
                {/if}

                {#if provider?.needsBaseUrl}
                    <div class="form-group">
                        <label class="form-label" for="wizard-base-url">
                            {$_('wizard.baseUrl')}
                        </label>
                        <input
                            id="wizard-base-url"
                            type="text"
                            class="form-input"
                            bind:value={baseUrlInput}
                            placeholder={provider.baseUrlPlaceholder}
                            disabled={saving}
                        />
                        <p class="help-text">{$_('wizard.ollamaHelp')}</p>
                    </div>
                {/if}

                {#if errorMessage}
                    <div class="error-message">{errorMessage}</div>
                {/if}

                <div class="button-row">
                    <button class="secondary-btn" on:click={goBack} disabled={saving}>
                        ← {$_('wizard.back')}
                    </button>
                    <button class="primary-btn" on:click={saveAndContinue} disabled={saving}>
                        {saving ? $_('wizard.saving') : $_('wizard.continue')}
                    </button>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .wizard-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100%;
        background: var(--bg-primary);
        padding: 2rem 1rem;
        overflow-y: auto;
    }

    .wizard-content {
        width: 100%;
        max-width: 600px;
    }

    .wizard-step {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 2rem;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    }

    .wizard-title {
        font-size: 1.75rem;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0 0 0.5rem 0;
        text-align: center;
    }

    .wizard-description {
        font-size: 1rem;
        color: var(--text-secondary);
        margin: 0 0 1.5rem 0;
        text-align: center;
    }

    .providers-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin-bottom: 1.5rem;
    }

    .provider-card {
        background: var(--bg-primary);
        border: 2px solid var(--border-color);
        border-radius: 12px;
        padding: 1.25rem;
        cursor: pointer;
        transition: all 0.2s;
        text-align: center;
    }

    .provider-card:hover:not(:disabled) {
        border-color: var(--accent-color);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .provider-card.available {
        border-color: #28a745;
    }

    .provider-card.unavailable {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .provider-card.checking {
        opacity: 0.7;
        cursor: wait;
    }

    .provider-card:disabled {
        cursor: not-allowed;
    }

    .provider-name {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 0.5rem;
    }

    .provider-description {
        font-size: 0.85rem;
        color: var(--text-secondary);
        line-height: 1.3;
    }

    .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem 1rem;
        gap: 1rem;
    }

    .loading-state p {
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.95rem;
    }

    .info-message {
        background: rgba(255, 193, 7, 0.1);
        border: 1px solid rgba(255, 193, 7, 0.3);
        border-radius: 8px;
        padding: 0.75rem;
        margin-bottom: 1rem;
        color: var(--text-primary);
        font-size: 0.9rem;
        text-align: center;
    }

    .wizard-actions {
        display: flex;
        gap: 0.75rem;
    }

    .refresh-btn {
        flex: 1;
        padding: 0.75rem;
        background: transparent;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        color: var(--text-primary);
        font-size: 0.95rem;
        cursor: pointer;
        transition: all 0.2s;
    }

    .refresh-btn:hover {
        background: var(--bg-primary);
        border-color: var(--accent-color);
    }

    .form-group {
        margin-bottom: 1.5rem;
    }

    .form-label {
        display: block;
        font-size: 0.95rem;
        font-weight: 500;
        color: var(--text-primary);
        margin-bottom: 0.5rem;
    }

    .form-input {
        width: 100%;
        padding: 0.875rem;
        background: var(--bg-primary);
        border: 2px solid var(--border-color);
        border-radius: 8px;
        color: var(--text-primary);
        font-size: 1rem;
        outline: none;
        transition: border-color 0.2s;
        box-sizing: border-box;
    }

    .form-input:focus {
        border-color: var(--accent-color);
    }

    .form-input:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .help-link {
        display: inline-block;
        margin-top: 0.5rem;
        color: var(--accent-color);
        text-decoration: none;
        font-size: 0.9rem;
        transition: opacity 0.2s;
    }

    .help-link:hover {
        opacity: 0.8;
        text-decoration: underline;
    }

    .help-text {
        margin-top: 0.5rem;
        font-size: 0.85rem;
        color: var(--text-secondary);
        line-height: 1.4;
    }

    .error-message {
        background: rgba(220, 53, 69, 0.1);
        border: 1px solid #dc3545;
        border-radius: 8px;
        padding: 0.75rem;
        color: #dc3545;
        margin-bottom: 1rem;
        font-size: 0.9rem;
    }

    .button-row {
        display: flex;
        gap: 1rem;
        margin-top: 2rem;
    }

    .primary-btn,
    .secondary-btn {
        flex: 1;
        padding: 0.875rem;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }

    .primary-btn {
        background: var(--accent-color);
        color: #000;
    }

    .primary-btn:hover:not(:disabled) {
        background: var(--accent-hover);
    }

    .primary-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .secondary-btn {
        background: transparent;
        border: 1px solid var(--border-color);
        color: var(--text-primary);
    }

    .secondary-btn:hover:not(:disabled) {
        background: var(--bg-primary);
        border-color: var(--accent-color);
    }

    .secondary-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
</style>

