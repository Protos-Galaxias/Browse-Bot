<!--
Copyright (c) 2025 PROTOS GALAXIAS LIMITED
SPDX-License-Identifier: BSL-1.1
-->

<script lang="ts">
    import { onMount } from 'svelte';
    import type { Theme } from '../services/ConfigService';
    import DomainPrompts from './DomainPrompts.svelte';
    import { _, locale } from 'svelte-i18n';
    import { setAppLocale } from './lib/i18n';
    import { ProviderMeta as ProviderConfigs } from '../services/ProviderMeta';
    import { extStorage } from '../services/ExtStorage';
    import { loadProvidersConfig, type ProviderConfig } from '../services/ProviderLoader';
    
    type ProviderId = keyof typeof ProviderConfigs;
    
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
    let provider: ProviderId = 'openrouter';
    let ollamaBaseURL = '';
    let mcps: Array<{ id?: string; label?: string; endpoint: string; enabled: boolean }> = [];
    let isMcpModalOpen: boolean = false;
    let editingMcpIndex: number | null = null;
    let formMcpLabel: string = '';
    let formMcpEndpoint: string = '';
    let formMcpEnabled: boolean = true;
    // External tools
    type ExternalTool = { name: string; description?: string; code: string; enabled: boolean };
    let externalTools: ExternalTool[] = [];
    let isExtModalOpen: boolean = false;
    let editingExtIndex: number | null = null;
    let formExtName: string = '';
    let formExtDescription: string = '';
    let formExtCode: string = '';
    let formExtEnabled: boolean = true;
    
    // Провайдеры из JSON
    let availableProviders: ProviderConfig[] = [];

    onMount(async () => {
        availableProviders = await loadProvidersConfig();
        const providerIds = Object.keys(ProviderConfigs) as ProviderId[];

        const keysToLoad = new Set<string>([
            'provider',
            'globalPrompt',
            'theme',
            'sendOnEnter',
            'hideAgentMessages',
            // legacy
            'models',
            'activeModel'
        ]);
        for (const pid of providerIds) {
            const meta = ProviderConfigs[pid];
            keysToLoad.add(meta.storageModels);
            keysToLoad.add(meta.storageActiveModel);
            if (meta.storageApiKey) keysToLoad.add(meta.storageApiKey);
            if (meta.storageBaseURL) keysToLoad.add(meta.storageBaseURL);
        }
        keysToLoad.add('mcps');
        keysToLoad.add('mcp');
        keysToLoad.add('externalTools');
        const settings = await extStorage.local.get(Array.from(keysToLoad));
        const mcpsStored = Array.isArray(settings.mcps) ? settings.mcps as Array<{ id?: string; label?: string; endpoint?: string; enabled?: boolean }> : [];
        const legacyMcp = settings.mcp as { enabled?: boolean; endpoint?: string } | undefined;
        mcps = mcpsStored
            .filter(m => m && typeof m.endpoint === 'string' && m.endpoint.trim().length > 0)
            .map(m => ({ id: m.id, label: m.label, endpoint: String(m.endpoint), enabled: Boolean(m.enabled) })) as any;
        if (mcps.length === 0 && legacyMcp && legacyMcp.enabled && typeof legacyMcp.endpoint === 'string' && legacyMcp.endpoint.trim().length > 0) {
            mcps = [{ endpoint: legacyMcp.endpoint.trim(), enabled: true }];
        }

        provider = (providerIds as string[]).includes(settings.provider) ? settings.provider as ProviderId : 'openrouter';

        // API keys / baseURLs (keep separate vars for inputs)
        apiKey = settings.apiKey || '';
        openaiApiKey = settings.openaiApiKey || '';
        xaiApiKey = settings.xaiApiKey || '';
        ollamaBaseURL = settings.ollamaBaseURL || '';

        const legacyModels: string[] | undefined = Array.isArray(settings.models) ? settings.models : undefined;
        const legacyActive: string | undefined = typeof settings.activeModel === 'string' ? settings.activeModel : undefined;

        const modelsByProvider: Record<ProviderId, string[]> = {} as any;
        const activeByProvider: Record<ProviderId, string> = {} as any;
        for (const pid of providerIds) {
            const meta = ProviderConfigs[pid];
            const storedModels: string[] | undefined = Array.isArray(settings[meta.storageModels]) ? settings[meta.storageModels] : undefined;
            const finalModels = storedModels && storedModels.length > 0
                ? storedModels
                : (legacyModels && legacyModels.length > 0 ? legacyModels : meta.defaultModels);
            modelsByProvider[pid] = finalModels;

            const storedActive: string | undefined = typeof settings[meta.storageActiveModel] === 'string' && settings[meta.storageActiveModel]
                ? settings[meta.storageActiveModel]
                : undefined;
            activeByProvider[pid] = storedActive || legacyActive || finalModels[0];
        }

        models = modelsByProvider[provider];
        activeModel = activeByProvider[provider];

        globalPrompt = typeof settings.globalPrompt === 'string' ? settings.globalPrompt : '';
        theme = settings.theme || 'system';
        sendOnEnter = typeof settings.sendOnEnter === 'boolean' ? settings.sendOnEnter : true;
        hideAgentMessages = typeof settings.hideAgentMessages === 'boolean' ? settings.hideAgentMessages : false;
        externalTools = Array.isArray(settings.externalTools)
            ? (settings.externalTools as any[])
                .filter((t) => t && typeof t.name === 'string' && typeof t.code === 'string')
                .map((t) => ({ name: String(t.name).trim(), description: (t.description ?? ''), code: String(t.code), enabled: Boolean(t.enabled ?? true) }))
            : [];
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
            const removed = models[index];
            const next = models.filter((_, i) => i !== index);
            models = next;
            if (activeModel === removed) {
                activeModel = next[0];
            }
            saveSettings();
        }
    }

    function setActiveModel(model: string) {
        activeModel = model;
        saveSettings();
    }

    async function setProvider(newProvider: ProviderId) {
        provider = newProvider;
        const meta = ProviderConfigs[newProvider];
        const store = await extStorage.local.get([meta.storageModels, meta.storageActiveModel]);
        const fallbackModels = meta.defaultModels;
        const storedModels = Array.isArray(store[meta.storageModels]) ? store[meta.storageModels] as string[] : undefined;
        const nextModels: string[] = storedModels && storedModels.length > 0 ? storedModels : fallbackModels;
        const nextActive: string = typeof store[meta.storageActiveModel] === 'string' && store[meta.storageActiveModel] ? String(store[meta.storageActiveModel]) : nextModels[0];
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
            xaiApiKey,
            ollamaBaseURL,
            globalPrompt,
            theme,
            sendOnEnter,
            hideAgentMessages,
            // Mirror for backward compatibility
            models,
            activeModel
        };
        payload['mcps'] = mcps;
        payload['externalTools'] = externalTools;
        const meta = ProviderConfigs[provider];
        payload[meta.storageModels] = models;
        payload[meta.storageActiveModel] = activeModel;
        await extStorage.local.set(payload);
        saveStatus = 'saved';
        setTimeout(() => {
            saveStatus = 'idle';
        }, 2000);
    }

    function removeMcp(index: number) {
        mcps = mcps.filter((_, i) => i !== index);
        saveSettings();
    }

    function setMcpEnabled(index: number, value: boolean) {
        mcps = mcps.map((m, i) => i === index ? { ...m, enabled: value } : m);
        saveSettings();
    }

    function openAddExtModal() {
        editingExtIndex = null;
        formExtName = '';
        formExtDescription = '';
        formExtCode = '';
        formExtEnabled = true;
        isExtModalOpen = true;
    }

    function openEditExtModal(index: number) {
        const t = externalTools[index];
        editingExtIndex = index;
        formExtName = t?.name || '';
        formExtDescription = t?.description || '';
        formExtCode = t?.code || '';
        formExtEnabled = Boolean(t?.enabled);
        isExtModalOpen = true;
    }

    function closeExtModal() {
        isExtModalOpen = false;
    }

    function submitExt() {
        const name = (formExtName || '').trim();
        const code = (formExtCode || '').trim();
        const description = (formExtDescription || '').trim();
        if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) || !code) { isExtModalOpen = false; return; }
        const entry = { name, description, code, enabled: formExtEnabled } as ExternalTool;
        if (editingExtIndex === null) {
            externalTools = [...externalTools, entry];
        } else {
            externalTools = externalTools.map((t, i) => i === editingExtIndex ? entry : t);
        }
        isExtModalOpen = false;
        saveSettings();
    }

    function removeExt(index: number) {
        externalTools = externalTools.filter((_, i) => i !== index);
        saveSettings();
    }

    function setExtEnabled(index: number, value: boolean) {
        externalTools = externalTools.map((t, i) => i === index ? { ...t, enabled: value } : t);
        saveSettings();
    }

    function openAddMcpModal() {
        editingMcpIndex = null;
        formMcpLabel = '';
        formMcpEndpoint = '';
        formMcpEnabled = true;
        isMcpModalOpen = true;
    }

    function openEditMcpModal(index: number) {
        const m = mcps[index];
        editingMcpIndex = index;
        formMcpLabel = m?.label || '';
        formMcpEndpoint = m?.endpoint || '';
        formMcpEnabled = Boolean(m?.enabled);
        isMcpModalOpen = true;
    }

    function closeMcpModal() {
        isMcpModalOpen = false;
    }

    function submitMcp() {
        const ep = (formMcpEndpoint || '').trim();
        const lbl = (formMcpLabel || '').trim();
        if (!ep) { isMcpModalOpen = false; return; }
        if (editingMcpIndex === null) {
            mcps = [...mcps, { label: lbl || undefined, endpoint: ep, enabled: formMcpEnabled }];
        } else {
            mcps = mcps.map((m, i) => i === editingMcpIndex ? { ...m, label: lbl || undefined, endpoint: ep, enabled: formMcpEnabled } : m);
        }
        isMcpModalOpen = false;
        saveSettings();
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
                <select class="setting-input" bind:value={provider} on:change={(e) => setProvider((e.target as HTMLSelectElement).value as ProviderId)}>
                    {#each availableProviders as providerCfg}
                        <option value={providerCfg.id}>{providerCfg.name}</option>
                    {/each}
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
            </div>
        {/if}

        <div class="setting-group">
            <div class="setting-label">{$_('common.models')}</div>
            <div class="models-container">
                {#each models as model, index (index)}
                    <div class="model-item {activeModel === model ? 'active' : ''}" on:click={() => setActiveModel(model)}>
                        <span class="model-name">{model}</span>
                        <div class="model-actions">
                            {#if models.length > 1}
                                <button class="remove-btn" on:click|stopPropagation={() => removeModel(index)} type="button">×</button>
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
        </div>

        <div class="setting-group">
            <div class="setting-label">MCP Servers</div>
            {#each mcps as m, index (index)}
                <div class="mcp-card">
                    <div class="mcp-card-main">
                        <div class="mcp-title">{m.label || (new URL(m.endpoint).hostname.replace(/^www\./, ''))}</div>
                        <div class="mcp-subtitle">{m.endpoint}</div>
                    </div>
                    <div class="mcp-actions">
                        <label class="toggle-row" for={`mcp-enabled-${index}`}>
                            <input id={`mcp-enabled-${index}`} type="checkbox" checked={m.enabled} on:change={(e) => setMcpEnabled(index, (e.target as HTMLInputElement).checked)} />
                        </label>
                        <button class="icon-btn" type="button" aria-label="Edit MCP" on:click={() => openEditMcpModal(index)}>✎</button>
                        <button class="remove-btn" type="button" aria-label="Remove MCP" on:click={() => removeMcp(index)}>×</button>
                    </div>
                </div>
            {/each}
            <div class="add-model">
                <button class="add-btn" type="button" on:click={openAddMcpModal}>+</button>
            </div>
        </div>

        <div class="setting-group">
            <div class="setting-label">{$_('settings.externalTools.label')}</div>
            {#each externalTools as t, index (index)}
                <div class="mcp-card">
                    <div class="mcp-card-main">
                        <div class="mcp-title">{t.name}</div>
                        <div class="mcp-subtitle">{t.description || $_('settings.externalTools.noDescription')}</div>
                    </div>
                    <div class="mcp-actions">
                        <label class="toggle-row" for={`ext-enabled-${index}`}>
                            <input id={`ext-enabled-${index}`} type="checkbox" checked={t.enabled} on:change={(e) => setExtEnabled(index, (e.target as HTMLInputElement).checked)} />
                        </label>
                        <button class="icon-btn" type="button" aria-label="{$_('settings.externalTools.editAriaLabel')}" on:click={() => openEditExtModal(index)}>✎</button>
                        <button class="remove-btn" type="button" aria-label="{$_('settings.externalTools.removeAriaLabel')}" on:click={() => removeExt(index)}>×</button>
                    </div>
                </div>
            {/each}
            <div class="add-model">
                <button class="add-btn" type="button" on:click={openAddExtModal}>+</button>
            </div>
        </div>

        {#if isExtModalOpen}
            <div class="modal-overlay" on:click|self={closeExtModal}>
                <div class="modal">
                    <div class="modal-header">
                        <div class="modal-title">{$_('settings.externalTools.modalTitle')}</div>
                        <button class="icon-btn" type="button" aria-label="Close" on:click={closeExtModal}>×</button>
                    </div>
                    <div class="modal-body">
                        <input
                            type="text"
                            class="setting-input"
                            placeholder="{$_('settings.externalTools.namePlaceholder')}"
                            bind:value={formExtName}
                            style="margin-bottom: 0.5rem;"
                        />
                        <input
                            type="text"
                            class="setting-input"
                            placeholder="{$_('settings.externalTools.descriptionPlaceholder')}"
                            bind:value={formExtDescription}
                            style="margin-bottom: 0.5rem;"
                        />
                        <textarea
                            class="setting-textarea"
                            placeholder="{$_('settings.externalTools.codePlaceholder')}"
                            bind:value={formExtCode}
                            rows="10"
                            style="margin-bottom: 0.5rem;"
                        ></textarea>
                        <div class="toggle-row" style="margin-top: 0.25rem;">
                            <input id="ext-enabled-form" type="checkbox" bind:checked={formExtEnabled} />
                            <label for="ext-enabled-form">{$_('settings.externalTools.enabled')}</label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="primary-btn" type="button" on:click={submitExt}>{editingExtIndex === null ? $_('settings.externalTools.add') : $_('settings.externalTools.save')}</button>
                    </div>
                </div>
            </div>
        {/if}

        {#if isMcpModalOpen}
            <div class="modal-overlay" on:click|self={closeMcpModal}>
                <div class="modal">
                    <div class="modal-header">
                        <div class="modal-title">MCP Server</div>
                        <button class="icon-btn" type="button" aria-label="Close" on:click={closeMcpModal}>×</button>
                    </div>
                    <div class="modal-body">
                        <input
                            type="text"
                            class="setting-input"
                            placeholder="Имя сервера"
                            bind:value={formMcpLabel}
                            style="margin-bottom: 0.5rem;"
                        />
                        <input
                            type="text"
                            class="setting-input"
                            placeholder="https://example.com/mcp"
                            bind:value={formMcpEndpoint}
                            style="margin-bottom: 0.5rem;"
                        />
                        <div class="toggle-row" style="margin-top: 0.25rem;">
                            <input id="mcp-enabled-form" type="checkbox" bind:checked={formMcpEnabled} />
                            <label for="mcp-enabled-form">Включен</label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="primary-btn" type="button" on:click={submitMcp}>{editingMcpIndex === null ? 'Добавить сервер' : 'Сохранить'}</button>
                    </div>
                </div>
            </div>
        {/if}


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
        padding: 0.35rem 0.6rem;
        border-radius: 8px;
        cursor: pointer;
        color: var(--text-primary);
    }
    .tab.active { background: var(--accent-color); border-color: var(--accent-color); color: #000000; }

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
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        padding: 0.5rem;
        margin-bottom: 0.25rem;
        border-radius: 6px;
        border: 1px solid var(--border-color);
        transition: all 0.2s;
        cursor: pointer;
    }

    .model-item.active {
        border-color: var(--accent-color);
        background: rgba(255, 107, 53, 0.1);
    }

    .model-name {
        color: var(--text-primary);
        font-size: 0.9rem;
        display: block;
    }

    .model-actions {
        display: flex;
        gap: 0.25rem;
    }

    .remove-btn {
        background: transparent;
        color: var(--text-secondary);
        width: 24px;
        height: 24px;
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s, color 0.2s;
        outline: none;
        box-shadow: none;
        -webkit-tap-highlight-color: transparent;
    }

    .remove-btn:hover {
        background: var(--border-color);
        color: var(--text-primary);
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
        width: 32px;
        height: 40px;
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

    /* MCP modal styles (match app theme) */
    .mcp-card {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 0.5rem;
        padding: 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        background: var(--bg-secondary);
        margin-bottom: 0.5rem;
    }
    .mcp-card-main { min-width: 0; }
    .mcp-title { color: var(--text-primary); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mcp-subtitle { color: var(--text-secondary); font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mcp-actions { display: flex; align-items: center; gap: 0.5rem; min-height: 28px; }
    .icon-btn { background: transparent; color: var(--text-primary); width: 28px; height: 28px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 0; padding: 0; }
    .mcp-actions .remove-btn { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; line-height: 0; padding: 0; }

    .icon-btn:hover {
        background: var(--border-color);
        color: var(--text-primary);
    }
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    }
    .modal {
        width: 520px;
        max-width: 92vw;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; border-bottom: 1px solid var(--border-color); }
    .modal-title { color: var(--text-primary); font-weight: 600; }
    .modal-body { padding: 0.75rem; }
    .modal-footer { padding: 0.75rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; }
    .primary-btn { background: var(--accent-color); color: #000; border: none; border-radius: 8px; padding: 0.5rem 0.9rem; cursor: pointer; }
</style>
