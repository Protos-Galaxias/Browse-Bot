<!--
Copyright (c) 2025 PROTOS GALAXIAS LIMITED
SPDX-License-Identifier: BSL-1.1
-->

<script lang="ts">
    import { onMount, createEventDispatcher } from 'svelte';
    import MessageList from './components/MessageList.svelte';
    import InputEditor from './components/InputEditor.svelte';
    import ModelSelector from './components/ModelSelector.svelte';
    import { _, format } from 'svelte-i18n';
    import { get } from 'svelte/store';
    import { getHost } from './lib/url';
    import { extStorage } from '../services/ExtStorage';
    import { ChatStorage, type ChatMeta } from '../services/ChatStorage';

    const dispatch = createEventDispatcher();

    export let visible = true;

    let prompt = '';
    let log: Array<string | { type: 'i18n'; key: string; params?: Record<string, unknown>; prefix?: 'error'|'result'|'system'|'agent'|'user' } | { type: 'ui'; kind: 'click'; title?: string; text: string } | { type: 'error'; message: string; details?: Record<string, unknown> }> = [];
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
    let openMenuId: string | null = null;
    let editingChatId: string | null = null;
    let editingTitle = '';
    const DEFAULT_MODELS: Record<'openrouter' | 'openai' | 'ollama' | 'xai' | 'lmstudio', string[]> = {
        openrouter: ['openai/gpt-4.1-mini'],
        openai: ['gpt-4.1-mini'],
        ollama: ['phi3'],
        xai: ['grok-3'],
        lmstudio: ['qwen3-4b']
    };

    let provider: 'openrouter' | 'openai' | 'ollama' | 'xai' | 'lmstudio' = 'openrouter';

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
            'activeModel_xai',
            'models_lmstudio',
            'activeModel_lmstudio'
        ]);
        provider = (store.provider === 'openai' || store.provider === 'openrouter' || store.provider === 'ollama' || store.provider === 'xai' || store.provider === 'lmstudio') ? store.provider : 'openrouter';
        const modelsOpenrouter: string[] = Array.isArray(store.models_openrouter) && store.models_openrouter.length > 0 ? store.models_openrouter : DEFAULT_MODELS.openrouter;
        const modelsOpenai: string[] = Array.isArray(store.models_openai) && store.models_openai.length > 0 ? store.models_openai : DEFAULT_MODELS.openai;
        const modelsOllama: string[] = Array.isArray(store.models_ollama) && store.models_ollama.length > 0 ? store.models_ollama : DEFAULT_MODELS.ollama;
        const modelsXai: string[] = Array.isArray(store.models_xai) && store.models_xai.length > 0 ? store.models_xai : DEFAULT_MODELS.xai;
        const modelsLmstudio: string[] = Array.isArray(store.models_lmstudio) && store.models_lmstudio.length > 0 ? store.models_lmstudio : DEFAULT_MODELS.lmstudio;
        const activeModelOpenrouter: string = typeof store.activeModel_openrouter === 'string' && store.activeModel_openrouter ? store.activeModel_openrouter : modelsOpenrouter[0];
        const activeModelOpenai: string = typeof store.activeModel_openai === 'string' && store.activeModel_openai ? store.activeModel_openai : modelsOpenai[0];
        const activeModelOllama: string = typeof store.activeModel_ollama === 'string' && store.activeModel_ollama ? store.activeModel_ollama : modelsOllama[0];
        const activeModelXai: string = typeof store.activeModel_xai === 'string' && store.activeModel_xai ? store.activeModel_xai : modelsXai[0];
        const activeModelLmstudio: string = typeof store.activeModel_lmstudio === 'string' && store.activeModel_lmstudio ? store.activeModel_lmstudio : modelsLmstudio[0];
        if (provider === 'openai') {
            models = modelsOpenai;
            activeModel = activeModelOpenai;
        } else if (provider === 'ollama') {
            models = modelsOllama;
            activeModel = activeModelOllama;
        } else if (provider === 'xai') {
            models = modelsXai;
            activeModel = activeModelXai;
        } else if (provider === 'lmstudio') {
            models = modelsLmstudio;
            activeModel = activeModelLmstudio;
        } else {
            models = modelsOpenrouter;
            activeModel = activeModelOpenrouter;
        }
    }

    async function loadChats() {
        try {
            const list = await ChatStorage.getChatList();
            console.log('[UI] loadChats - raw list:', list);
            chats = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
            console.log('[UI] loadChats - sorted chats:', chats);
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
        if (activeChatId === id) { showChatList = false; dispatch('chatSelected'); return; }
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
        dispatch('chatSelected');
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

    function toggleMenu(chatId: string) {
        openMenuId = openMenuId === chatId ? null : chatId;
    }

    function closeMenu() {
        openMenuId = null;
    }

    function startEditing(chat: ChatMeta) {
        editingChatId = chat.id;
        editingTitle = chat.title;
        openMenuId = null;
    }

    function cancelEditing() {
        editingChatId = null;
        editingTitle = '';
    }

    async function saveRename() {
        if (!editingChatId || !editingTitle.trim()) {
            cancelEditing();
            return;
        }
        try {
            await ChatStorage.renameChat(editingChatId, editingTitle.trim());
            await loadChats();
        } catch {
            // ignored
        }
        cancelEditing();
    }

    function handleRenameKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveRename();
        } else if (e.key === 'Escape') {
            cancelEditing();
        }
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
                        const meta = await ChatStorage.createChat(undefined, log);
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

    async function generateChatTitle(userMessage: string, siteUrl?: string) {
        try {
            if (!activeChatId) return;

            const chatIdToUpdate = activeChatId;
            console.log('[UI] Requesting chat title generation for:', chatIdToUpdate, userMessage);

            // Use Promise-based approach instead of callback
            const response = await chrome.runtime.sendMessage({
                type: 'GENERATE_CHAT_TITLE',
                userMessage,
                siteUrl,
                chatId: chatIdToUpdate
            });

            console.log('[UI] Received response:', response);

            if (response?.title) {
                try {
                    console.log('[UI] Renaming chat', chatIdToUpdate, 'to:', response.title);
                    await ChatStorage.renameChat(chatIdToUpdate, response.title);
                    await loadChats();
                    console.log('[UI] Chat title updated successfully');
                } catch (e) {
                    console.warn('[UI] Failed to update chat title:', e);
                }
            } else {
                console.warn('[UI] No title in response:', response);
            }
        } catch (error) {
            console.warn('[UI] Failed to generate chat title:', error);
            // Silently fail - not critical
        }
    }

    function startTask() {
        if (!prompt.trim()) return;

        isTyping = true;
        isTaskRunning = true;
        const userPrompt = prompt;

        // Check if this is the first message BEFORE adding to log
        const isFirstMessage = log.length === 0;
        console.log('[UI] startTask - log.length:', log.length, 'isFirstMessage:', isFirstMessage, 'activeChatId:', activeChatId);

        log = [...log, `[User]: ${userPrompt}`];
        saveChatState();

        // Generate chat title for first message
        if (isFirstMessage && activeChatId) {
            const siteUrl = activeTabMeta?.url;
            console.log('[UI] First message detected, generating title');
            generateChatTitle(userPrompt, siteUrl);
        } else {
            console.log('[UI] NOT first message or no activeChatId - skipping title generation');
        }

        const tabs = displayMentions.map(t => ({ id: t.id, title: t.title, url: t.url }));
        // Pass chat history for context continuity
        const chatHistory = log.slice(0, -1); // exclude current message we just added
        try {
            chrome.runtime.sendMessage({ type: 'START_TASK', prompt: userPrompt, tabs, chatHistory }, (resp) => {
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
                    // Pass through ErrorLog objects for expandable error display
                    if (payload && typeof payload === 'object' && payload.type === 'error' && typeof payload.message === 'string') {
                        return payload; // pass through for error rendering with details
                    }
                    if (payload && typeof payload === 'object' && payload.type === 'i18n' && typeof payload.key === 'string') {
                        const fmt = get(format) as (key: string, values?: Record<string, unknown>) => string;
                        const prefix = payload.prefix === 'error' ? '[Error]' : payload.prefix === 'result' ? '[Результат]' : payload.prefix === 'system' ? '[Система]' : payload.prefix === 'agent' ? '[Агент]' : '';
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
                const isError = typeof computed === 'object' && (computed as any).type === 'error';
                const isFinalOrError = isError || ((typeof computed === 'string') && (computed.startsWith('[Результат]') || computed.startsWith('[Ошибка]') || computed.startsWith('[Анализ]')));
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
        } else if (provider === 'lmstudio') {
            payload['activeModel_lmstudio'] = activeModel;
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
                    Boolean(changes.activeModel_xai) ||
                    Boolean(changes.models_lmstudio) ||
                    Boolean(changes.activeModel_lmstudio);
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

<div class="chat-container" style="display: {visible ? 'flex' : 'none'};">
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
                        <ModelSelector {models} {activeModel} bind:open={showModelDropdown} openUpward={true} on:change={onModelChange} />
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

</div>

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
                            {#if editingChatId === c.id}
                                <input
                                    class="chatlist-rename-input"
                                    type="text"
                                    bind:value={editingTitle}
                                    on:keydown={handleRenameKeydown}
                                    on:blur={saveRename}
                                    autofocus
                                />
                            {:else}
                                <button class="chatlist-select" on:click={() => selectChat(c.id)} title={new Date(c.updatedAt).toLocaleString()}>
                                    {c.title}
                                </button>
                            {/if}
                            <div class="chatlist-menu-wrapper">
                                <button class="chatlist-menu-btn" on:click|stopPropagation={() => toggleMenu(c.id)} title="Options" aria-label="Chat options">
                                    ⋮
                                </button>
                                {#if openMenuId === c.id}
                                    <div class="chatlist-dropdown" on:mouseleave={closeMenu}>
                                        <button class="dropdown-item" on:click|stopPropagation={() => startEditing(c)}>
                                            ✏️ Rename
                                        </button>
                                        <button class="dropdown-item danger" on:click|stopPropagation={() => { removeChat(c.id); closeMenu(); }}>
                                            🗑️ Delete
                                        </button>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>
        </aside>
    </div>
{/if}

<style>
    .chat-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0; /* allow internal sections to size/scroll */
        background: var(--bg-primary);
        padding: 0;
        margin: 0;
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

    .chatlist-rename-input {
        flex: 1;
        background: var(--bg-secondary);
        border: 1px solid var(--accent-color);
        border-radius: 4px;
        color: var(--text-primary);
        padding: 0.3rem;
        font-size: inherit;
        outline: none;
    }

    .chatlist-menu-wrapper {
        position: relative;
    }

    .chatlist-menu-btn {
        background: transparent;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        color: var(--text-secondary);
        font-size: 1rem;
        line-height: 1;
    }
    .chatlist-menu-btn:hover {
        background: var(--bg-secondary);
        color: var(--text-primary);
    }

    .chatlist-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 4px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10;
        min-width: 120px;
        overflow: hidden;
    }

    .dropdown-item {
        display: block;
        width: 100%;
        background: transparent;
        border: none;
        color: var(--text-primary);
        padding: 0.5rem 0.75rem;
        text-align: left;
        cursor: pointer;
        font-size: 0.85rem;
    }
    .dropdown-item:hover {
        background: var(--bg-primary);
    }
    .dropdown-item.danger:hover {
        background: rgba(220, 53, 69, 0.15);
        color: #dc3545;
    }

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

    :global(:root[data-theme="dark"]) .action-btn.primary {
        color: #000000;
    }

    .action-icon {
        font-size: 0.8rem;
    }

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

    .disclaimer {
        text-align: center;
        color: var(--text-secondary);
        font-size: 0.7rem;
        margin-top: 0.25rem;
        line-height: 1.3;
    }

    :global(:root[data-theme="dark"]) .clear-icon {
        filter: invert(1) brightness(1.2);
    }

    .clear-icon {
        width: 18px;
        height: 18px;
        display: block;
    }
    </style>
