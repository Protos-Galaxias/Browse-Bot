<!--
Copyright (c) 2025 PROTOS GALAXIAS LIMITED
SPDX-License-Identifier: BSL-1.1
-->

<script lang="ts">
    import { onMount } from 'svelte';
    import MessageList from './components/MessageList.svelte';
    import InputEditor from './components/InputEditor.svelte';
    import ModelSelector from './components/ModelSelector.svelte';
    import { _, format } from 'svelte-i18n';
    import { get } from 'svelte/store';
    import { getHost } from './lib/url';
    import trashIcon from './icons/trash.svg';
    import { extStorage } from '../services/ExtStorage';
    import { ChatStorage, type ChatMeta } from '../services/ChatStorage';

    let prompt = '';
    let log: Array<string | { type: 'i18n'; key: string; params?: Record<string, unknown>; prefix?: 'error'|'result'|'system'|'agent'|'user' } | { type: 'ui'; kind: 'click'; title?: string; text: string }> = [];
    let isTyping = false;
    let isTaskRunning = false;
    let models: string[] = [];
    let activeModel = '';
    let showModelDropdown = false;
    let sendOnEnter: boolean = true;
    let mentions: Array<{ id: number; title: string; url?: string; favIconUrl?: string }> = [];
    let activeTabMeta: { id: number; title: string; url?: string; favIconUrl?: string } | null = null;
    let displayMentions: Array<{ id: number; title: string; url?: string; favIconUrl?: string }> = [];
    let domainPrompts: Record<string, string> = {};
    let activeDomain = '';
    let domainPromptText = '';
    let hideAgentMessages: boolean = false;
    let showChatList = false;
    let chats: ChatMeta[] = [];
    let activeChatId: string | null = null;
    const DEFAULT_MODELS: Record<'openrouter' | 'openai' | 'ollama' | 'xai', string[]> = {
        openrouter: ['openai/gpt-4.1-mini'],
        openai: ['gpt-4.1-mini'],
        ollama: ['phi3'],
        xai: ['grok-3']
    };

    let provider: 'openrouter' | 'openai' | 'ollama' | 'xai' = 'openrouter';

    async function loadModelsFromStorage() {
        const store = await extStorage.local.get([
            'provider',
            'models_openrouter',
            'activeModel_openrouter',
            'models_openai',
            'activeModel_openai',
            'models_ollama',
            'activeModel_ollama',
            'models_xai',
            'activeModel_xai'
        ]);
        provider = (store.provider === 'openai' || store.provider === 'openrouter' || store.provider === 'ollama' || store.provider === 'xai') ? store.provider : 'openrouter';
        const modelsOpenrouter: string[] = Array.isArray(store.models_openrouter) && store.models_openrouter.length > 0 ? store.models_openrouter : DEFAULT_MODELS.openrouter;
        const modelsOpenai: string[] = Array.isArray(store.models_openai) && store.models_openai.length > 0 ? store.models_openai : DEFAULT_MODELS.openai;
        const modelsOllama: string[] = Array.isArray(store.models_ollama) && store.models_ollama.length > 0 ? store.models_ollama : DEFAULT_MODELS.ollama;
        const modelsXai: string[] = Array.isArray(store.models_xai) && store.models_xai.length > 0 ? store.models_xai : DEFAULT_MODELS.xai;
        const activeModelOpenrouter: string = typeof store.activeModel_openrouter === 'string' && store.activeModel_openrouter ? store.activeModel_openrouter : modelsOpenrouter[0];
        const activeModelOpenai: string = typeof store.activeModel_openai === 'string' && store.activeModel_openai ? store.activeModel_openai : modelsOpenai[0];
        const activeModelOllama: string = typeof store.activeModel_ollama === 'string' && store.activeModel_ollama ? store.activeModel_ollama : modelsOllama[0];
        const activeModelXai: string = typeof store.activeModel_xai === 'string' && store.activeModel_xai ? store.activeModel_xai : modelsXai[0];
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
    }

    async function loadChats() {
        try {
            const list = await ChatStorage.getChatList();
            chats = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
            activeChatId = await ChatStorage.getActiveChatId();
        } catch {
        // ignored
        }
    }

    async function ensureActiveChatInitialized() {
        try {
            activeChatId = await ChatStorage.getActiveChatId();
            if (!activeChatId) {
                const settings = await extStorage.local.get(['chatLog']);
                const initialLog = Array.isArray(settings.chatLog) ? settings.chatLog : [];
                const meta = await ChatStorage.createChat(initialLog.length > 0 ? 'Imported chat' : undefined, initialLog);
                activeChatId = meta.id;
            }
        } catch {
        // ignored
        }
    }

    async function loadActiveChatLog() {
        try {
            if (!activeChatId) return;
            log = await ChatStorage.getChatLog(activeChatId);
        } catch {
        // ignored
        }
    }

    async function selectChat(id: string) {
        if (activeChatId === id) { showChatList = false; return; }
        try {
            activeChatId = id;
            await ChatStorage.setActiveChatId(id);
            log = await ChatStorage.getChatLog(id);
            await loadChats();
        } catch {
        // ignored
        }
        showChatList = false;
        // reset agent memory/history in background to isolate chats
        try { chrome.runtime.sendMessage({ type: 'RESET_CONTEXT' }); } catch { /* ignored */ }
    }

    async function newChat() {
        try {
            // reset agent memory/history to isolate chats
            try { chrome.runtime.sendMessage({ type: 'RESET_CONTEXT' }); } catch { /* ignored */ }
            const meta = await ChatStorage.createChat();
            // Immediately clear current view to avoid showing previous history
            log = [];
            isTyping = false;
            isTaskRunning = false;
            await loadChats();
            await selectChat(meta.id);
        } catch {
        // ignored
        }
    }

    async function removeChat(id: string) {
        try {
            await ChatStorage.deleteChat(id);
            await loadChats();
            const nextActive = await ChatStorage.getActiveChatId();
            activeChatId = nextActive;
            if (nextActive) {
                log = await ChatStorage.getChatLog(nextActive);
            } else {
                log = [];
            }
        } catch {
        // ignored
        }
        // Close the chat list after deletion
        showChatList = false;
        // Also reset agent memory/history when chat context changes due to deletion
        try { chrome.runtime.sendMessage({ type: 'RESET_CONTEXT' }); } catch { /* ignored */ }
    }

    async function fetchActiveTab(): Promise<{ id: number; title: string; url?: string; favIconUrl?: string } | null> {
        try {
            const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (!activeTab?.id) return null;
            return { id: activeTab.id, title: activeTab.title || '', url: activeTab.url, favIconUrl: (activeTab as any).favIconUrl };
        } catch {
            // ignored
            try {
                return await new Promise((resolve) => {
                    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                        const t = tabs && tabs[0];
                        resolve(t?.id ? { id: t.id as number, title: t.title || '', url: t.url, favIconUrl: (t as any).favIconUrl } : null);
                    });
                });
            } catch { /* ignored */ return null; }
        }
    }

    function setActiveTabMeta(tab: { id: number; title: string; url?: string; favIconUrl?: string } | null) { activeTabMeta = tab; }

    async function ensureActiveMention() {
        const tab = await fetchActiveTab();
        setActiveTabMeta(tab);
    }

    onMount(async () => {
        await loadModelsFromStorage();
        const settings = await extStorage.local.get(['chatPrompt', 'sendOnEnter', 'hideAgentMessages']);
        prompt = typeof settings.chatPrompt === 'string' ? settings.chatPrompt : '';
        sendOnEnter = typeof settings.sendOnEnter === 'boolean' ? settings.sendOnEnter : true;
        hideAgentMessages = typeof settings.hideAgentMessages === 'boolean' ? settings.hideAgentMessages : false;

        await ensureActiveChatInitialized();
        await loadChats();
        await loadActiveChatLog();

        await ensureActiveMention();

        try {
            const store = await extStorage.local.get(['domainPrompts']);
            domainPrompts = (store?.domainPrompts && typeof store.domainPrompts === 'object') ? store.domainPrompts : {};
        } catch {
        // ignored
        }

        try {
            chrome.tabs.onActivated.addListener(async (activeInfo) => {
                try { const tab = await chrome.tabs.get(activeInfo.tabId); setActiveTabMeta({ id: tab.id as number, title: tab.title || '', url: tab.url, favIconUrl: (tab as any).favIconUrl }); } catch { /* ignored */ }
            });
            chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
                try { if (tab.active) setActiveTabMeta({ id: tab.id as number, title: tab.title || '', url: tab.url, favIconUrl: (tab as any).favIconUrl }); } catch { /* ignored */ }
            });
        } catch {
        // ignored
        }
    });

    $: displayMentions = activeTabMeta && !mentions.some(m => m.id === activeTabMeta!.id)
        ? [activeTabMeta, ...mentions]
        : [...mentions];

    function saveChatState() {
        try {
            (async () => {
                try {
                    if (!activeChatId) {
                        const meta = await ChatStorage.createChat(prompt.trim() ? prompt.slice(0, 30) : undefined, log);
                        activeChatId = meta.id;
                    } else {
                        await ChatStorage.setChatLog(activeChatId, log);
                    }
                    await loadChats();
                } catch {
                // ignored
                }
                await extStorage.local.set({ chatPrompt: prompt });
            })();
        } catch {
        // Error handled silently
        }
    }

    function startTask() {
        if (!prompt.trim()) return;

        isTyping = true;
        isTaskRunning = true;
        log = [...log, `[User]: ${prompt}`];
        saveChatState();

        const tabs = displayMentions.map(t => ({ id: t.id, title: t.title, url: t.url }));
        try {
            chrome.runtime.sendMessage({ type: 'START_TASK', prompt, tabs }, (resp) => {
                const err = chrome.runtime.lastError;
                if (err) {
                    console.warn('[UI] send START_TASK failed', err.message);
                } else {
                    try { console.log('[UI] START_TASK ack', resp); } catch { /* ignored */ }
                }
            });
        } catch (e) {
            console.warn('[UI] send START_TASK threw', e);
        }
        prompt = '';
        mentions = [];
        // После отправки снова показываем активную вкладку
        ensureActiveMention();
        saveChatState();
    }

    function stopTask() {
        isTaskRunning = false;
        isTyping = false;
        try { chrome.runtime.sendMessage({ type: 'STOP_TASK' }); } catch { /* ignored */ }
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'UPDATE_LOG') {
            const payload = message.data;
            const computed = (() => {
                try {
                    if (payload && typeof payload === 'object' && payload.type === 'i18n' && typeof payload.key === 'string') {
                        const fmt = get(format) as (key: string, values?: Record<string, unknown>) => string;
                        const prefix = payload.prefix === 'error' ? '[Ошибка]' : payload.prefix === 'result' ? '[Результат]' : payload.prefix === 'system' ? '[Система]' : payload.prefix === 'agent' ? '[Агент]' : '';
                        const localized = fmt(payload.key, payload.params || {});
                        return `${prefix ? prefix + ': ' : ''}${localized}`;
                    }
                    if (payload && typeof payload === 'object' && payload.type === 'ui' && typeof (payload as any).text === 'string') {
                        return payload; // pass through for UI rendering
                    }
                } catch {
                // ignored
                }
                return String(payload || '');
            })();
            if (hideAgentMessages) {
                // В режиме скрытия показываем только итог/ошибку/анализ
                const isFinalOrError = (typeof computed === 'string') && (computed.startsWith('[Результат]') || computed.startsWith('[Ошибка]') || computed.startsWith('[Анализ]'));
                if (!isFinalOrError) return true;
            }
            log = [...log, computed];
            isTyping = false;
            saveChatState();
        } else if (message.type === 'TASK_COMPLETE') {
            isTaskRunning = false;
            isTyping = false;
        }
    });

    $: (async () => {
        try {
            await extStorage.local.set({ chatPrompt: prompt });
        } catch {
        // Error handled silently
        }
    })();

    function onModelChange(e: CustomEvent<{ model: string }>) {
        activeModel = e.detail.model;
        showModelDropdown = false;
        const payload: Record<string, unknown> = { activeModel };
        if (provider === 'openai') {
            payload['activeModel_openai'] = activeModel;
        } else if (provider === 'ollama') {
            payload['activeModel_ollama'] = activeModel;
        } else if (provider === 'xai') {
            payload['activeModel_xai'] = activeModel;
        } else {
            payload['activeModel_openrouter'] = activeModel;
        }
        (async () => { await extStorage.local.set(payload); })();
    }

    try {
        extStorage.onChanged.addListener(async (changes) => {
            const providerChanged = Boolean(changes.provider);
            const modelKeysChanged =
                Boolean(changes.models_openrouter) ||
                    Boolean(changes.activeModel_openrouter) ||
                    Boolean(changes.models_openai) ||
                    Boolean(changes.activeModel_openai) ||
                    Boolean(changes.models_ollama) ||
                    Boolean(changes.activeModel_ollama) ||
                    Boolean(changes.models_xai) ||
                    Boolean(changes.activeModel_xai);
            if (providerChanged || modelKeysChanged) {
                await loadModelsFromStorage();
            }
        });
    } catch {
    // ignored
    }

    $: activeDomain = (activeTabMeta?.url ? (() => { try { return new URL(activeTabMeta!.url!).hostname.replace(/^www\./,''); } catch { /* ignored */ return ''; } })() : '');
    $: domainPromptText = (activeDomain && domainPrompts[activeDomain]) ? domainPrompts[activeDomain] : '';

    function buildMentionTitle(m: { title?: string; url?: string }) {
        const base = m.title || m.url || '';
        try {
            const host = getHost(m.url);
            const prompt = (host && domainPrompts[host]) ? String(domainPrompts[host]).trim() : '';
            return prompt ? `${base}\n\n${prompt}` : base;
        } catch {
            // ignored
            return base;
        }
    }

    export function openChatSidebar() { showChatList = true; }
