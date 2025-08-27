<script lang="ts">
    import { onMount } from 'svelte';
    import type { Theme } from '../services/ConfigService';
    import DomainPrompts from './DomainPrompts.svelte';
    import { _, locale } from 'svelte-i18n';
    import { setAppLocale } from './lib/i18n';

    let apiKey = '';
    let openaiApiKey = '';
    let xaiApiKey = '';
    let models: string[] = [];
    let newModel = '';
    let activeModel = '';
    let globalPrompt = '';
    let sendOnEnter: boolean = true;
    let hideAgentMessages: boolean = false;
    let theme: Theme = 'system';
    let saveStatus: 'idle' | 'saving' | 'saved' = 'idle';
    let activeTab: 'general' | 'behavior' | 'prompt' = 'general';
    let provider: 'openrouter' | 'openai' | 'ollama' | 'xai' = 'openrouter';
    const DEFAULT_MODELS: Record<'openrouter' | 'openai' | 'ollama' | 'xai', string[]> = {
        openrouter: ['openai/gpt-4.1-mini'],
        openai: ['gpt-4.1-mini'],
        ollama: ['phi3'],
        xai: ['grok-3']
    };
    let ollamaBaseURL = '';

    onMount(async () => {
        const settings = await chrome.storage.local.get([
            'provider',
            'apiKey',
            'openaiApiKey',
            'ollamaBaseURL',
            'xaiApiKey',
            'xaiBaseURL',
            'models_openrouter',
            'activeModel_openrouter',
            'models_openai',
            'activeModel_openai',
            'models_ollama',
            'activeModel_ollama',
            'models_xai',
            'activeModel_xai',
            // legacy keys for backward-compat population
            'models',
            'activeModel',
            'globalPrompt',
            'theme',
            'sendOnEnter',
            'hideAgentMessages'
        ]);
        provider = (settings.provider === 'openai' || settings.provider === 'openrouter' || settings.provider === 'ollama' || settings.provider === 'xai') ? settings.provider : 'openrouter';
        apiKey = settings.apiKey || '';
        openaiApiKey = settings.openaiApiKey || '';
        ollamaBaseURL = settings.ollamaBaseURL || '';
        xaiApiKey = settings.xaiApiKey || '';

        const legacyModels: string[] | undefined = Array.isArray(settings.models) ? settings.models : undefined;
        const legacyActive: string | undefined = typeof settings.activeModel === 'string' ? settings.activeModel : undefined;

        const modelsOpenrouter: string[] = Array.isArray(settings.models_openrouter) && settings.models_openrouter.length > 0
            ? settings.models_openrouter
            : (legacyModels && legacyModels.length > 0 ? legacyModels : DEFAULT_MODELS.openrouter);
        const modelsOpenai: string[] = Array.isArray(settings.models_openai) && settings.models_openai.length > 0
            ? settings.models_openai
            : (legacyModels && legacyModels.length > 0 ? legacyModels : DEFAULT_MODELS.openai);
        const modelsOllama: string[] = Array.isArray(settings.models_ollama) && settings.models_ollama.length > 0
            ? settings.models_ollama
            : DEFAULT_MODELS.ollama;
        const modelsXai: string[] = Array.isArray(settings.models_xai) && settings.models_xai.length > 0
            ? settings.models_xai
            : DEFAULT_MODELS.xai;

        const activeModelOpenrouter: string = typeof settings.activeModel_openrouter === 'string' && settings.activeModel_openrouter
            ? settings.activeModel_openrouter
            : (legacyActive || modelsOpenrouter[0]);
        const activeModelOpenai: string = typeof settings.activeModel_openai === 'string' && settings.activeModel_openai
            ? settings.activeModel_openai
            : (legacyActive || modelsOpenai[0]);
        const activeModelOllama: string = typeof settings.activeModel_ollama === 'string' && settings.activeModel_ollama
            ? settings.activeModel_ollama
            : modelsOllama[0];
        const activeModelXai: string = typeof settings.activeModel_xai === 'string' && settings.activeModel_xai
            ? settings.activeModel_xai
            : modelsXai[0];

        if (provider === 'openai') {
            models = modelsOpenai;
            activeModel = activeModelOpenai;
        } else if (provider === 'ollama') {
            models = modelsOllama;
            activeModel = activeModelOllama;
        } else if (provider === 'xai') {
            models = modelsXai;
            activeModel = activeModelXai;
        } else {
            models = modelsOpenrouter;
            activeModel = activeModelOpenrouter;
        }
        globalPrompt = typeof settings.globalPrompt === 'string' ? settings.globalPrompt : '';
        theme = settings.theme || 'system';
        sendOnEnter = typeof settings.sendOnEnter === 'boolean' ? settings.sendOnEnter : true;
        hideAgentMessages = typeof settings.hideAgentMessages === 'boolean' ? settings.hideAgentMessages : false;
        applyTheme(theme);
        chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG' });
    });

    function applyTheme(selectedTheme: Theme) {
        const root = document.documentElement;

        if (selectedTheme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            selectedTheme = prefersDark ? 'dark' : 'light';
        }

        root.setAttribute('data-theme', selectedTheme);
    }

    function handleThemeChange(newTheme: Theme) {
        theme = newTheme;
        applyTheme(theme);
        saveSettings();
    }

    function addModel() {
        if (newModel.trim() && !models.includes(newModel.trim())) {
            models = [...models, newModel.trim()];
            newModel = '';
            saveSettings();
        }
    }

    function removeModel(index: number) {
        if (models.length > 1) {
            models = models.filter((_, i) => i !== index);
            if (activeModel === models[index]) {
                activeModel = models[0];
            }
            saveSettings();
        }
    }

    function setActiveModel(model: string) {
        activeModel = model;
        saveSettings();
    }

    async function setProvider(newProvider: 'openrouter' | 'openai' | 'ollama' | 'xai') {
        provider = newProvider;
        // Load provider-specific models and activeModel; fallback to defaults
        const keys = newProvider === 'openai'
            ? ['models_openai', 'activeModel_openai'] as const
            : newProvider === 'ollama'
                ? ['models_ollama', 'activeModel_ollama'] as const
                : newProvider === 'xai'
                    ? ['models_xai', 'activeModel_xai'] as const
                    : ['models_openrouter', 'activeModel_openrouter'] as const;
        const store = await chrome.storage.local.get(keys as unknown as string[]);
        const fallbackModels = DEFAULT_MODELS[newProvider];
        const nextModels: string[] = Array.isArray(store[keys[0]]) && (store[keys[0]] as any).length > 0 ? (store[keys[0]] as any) : fallbackModels;
        const nextActive: string = typeof store[keys[1]] === 'string' && store[keys[1]] ? String(store[keys[1]]) : nextModels[0];
        models = nextModels;
        activeModel = nextActive;
        await saveSettings();
    }

    async function saveSettings() {
        saveStatus = 'saving';
        const payload: Record<string, unknown> = {
            provider,
            apiKey,
            openaiApiKey,
            ollamaBaseURL,
            globalPrompt,
            theme,
            sendOnEnter,
            hideAgentMessages,
            // Mirror for backward compatibility
            models,
            activeModel
        };
        if (provider === 'openai') {
            payload['models_openai'] = models;
            payload['activeModel_openai'] = activeModel;
        } else if (provider === 'ollama') {
            payload['models_ollama'] = models;
            payload['activeModel_ollama'] = activeModel;
        } else {
            payload['models_openrouter'] = models;
            payload['activeModel_openrouter'] = activeModel;
        }
        await chrome.storage.local.set(payload);
        saveStatus = 'saved';
        setTimeout(() => {
            saveStatus = 'idle';
        }, 2000);
    }
