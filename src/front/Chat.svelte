<script lang="ts">
    import { onMount } from 'svelte';
    import MessageList from './components/MessageList.svelte';
    import InputEditor from './components/InputEditor.svelte';
    import ModelSelector from './components/ModelSelector.svelte';
    import { getHost } from './lib/url';

    let prompt = '';
    let log: string[] = [];
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
    let domainPromptCollapsed = true;
    let activeDomain = '';
    let domainPromptText = '';
    let hideAgentMessages: boolean = false;
    let showClearConfirm = false;

    async function fetchActiveTab(): Promise<{ id: number; title: string; url?: string; favIconUrl?: string } | null> {
        try {
            const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (!activeTab?.id) return null;
            return { id: activeTab.id, title: activeTab.title || '', url: activeTab.url, favIconUrl: (activeTab as any).favIconUrl };
        } catch {
            try {
                return await new Promise((resolve) => {
                    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                        const t = tabs && tabs[0];
                        resolve(t?.id ? { id: t.id as number, title: t.title || '', url: t.url, favIconUrl: (t as any).favIconUrl } : null);
                    });
                });
            } catch { return null; }
        }
    }

    function setActiveTabMeta(tab: { id: number; title: string; url?: string; favIconUrl?: string } | null) { activeTabMeta = tab; }

    async function ensureActiveMention() {
        const tab = await fetchActiveTab();
        setActiveTabMeta(tab);
    }

    onMount(async () => {
        const settings = await chrome.storage.local.get(['models', 'activeModel', 'chatLog', 'chatPrompt', 'sendOnEnter', 'hideAgentMessages']);
        models = settings.models || ['openai/gpt-4.1-mini'];
        activeModel = settings.activeModel || models[0];
        log = Array.isArray(settings.chatLog) ? settings.chatLog : [];
        prompt = typeof settings.chatPrompt === 'string' ? settings.chatPrompt : '';
        sendOnEnter = typeof settings.sendOnEnter === 'boolean' ? settings.sendOnEnter : true;
        hideAgentMessages = typeof settings.hideAgentMessages === 'boolean' ? settings.hideAgentMessages : false;

        await ensureActiveMention();

        try {
            const store = await chrome.storage.local.get(['domainPrompts']);
            domainPrompts = (store?.domainPrompts && typeof store.domainPrompts === 'object') ? store.domainPrompts : {};
        } catch {}

        try {
            chrome.tabs.onActivated.addListener(async (activeInfo) => {
                try { const tab = await chrome.tabs.get(activeInfo.tabId); setActiveTabMeta({ id: tab.id as number, title: tab.title || '', url: tab.url, favIconUrl: (tab as any).favIconUrl }); } catch {}
            });
            chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
                try { if (tab.active) setActiveTabMeta({ id: tab.id as number, title: tab.title || '', url: tab.url, favIconUrl: (tab as any).favIconUrl }); } catch {}
            });
        } catch {}
    });

    $: displayMentions = activeTabMeta && !mentions.some(m => m.id === activeTabMeta!.id)
        ? [activeTabMeta, ...mentions]
        : [...mentions];

    function saveChatState() {
        try {
            chrome.storage.local.set({ chatLog: log, chatPrompt: prompt });
        } catch {
        // Error handled silently
        }
    }

    function clearHistory() { showClearConfirm = true; }
    function confirmClearHistory() {
        log = [];
        saveChatState();
        mentions = [];
        ensureActiveMention();
        showClearConfirm = false;
    }
    function cancelClearHistory() { showClearConfirm = false; }

    function startTask() {
        if (!prompt.trim()) return;

        isTyping = true;
        isTaskRunning = true;
        log = [...log, `[User]: ${prompt}`];
        saveChatState();

        const tabs = displayMentions.map(t => ({ id: t.id, title: t.title, url: t.url }));
        chrome.runtime.sendMessage({ type: 'START_TASK', prompt, tabs });
        prompt = '';
        mentions = [];
        // После отправки снова показываем активную вкладку
        ensureActiveMention();
        saveChatState();
    }

    function stopTask() {
        isTaskRunning = false;
        isTyping = false;
        chrome.runtime.sendMessage({ type: 'STOP_TASK' });
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'UPDATE_LOG') {
            const text = String(message.data || '');
            if (hideAgentMessages) {
                // В режиме скрытия показываем только итог/ошибку/анализ
                const isFinalOrError = text.startsWith('[Результат]') || text.startsWith('[Ошибка]') || text.startsWith('[Анализ]');
                if (!isFinalOrError) return true;
            }
            log = [...log, text];
            isTyping = false;
        } else if (message.type === 'TASK_COMPLETE') {
            isTaskRunning = false;
            isTyping = false;
        }
        return true;
    });

    $: (async () => {
        try {
            await chrome.storage.local.set({ chatPrompt: prompt });
        } catch {
        // Error handled silently
        }
    })();

    function onModelChange(e: CustomEvent<{ model: string }>) {
        activeModel = e.detail.model;
        showModelDropdown = false;
        chrome.storage.local.set({ activeModel });
    }

    $: activeDomain = (activeTabMeta?.url ? (() => { try { return new URL(activeTabMeta!.url!).hostname.replace(/^www\./,''); } catch { return ''; } })() : '');
    $: domainPromptText = (activeDomain && domainPrompts[activeDomain]) ? domainPrompts[activeDomain] : '';

    async function saveDomainPrompt() {
        if (!activeDomain) return;
        domainPrompts = { ...domainPrompts, [activeDomain]: domainPromptText };
        try { await chrome.storage.local.set({ domainPrompts }); } catch {}
    }

    function buildMentionTitle(m: { title?: string; url?: string }) {
        const base = m.title || m.url || '';
        try {
            const host = getHost(m.url);
            const prompt = (host && domainPrompts[host]) ? String(domainPrompts[host]).trim() : '';
            return prompt ? `${base}\n\n${prompt}` : base;
        } catch {
            return base;
        }
    }
    