</script>

<div class="chat-container">
    {#if log.length === 0}
        <div class="welcome-screen">
            <div class="logo">
                <div class="logo-icon">✦</div>
            </div>
            <h1 class="greeting">{$_('chat.welcome')}</h1>

            <div class="input-card">
                {#if displayMentions.length > 0}
                    <div class="mentions-bar">
                        {#each displayMentions as m}
                            <div class="mention-pill" title={buildMentionTitle(m)}>
                                {#if m.favIconUrl}
                                    <img class="mention-icon" src={m.favIconUrl} alt={getHost(m.url)} />
                                {:else}
                                    <div class="mention-fallback">{getHost(m.url)}</div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/if}
                <InputEditor bind:value={prompt} bind:mentions={mentions} placeholder={$_('chat.helpPlaceholder')} {sendOnEnter} on:submit={startTask} />
                <div class="input-controls">
                    <div class="left-controls">
                        <ModelSelector {models} {activeModel} bind:open={showModelDropdown} on:change={onModelChange} />
                    </div>
                    <div class="right-controls">
                        <button class="send-btn {isTaskRunning ? 'stop-mode' : ''}" on:click={isTaskRunning ? stopTask : startTask} disabled={!isTaskRunning && !prompt.trim()}>
                            <span class="send-icon">{isTaskRunning ? '■' : '↑'}</span>
                        </button>
                    </div>
                </div>
            </div>

            <div class="quick-actions">
                <div class="action-row">
                    <button class="action-btn primary" on:click={() => window.location.hash = '#capabilities'}>
                        <span class="action-icon">💡</span>
                        <span>{$_('chat.capabilities')}</span>
                    </button>
                </div>
            </div>
        </div>
    {:else}
        <MessageList {log} {isTyping} />
    {/if}

    {#if log.length !== 0}
        <div class="input-area">
            <div class="input-container">
                {#if displayMentions.length > 0}
                    <div class="mentions-bar">
                        {#each displayMentions as m}
                            <div class="mention-pill" title={buildMentionTitle(m)}>
                                {#if m.favIconUrl}
                                    <img class="mention-icon" src={m.favIconUrl} alt={getHost(m.url)} />
                                {:else}
                                    <div class="mention-fallback">{getHost(m.url)}</div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/if}
                <InputEditor bind:value={prompt} bind:mentions={mentions} placeholder="" {sendOnEnter} on:submit={isTaskRunning ? stopTask : startTask} />
                <div class="input-controls">
                    <div class="left-controls">
                        <ModelSelector {models} {activeModel} bind:open={showModelDropdown} on:change={onModelChange} />
                    </div>
                    <div class="right-controls">
                        <button class="send-btn {isTaskRunning ? 'stop-mode' : ''}" on:click={isTaskRunning ? stopTask : startTask} disabled={!isTaskRunning && !prompt.trim()}>
                            <span class="send-icon">{isTaskRunning ? '■' : '↑'}</span>
                        </button>
                    </div>
                </div>
            </div>
            <div class="disclaimer">{$_('app.disclaimer')}</div>
        </div>
    {/if}

    {#if showChatList}
        <div class="sidebar-overlay">
            <div class="sidebar-backdrop" role="button" tabindex="0" on:click={() => showChatList = false} on:keydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') showChatList = false; }}></div>
            <aside class="sidebar" aria-label="Chats" tabindex="-1" on:keydown={(e) => { if (e.key === 'Escape') showChatList = false; }}>
                <div class="sidebar-header">
                    <div class="sidebar-title">Chats</div>
                    <button class="sidebar-close" on:click={() => showChatList = false} aria-label="Close">×</button>
                </div>
                <div class="sidebar-actions">
                    <button class="action primary" on:click={newChat}>New chat</button>
                </div>
                <div class="chatlist">
                    {#if chats.length === 0}
                        <div class="chatlist-empty">No chats yet</div>
                    {:else}
                        {#each chats as c}
                            <div class="chatlist-item {c.id === activeChatId ? 'active' : ''}">
                                <button class="chatlist-select" on:click={() => selectChat(c.id)} title={new Date(c.updatedAt).toLocaleString()}>
                                    {c.title}
                                </button>
                                <button class="chatlist-delete" on:click={() => removeChat(c.id)} title="Delete chat" aria-label="Delete chat">
                                    <img class="clear-icon" src={trashIcon} alt="Delete" />
                                </button>
                            </div>
                        {/each}
                    {/if}
                </div>
            </aside>
        </div>
    {/if}

</div>

<!-- tabs mention dropdown moved into InputEditor.svelte -->

<style>
    .model-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
        padding: .2rem;
        margin: 0;
    }

    .chat-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0; /* allow internal sections to size/scroll */
        background: var(--bg-primary);
        padding: 0;
        margin: 0;
    }

    .welcome-input {
        width: 100%;
        background: transparent;
        border: none;
        resize: none;
        color: var(--text-primary);
        font-size: 0.9rem;
        outline: none;
    }

    /* Placeholder for contenteditable */
    .welcome-editor:empty:before {
        content: attr(data-placeholder);
        color: var(--text-secondary);
        pointer-events: none;
    }

    .welcome-editor, .inline-editor {
        min-height: 20px;
        white-space: pre-wrap;
        word-break: break-word;
        text-align: left;
    }

    .welcome-input::placeholder {
        color: var(--text-secondary);
    }

    .welcome-screen {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 0.5rem;
        text-align: center;
    }

    .logo {
        margin-bottom: 2rem;
    }

    .logo-icon {
        font-size: 3rem;
        color: #cec993;
        animation: pulse 2s infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
    }

    .greeting {
        font-size: 1.2rem;
        color: var(--text-primary);
        margin-bottom: 1.5rem;
        font-weight: 300;
    }

    .input-card {
        background: var(--bg-secondary);
        border-radius: 8px;
        padding: 0.5rem;
        margin-bottom: 0.75rem;
        width: 100%;
        max-width: 350px;
        border: 1px solid var(--border-color);
    }


    .mentions-bar {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        flex-wrap: wrap;
        padding: 0.25rem 0.25rem 0.4rem 0.25rem;
    }

    .mention-pill {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 999px;
        padding: 0.15rem 0.4rem;
        max-width: 140px;
    }

    .mention-icon {
        width: 16px;
        height: 16px;
        border-radius: 3px;
        flex-shrink: 0;
    }

    .mention-fallback {
        font-size: 0.75rem;
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 110px;
    }

    .input-controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    /* Modal styles */
    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
    }
    .modal {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 1rem;
        width: 90%;
        max-width: 360px;
        color: var(--text-primary);
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .modal-title { font-weight: 600; margin-bottom: 0.4rem; }
    .modal-text { color: var(--text-secondary); margin-bottom: 0.8rem; }
    .modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
    .modal-btn { padding: 0.35rem 0.7rem; border-radius: 6px; cursor: pointer; border: 1px solid var(--border-color); background: transparent; color: var(--text-primary); }
    .modal-btn.secondary:hover { background: var(--bg-primary); }
    .modal-btn.danger { background: #dc3545; color: #fff; border-color: #dc3545; }
    .modal-btn.danger:hover { background: #c82333; }

    .chatlist {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        margin-bottom: 0.6rem;
        max-height: 240px;
        overflow-y: auto;
    }
    .chatlist-empty { color: var(--text-secondary); font-size: 0.85rem; }
    .chatlist-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.4rem;
        padding: 0.3rem;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: var(--bg-primary);
    }
    .chatlist-item.active { border-color: var(--accent-color); }
    .chatlist-select {
        background: transparent;
        border: none;
        color: var(--text-primary);
        text-align: left;
        flex: 1;
        cursor: pointer;
        padding: 0.3rem;
        border-radius: 4px;
    }
    .chatlist-select:hover { background: var(--bg-secondary); }
    .chatlist-delete {
        background: transparent;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        cursor: pointer;
        padding: 0.25rem;
    }

    /* Sidebar */
    .sidebar-overlay {
        position: fixed;
        inset: 0;
        z-index: 100000;
        pointer-events: none;
    }
    .sidebar-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.45);
        pointer-events: auto;
    }
    .sidebar {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: 320px;
        max-width: 85vw;
        background: var(--bg-secondary);
        border-right: 1px solid var(--border-color);
        box-shadow: 6px 0 18px rgba(0,0,0,0.35);
        transform: translateX(0);
        display: flex;
        flex-direction: column;
        padding: 0.5rem;
        pointer-events: auto;
    }
    .sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.25rem 0.25rem 0.5rem;
        border-bottom: 1px solid var(--border-color);
        margin-bottom: 0.5rem;
    }
    .sidebar-title { font-weight: 600; color: var(--text-primary); }
    .sidebar-close {
        padding: 0;
        background: transparent;
        color: var(--text-primary);
        width: 28px;
        height: 28px;
        border-radius: 6px;
        cursor: pointer;
    }
    .sidebar-actions { display: flex; gap: 0.4rem; padding: 0.4rem 0; }
    .action.primary {
        background: var(--accent-color);
        border: 1px solid var(--accent-color);
        color: #000000;
        padding: 0.35rem 0.6rem;
        border-radius: 6px;
        cursor: pointer;
    }

    .left-controls, .right-controls {
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }

    .control-btn {
        background: transparent;
        border: none;
        color: var(--text-secondary);
        font-size: 1rem;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        transition: all 0.2s;
    }

    .control-btn:hover {
        background: var(--border-color);
        color: var(--text-primary);
    }

    .model-selector {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        color: var(--text-secondary);
        font-size: 0.8rem;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 6px;
        transition: background-color 0.2s;
        position: relative;
        max-width: 140px;
        overflow: visible;
        user-select: none;
        -webkit-user-select: none;
    }

    .model-selector:hover {
        background: var(--border-color);
    }

    .chevron {
        font-size: 0.8rem;
    }

    .model-dropdown {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: auto;
        min-width: 220px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        z-index: 9999;
        max-height: 200px;
        overflow-y: auto;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }

    .input-container .model-dropdown {
        top: auto;
        bottom: calc(100% + 4px);
    }

    .model-option {
        padding: 0.5rem;
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 0.8rem;
        color: var(--text-primary);
    }

    .model-option:hover {
        background: var(--border-color);
    }

    .model-option.active {
        background: var(--accent-color);
    }

    .send-btn {
        background: var(--accent-color);
        border: none;
        width: 32px;
        height: 32px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .send-btn:hover:not(:disabled) {
        background: var(--accent-hover);
        transform: scale(1.05);
        color: white;
    }

    .send-btn:disabled {
        background: var(--border-color);
        color: white;
        cursor: not-allowed;
        opacity: 0.6;
    }

    .send-btn.stop-mode {
        background: #dc3545;
    }

    .send-btn.stop-mode:hover:not(:disabled) {
        background: #c82333;
    }

    .send-icon {
        font-size: 1rem;
        font-weight: bold;
    }

    .quick-actions {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: 100%;
        max-width: 350px;
    }

    .action-row {
        display: flex;
        gap: 0.25rem;
        justify-content: center;
    }

    .action-btn {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 0.4rem 0.5rem;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.2rem;
        font-size: 0.75rem;
        transition: all 0.2s;
        flex: 1;
        max-width: 120px;
    }

    .action-btn:hover {
        background: var(--border-color);
        border-color: var(--accent-color);
    }

    .action-btn.primary {
        background: var(--accent-color);
        border-color: var(--accent-color);
    }

    .action-btn.primary:hover {
        background: var(--accent-hover);
        border-color: var(--accent-hover);
    }

    /* Ensure readable text on primary action in dark theme */
    :global(:root[data-theme="dark"]) .action-btn.primary {
        color: #000000;
    }

    .action-icon {
        font-size: 0.8rem;
    }

    .chat-messages {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .message {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
    }

    .message.user {
        flex-direction: row;
    }

    .message.assistant {
        flex-direction: column;
    }

    .message-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--accent-color);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 0.9rem;
        flex-shrink: 0;
    }

    .message-bubble {
        background: var(--bg-primary);
        padding: 0.2rem 0.5rem;
        border-radius: 12px;
        max-width: 80%;
        word-wrap: break-word;
        text-align: left;
    }

    .user-bubble {
        background: var(--accent-color);
        color: #000000;
    }

    .message-content {
        color: var(--text-primary);
        line-height: 1.5;
        white-space: normal;
        text-align: left;
    }
    .message-content p { margin: 0.35rem 0; }

    .message-content ul { margin: 0.35rem 0 0.35rem 1rem; padding-left: 1rem; }

    .message-content ol { margin: 0.35rem 0 0.35rem 1rem; padding-left: 1rem; }

    .message-content li { margin: 0.2rem 0; }

    .message-content h1,

    .message-content h2,

    .message-content h3,

    .message-content h4,

    .message-content h5,

    .message-content h6 { margin: 0.5rem 0 0.25rem 0; font-weight: 600; line-height: 1.25; }

    .message-content h1 { font-size: 1.25rem; }

    .message-content h2 { font-size: 1.15rem; }

    .message-content h3 { font-size: 1.05rem; }

    .message-content code { background: var(--bg-secondary); border: 1px solid var(--border-color); padding: 0.05rem 0.3rem; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 0.85em; }

    .message-content a { color: var(--accent-color); text-decoration: underline; }

    .typing-indicator {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--text-secondary);
        font-style: italic;
    }

    /* mention and tabs dropdown styles are provided by InputEditor.svelte */

    .input-area {
        background: var(--bg-primary);
        padding: 0;
        position: sticky;
        bottom: 0;
    }

    .input-container {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        background: var(--bg-secondary);
        border-radius: 6px;
        padding: 0.25rem;
    }

    .message-input {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--text-primary);
        font-size: 0.9rem;
        outline: none;
        resize: none;
        min-height: 20px;
        /* max-height: 80px; */
    }

    .message-input::placeholder {
        color: var(--text-secondary);
    }

    .disclaimer {
        text-align: center;
        color: var(--text-secondary);
        font-size: 0.7rem;
        margin-top: 0.25rem;
        line-height: 1.3;
    }

    .header-left {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .logo-icon-small {
        font-size: 1.2rem;
        color: var(--accent-color);
    }

    .header-title {
        font-size: 0.9rem;
        color: var(--text-primary);
        font-weight: 500;
    }

    .clear-btn {
        background: transparent;
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        padding: 0.4rem;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .clear-btn:hover {
        background: var(--bg-primary);
        color: var(--text-primary);
        border-color: var(--accent-color);
    }

    /* Dark theme: make clear button white */
    :global(:root[data-theme="dark"]) .clear-btn {
        background: #ffffff;
        border-color: #ffffff;
        color: #000000;
    }

    :global(:root[data-theme="dark"]) .clear-btn:hover {
        background: #f0f0f0;
        border-color: var(--accent-color);
        color: #000000;
    }

    .clear-icon {
        width: 18px;
        height: 18px;
        display: block;
    }
    </style>
