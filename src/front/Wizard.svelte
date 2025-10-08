<script lang="ts">
    import { onMount } from 'svelte';
    import { _ } from 'svelte-i18n';
    import { ProviderMeta } from '../services/ProviderMeta';
    import { extStorage } from '../services/ExtStorage';

    export let onComplete: () => void;

    type ProviderId = keyof typeof ProviderMeta;
    
    interface ProviderAvailability {
        id: ProviderId;
        name: string;
        available: boolean;
        checking: boolean;
        needsApiKey: boolean;
        apiKeyUrl: string;
        apiKeyPlaceholder: string;
        needsBaseUrl: boolean;
        baseUrlPlaceholder: string;
    }

    let step: 'provider' | 'credentials' = 'provider';
    let providers: ProviderAvailability[] = [];
    let selectedProvider: ProviderId | null = null;
    let apiKeyInput = '';
    let baseUrlInput = '';
    let saving = false;
    let errorMessage = '';

    // Можно заменить на свой URL после деплоя Worker (см. AVAILABILITY_WORKER_DEPLOY.md)
    // Если сервер недоступен - будет использован fallback (все провайдеры доступны)
    const AVAILABILITY_CHECK_URL = 'https://web-walker-availability.molchanov-artem-1994.workers.dev/';
    const CHECK_TIMEOUT = 3000; // 3 секунды на проверку

    const providerDetails: Record<ProviderId, {
        needsApiKey: boolean;
        apiKeyUrl: string;
        apiKeyPlaceholder: string;
        needsBaseUrl: boolean;
        baseUrlPlaceholder: string;
    }> = {
        openrouter: {
            needsApiKey: true,
            apiKeyUrl: 'https://openrouter.ai/keys',
            apiKeyPlaceholder: 'sk-or-...',
            needsBaseUrl: false,
            baseUrlPlaceholder: ''
        },
        openai: {
            needsApiKey: true,
            apiKeyUrl: 'https://platform.openai.com/api-keys',
            apiKeyPlaceholder: 'sk-...',
            needsBaseUrl: false,
            baseUrlPlaceholder: ''
        },
        xai: {
            needsApiKey: true,
            apiKeyUrl: 'https://console.x.ai/',
            apiKeyPlaceholder: 'xai-...',
            needsBaseUrl: false,
            baseUrlPlaceholder: ''
        },
        ollama: {
            needsApiKey: false,
            apiKeyUrl: '',
            apiKeyPlaceholder: '',
            needsBaseUrl: true,
            baseUrlPlaceholder: 'http://localhost:11434'
        }
    };

    onMount(async () => {
        await checkProvidersAvailability();
    });

    async function checkProvidersAvailability() {
        const providerIds = Object.keys(ProviderMeta) as ProviderId[];
        
        providers = providerIds.map(id => ({
            id,
            name: id,
            available: false,
            checking: true,
            ...providerDetails[id]
        }));

        // Try to check with external service
        let usesFallback = false;
        try {
            // Quick check if service is available
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CHECK_TIMEOUT);
            
            const testResponse = await fetch(`${AVAILABILITY_CHECK_URL}?provider=openai`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (!testResponse.ok) {
                throw new Error('Service unavailable');
            }
        } catch (error) {
            console.warn('Availability check service unavailable, using fallback:', error);
            usesFallback = true;
        }

        // Check each provider
        for (let i = 0; i < providers.length; i++) {
            const provider = providers[i];
            
            if (usesFallback) {
                // Fallback: все провайдеры доступны
                providers[i] = {
                    ...provider,
                    available: true,
                    checking: false
                };
            } else {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), CHECK_TIMEOUT);
                    
                    const response = await fetch(`${AVAILABILITY_CHECK_URL}?provider=${provider.id}`, {
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    
                    const data = await response.json();
                    providers[i] = {
                        ...provider,
                        available: data.available === true,
                        checking: false
                    };
                } catch (error) {
                    console.warn(`Failed to check ${provider.id}, marking as available:`, error);
                    // Если проверка не удалась - помечаем как доступный
                    providers[i] = {
                        ...provider,
                        available: true,
                        checking: false
                    };
                }
            }
        }
        
        // Force reactivity
        providers = [...providers];
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
        const names: Record<ProviderId, string> = {
            openrouter: 'OpenRouter',
            openai: 'OpenAI',
            xai: 'xAI (Grok)',
            ollama: 'Ollama (Local)'
        };
        return names[id] || id;
    }
</script>

<div class="wizard-container">
    <div class="wizard-content">
        {#if step === 'provider'}
            <div class="wizard-step">
                <h1 class="wizard-title">{$_('wizard.welcome')}</h1>
                <p class="wizard-description">{$_('wizard.selectProvider')}</p>

                <div class="providers-grid">
                    {#each providers as provider (provider.id)}
                        <button
                            class="provider-card"
                            class:checking={provider.checking}
                            class:available={provider.available && !provider.checking}
                            class:unavailable={!provider.available && !provider.checking}
                            on:click={() => selectProvider(provider.id)}
                            disabled={provider.checking || !provider.available}
                        >
                            <div class="provider-name">{getProviderDisplayName(provider.id)}</div>
                            <div class="provider-status">
                                {#if provider.checking}
                                    <span class="status-badge checking">{$_('wizard.checking')}</span>
                                {:else if provider.available}
                                    <span class="status-badge available">✓ {$_('wizard.available')}</span>
                                {:else}
                                    <span class="status-badge unavailable">✗ {$_('wizard.unavailable')}</span>
                                {/if}
                            </div>
                        </button>
                    {/each}
                </div>

                <div class="wizard-actions">
                    <button class="refresh-btn" on:click={checkProvidersAvailability}>
                        🔄 {$_('wizard.recheckAvailability')}
                    </button>
                </div>
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

    .provider-status {
        margin-top: 0.5rem;
    }

    .status-badge {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        border-radius: 12px;
        font-size: 0.85rem;
        font-weight: 500;
    }

    .status-badge.checking {
        background: rgba(255, 193, 7, 0.2);
        color: #ffc107;
    }

    .status-badge.available {
        background: rgba(40, 167, 69, 0.2);
        color: #28a745;
    }

    .status-badge.unavailable {
        background: rgba(220, 53, 69, 0.2);
        color: #dc3545;
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