</script>

<div class="settings-container">
        <div class="tabs">
            <button class="tab {activeTab === 'general' ? 'active' : ''}" on:click={() => activeTab = 'general'}>{$_('tabs.general')}</button>
            <button class="tab {activeTab === 'behavior' ? 'active' : ''}" on:click={() => activeTab = 'behavior'}>{$_('tabs.behavior')}</button>
            <button class="tab {activeTab === 'prompt' ? 'active' : ''}" on:click={() => activeTab = 'prompt'}>{$_('tabs.prompt')}</button>
        </div>

        {#if activeTab === 'general'}
        <div class="setting-group">
            <label class="setting-label">
                {$_('common.language')}
                <select class="setting-input" bind:value={$locale} on:change={(e) => setAppLocale((e.target as HTMLSelectElement).value)}>
                    <option value="en">{$_('common.en')}</option>
                    <option value="ru">{$_('common.ru')}</option>
                </select>
            </label>
        </div>
        <div class="setting-group">
            <label class="setting-label">
                {$_('common.provider')}
                <select class="setting-input" bind:value={provider} on:change={(e) => setProvider((e.target as HTMLSelectElement).value as any)}>
                    <option value="openrouter">{$_('common.openrouter')}</option>
                    <option value="openai">{$_('common.openai')}</option>
                    <option value="ollama">{$_('common.ollama')}</option>
                    <option value="xai">{$_('common.xai')}</option>
                </select>
            </label>
        </div>

        <div class="setting-group">
            <label class="setting-label">
                {provider === 'openrouter' ? $_('settings.apiKeyOpenRouter') : provider === 'openai' ? $_('settings.apiKeyOpenAI') : provider === 'xai' ? $_('settings.apiKeyXAI') : $_('settings.ollamaBaseURL')}
                {#if provider === 'openrouter'}
                    <input
                        type="password"
                        bind:value={apiKey}
                        on:input={saveSettings}
                        placeholder={$_('settings.placeholders.openrouterKey')}
                        class="setting-input"
                    />
                {:else if provider === 'openai'}
                    <input
                        type="password"
                        bind:value={openaiApiKey}
                        on:input={saveSettings}
                        placeholder={$_('settings.placeholders.openaiKey')}
                        class="setting-input"
                    />
                {:else if provider === 'xai'}
                    <input
                        type="password"
                        bind:value={xaiApiKey}
                        on:input={saveSettings}
                        placeholder={$_('settings.placeholders.xaiKey')}
                        class="setting-input"
                    />
                {:else}
                    <input
                        type="text"
                        bind:value={ollamaBaseURL}
                        on:input={saveSettings}
                        placeholder={$_('settings.placeholders.ollamaBaseUrl')}
                        class="setting-input"
                    />
                {/if}
            </label>
        </div>

        {#if (provider === 'openrouter' && !apiKey) || (provider === 'openai' && !openaiApiKey) || (provider === 'xai' && !xaiApiKey) || (provider === 'ollama' && !ollamaBaseURL)}
            <div class="info-card">
                {#if provider === 'openrouter'}
                    <p>{$_('settings.help.needKey', { values: { provider: 'OpenRouter' } })}</p>
                    <ol>
                        <li>{$_('settings.help.openrouterHint')}</li>
                        <li>{$_('settings.help.steps.signInGoToApiKeys')}</li>
                        <li>{$_('settings.help.steps.createKey')}</li>
                        <li>{$_('settings.help.steps.pasteAutoSave')}</li>
                    </ol>
                {:else if provider === 'openai'}
                    <p>{$_('settings.help.needKey', { values: { provider: 'OpenAI' } })}</p>
                    <ol>
                        <li>{$_('settings.help.openaiHint')}</li>
                        <li>{$_('settings.help.steps.signInGoToApiKeys')}</li>
                        <li>{$_('settings.help.steps.createKey')}</li>
                        <li>{$_('settings.help.steps.pasteAutoSave')}</li>
                    </ol>
                {:else if provider === 'xai'}
                    <p>{$_('settings.help.needKey', { values: { provider: 'xAI' } })}</p>
                    <ol>
                        <li>{$_('settings.help.xai.link')}</li>
                        <li>{$_('settings.help.xai.signInGetKey')}</li>
                        <li>{$_('settings.help.xai.pasteAutoSave')}</li>
                    </ol>
                {:else}
                    <p>{$_('settings.help.ollamaHint')}</p>
                    <ol>
                        <li>{$_('settings.help.ollama.install')}</li>
                        <li>{$_('settings.help.ollama.ensurePort')}</li>
                        <li>{$_('settings.help.ollama.changeBaseUrl')}</li>
                    </ol>
                {/if}
                <p>{$_('common.saved')}</p>
            </div>
        {/if}

        <div class="setting-group">
            <label class="setting-label">
                {$_('common.models')}
                <div class="models-container">
                    {#each models as model, index}
                        <div class="model-item {activeModel === model ? 'active' : ''}">
                            <span class="model-name">{model}</span>
                            <div class="model-actions">
                                <button class="set-active-btn" on:click={() => setActiveModel(model)}>
                                    {activeModel === model ? $_('common.selected') : $_('common.choose')}
                                </button>
                                {#if models.length > 1}
                                    <button class="remove-btn" on:click={() => removeModel(index)}>×</button>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
                <div class="add-model">
                    <input
                        type="text"
                        bind:value={newModel}
                        placeholder={$_('settings.placeholders.modelName')}
                        class="setting-input"
                    />
                    <button class="add-btn" on:click={addModel}>+</button>
                </div>
            </label>
        </div>

        
        {/if}

        {#if activeTab === 'prompt'}
        <div class="setting-group">
            <label class="setting-label">
                {$_('settings.globalPromptLabel')}
                <textarea
                    bind:value={globalPrompt}
                    class="setting-textarea"
                    placeholder={$_('settings.placeholders.globalPrompt')}
                    rows="6"
                    on:input={saveSettings}
                ></textarea>
            </label>
        </div>

        <div class="setting-group">
            <div class="setting-label">{$_('settings.domainPrompts')}</div>
            <DomainPrompts />
        </div>
        {/if}

        {#if activeTab === 'behavior'}
        <div class="setting-group">
            <label class="setting-label">
                {$_('settings.sendOnEnterLabel')}
                <div class="toggle-row">
                    <input id="sendOnEnter" type="checkbox" bind:checked={sendOnEnter} on:change={saveSettings} />
                    <label for="sendOnEnter">{$_('settings.sendOnEnter')}</label>
                </div>
            </label>
        </div>

        <div class="setting-group">
            <label class="setting-label">
                {$_('settings.themeLabel')}
                <div class="theme-selector">
                    <button
                        class="theme-btn {theme === 'light' ? 'active' : ''}"
                        on:click={() => handleThemeChange('light')}
                    >
                        ☀️ {$_('settings.theme.light')}
                    </button>
                    <button
                        class="theme-btn {theme === 'dark' ? 'active' : ''}"
                        on:click={() => handleThemeChange('dark')}
                    >
                        🌙 {$_('settings.theme.dark')}
                    </button>
                    <button
                        class="theme-btn {theme === 'system' ? 'active' : ''}"
                        on:click={() => handleThemeChange('system')}
                    >
                        💻 {$_('settings.theme.system')}
                    </button>
                </div>
            </label>
        </div>

        <div class="setting-group">
            <label class="setting-label">
                {$_('settings.hideAgentMessagesLabel')}
                <div class="toggle-row">
                    <input id="hideAgentMessages" type="checkbox" bind:checked={hideAgentMessages} on:change={saveSettings} />
                    <label for="hideAgentMessages">{$_('settings.hideAgentMessages')}</label>
                </div>
            </label>
        </div>
        {/if}

        {#if saveStatus === 'saved'}
            <div class="save-toast">{$_('common.saved')}</div>
        {/if}
</div>

<style>
    :root {
        --bg-primary: #2a2a2a;
        --bg-secondary: #1a1a1a;
        --border-color: #3a3a3a;
        --text-primary: #e0e0e0;
        --text-secondary: #a0a0a0;
        --accent-color: #ff6b35;
        --accent-hover: #ff5722;
    }

    :root[data-theme="light"] {
        --bg-primary: #f5f5f5;
        --bg-secondary: #ffffff;
        --border-color: #e0e0e0;
        --text-primary: #333333;
        --text-secondary: #666666;
        --accent-color: #ff6b35;
        --accent-hover: #ff5722;
    }

    :root[data-theme="dark"] {
        --bg-primary: #1a1a1a;
        --bg-secondary: #0a0a0a;
        --border-color: #3a3a3a;
        --text-primary: #f0f0f0;
        --text-secondary: #b0b0b0;
        --accent-color: #ff6b35;
        --accent-hover: #ff5722;
    }

    .settings-container {
        display: block;
        height: 100%;
        min-height: 0;
        overflow-y: auto;
        background: var(--bg-primary);
        padding: 0.75rem;
        transition: background 0.3s;
        box-sizing: border-box;
        max-width: 520px;
        margin: 0 auto;
    }

    .tabs {
        display: flex;
        gap: 0.25rem;
        margin-bottom: 0.75rem;
        position: sticky;
        top: 0;
        background: var(--bg-primary);
        padding-top: 0.25rem;
    }
    .tab {
        background: transparent;
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 0.35rem 0.6rem;
        border-radius: 8px;
        cursor: pointer;
    }
    .tab.active { background: var(--accent-color); border-color: var(--accent-color); color: #fff; }

    

    .setting-group {
        margin-bottom: 1rem;
    }

    .setting-label {
        display: block;
        color: var(--text-primary);
        margin-bottom: 0.5rem;
        font-weight: 500;
    }

    .setting-input {
        width: 100%;
        padding: 0.75rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        color: var(--text-primary);
        font-size: 1rem;
        outline: none;
        transition: border-color 0.2s, background 0.3s;
        box-sizing: border-box;
    }

    .setting-input:focus {
        border-color: var(--accent-color);
    }

    .setting-input::placeholder {
        color: var(--text-secondary);
    }

    .theme-selector {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }

    .theme-btn {
        flex: 1;
        padding: 0.5rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        color: var(--text-primary);
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s;
    }

    .theme-btn:hover {
        border-color: var(--accent-color);
    }

    .theme-btn.active {
        background: var(--accent-color);
        border-color: var(--accent-color);
        color: white;
    }

    

    .setting-textarea {
        width: 100%;
        padding: 0.75rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        color: var(--text-primary);
        font-size: 0.95rem;
        outline: none;
        transition: border-color 0.2s, background 0.3s;
        box-sizing: border-box;
        resize: vertical;
        min-height: 120px;
    }

    .setting-textarea:focus {
        border-color: var(--accent-color);
    }

    .toggle-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--text-primary);
        font-size: 0.9rem;
    }

    .setting-textarea::placeholder {
        color: var(--text-secondary);
    }

    .models-container {
        margin-bottom: 0.5rem;
    }

    .model-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        margin-bottom: 0.25rem;
        border-radius: 6px;
        border: 1px solid var(--border-color);
        transition: all 0.2s;
    }

    .model-item.active {
        border-color: var(--accent-color);
        background: rgba(255, 107, 53, 0.1);
    }

    .model-name {
        color: var(--text-primary);
        font-size: 0.9rem;
        flex: 1;
    }

    .model-actions {
        display: flex;
        gap: 0.25rem;
    }

    .set-active-btn {
        background: transparent;
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.2s;
    }

    .set-active-btn:hover {
        background: var(--border-color);
    }

    .remove-btn {
        background: #ff4444;
        border: none;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .remove-btn:hover {
        background: #cc3333;
    }

    .add-model {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .add-model .setting-input {
        flex: 1;
    }

    .add-btn {
        background: var(--accent-color);
        border: none;
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 6px;
        font-size: 1.2rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .add-btn:hover {
        background: var(--accent-hover);
    }

    .save-toast {
        width: 100%;
        text-align: center;
        background: #28a745;
        color: white;
        padding: 0.5rem;
        border-radius: 8px;
        margin: 0.5rem 0 1rem 0;
    }

    .help-text {
        color: var(--text-secondary);
        font-size: 0.9rem;
        line-height: 1.5;
    }

    .help-text p {
        margin: 0.5rem 0;
    }

    .help-text a {
        color: var(--accent-color);
        text-decoration: none;
    }

    .help-text a:hover {
        text-decoration: underline;
    }

    .info-card {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 0.75rem;
        color: var(--text-primary);
        margin-bottom: 1rem;
    }
    .info-card ol { margin: 0.5rem 0 0.5rem 1.2rem; padding-left: 1rem; }
    .info-card li { margin: 0.25rem 0; }
    .info-card a { color: var(--accent-color); text-decoration: underline; }
</style>