</script>

<div class="chat-container">
    {#if log.length === 0}
        <div class="welcome-screen">
            <div class="logo">
                <div class="logo-icon">✦</div>
            </div>
            <h1 class="greeting">Добрый день, пользователь</h1>
            <div class="domain-prompt">
                <button class="domain-toggle" on:click={() => domainPromptCollapsed = !domainPromptCollapsed}>
                    {domainPromptCollapsed ? '▼' : '▲'} Промт для домена {activeDomain || '(нет активного домена)'}
                </button>
                {#if !domainPromptCollapsed}
                    <textarea class="domain-textarea" bind:value={domainPromptText} placeholder="Промт для текущего домена..." on:input={saveDomainPrompt} />
                {/if}
            </div>
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
                <InputEditor bind:value={prompt} bind:mentions={mentions} placeholder="Чем могу помочь сегодня?" {sendOnEnter} on:submit={startTask} />
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
                        <span>Возможности</span>
                    </button>
                </div>
            </div>
        </div>
    {:else}
        <MessageList {log} {isTyping} />
    {/if}

    {#if log.length !== 0}
        <div class="input-area">
            <div class="domain-prompt">
                <button class="domain-toggle" on:click={() => domainPromptCollapsed = !domainPromptCollapsed}>
                    {domainPromptCollapsed ? '▼' : '▲'} Промт для домена {activeDomain || '(нет активного домена)'}
                </button>
                {#if !domainPromptCollapsed}
                    <textarea class="domain-textarea" bind:value={domainPromptText} placeholder="Промт для текущего домена..." on:input={saveDomainPrompt} />
                {/if}
            </div>
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
                        <button class="clear-btn" on:click={clearHistory} title="Очистить историю" aria-label="Очистить историю чата">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        </button>
                        <button class="send-btn {isTaskRunning ? 'stop-mode' : ''}" on:click={isTaskRunning ? stopTask : startTask} disabled={!isTaskRunning && !prompt.trim()}>
                            <span class="send-icon">{isTaskRunning ? '■' : '↑'}</span>
                        </button>
                    </div>
                </div>
            </div>
            <div class="disclaimer">
                Агент может допускать ошибки. Пожалуйста, проверяйте результаты.
            </div>
        </div>
    {/if}

    {#if showClearConfirm}
        <div class="modal-backdrop" on:click={cancelClearHistory}>
            <div class="modal" on:click|stopPropagation>
                <div class="modal-title">Очистить историю чата?</div>
                <div class="modal-text">Это действие удалит текущий список сообщений. Отменить нельзя.</div>
                <div class="modal-actions">
                    <button class="modal-btn secondary" on:click={cancelClearHistory}>Отмена</button>
                    <button class="modal-btn danger" on:click={confirmClearHistory}>Очистить</button>
                </div>
            </div>
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
        height: 100vh;
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
        color: var(--accent-color);
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

    .domain-prompt { margin: 0 0 0.5rem 0; text-align: left; }
    .domain-toggle { background: transparent; border: 1px solid var(--border-color); color: var(--text-secondary); padding: 0.25rem 0.4rem; border-radius: 6px; cursor: pointer; }
    .domain-toggle:hover { background: var(--bg-secondary); color: var(--text-primary); }
    .domain-textarea { width: 100%; min-height: 64px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.4rem; resize: vertical; margin-top: 0.4rem; }

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
        color: white;
    }

    .send-btn {
        background: var(--accent-color);
        border: none;
        color: white;
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
    }

    .send-btn:disabled {
        background: var(--border-color);
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
        color: white;
    }

    .action-btn.primary:hover {
        background: var(--accent-hover);
        border-color: var(--accent-hover);
    }

    .action-icon {
        font-size: 0.8rem;
    }

    .chat-messages {
        flex: 1;
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
        color: white;
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

    .chat-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-color);
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

    .clear-btn svg {
        width: 16px;
        height: 16px;
    }
    </style>
