<script lang="ts">
    import { onMount } from 'svelte';
    import { marked } from 'marked';
    import DOMPurify from 'dompurify';

    let prompt = '';
    let log: string[] = [];
    let isTyping = false;
    let isTaskRunning = false;
    let models: string[] = [];
    let activeModel = '';
    let showModelDropdown = false;
    let sendOnEnter: boolean = true;
    let textareaElement: HTMLTextAreaElement | null = null;

    onMount(async () => {
        const settings = await chrome.storage.local.get(['models', 'activeModel', 'chatLog', 'chatPrompt', 'sendOnEnter']);
        models = settings.models || ['google/gemini-2.5-pro', 'openai/gpt-5-mini'];
        activeModel = settings.activeModel || models[0];
        log = Array.isArray(settings.chatLog) ? settings.chatLog : [];
        prompt = typeof settings.chatPrompt === 'string' ? settings.chatPrompt : '';
        sendOnEnter = typeof settings.sendOnEnter === 'boolean' ? settings.sendOnEnter : true;
    });

    function saveChatState() {
        try {
            chrome.storage.local.set({ chatLog: log, chatPrompt: prompt });
        } catch (e) {}
    }

    function startTask() {
        if (!prompt.trim()) return;

        isTyping = true;
        isTaskRunning = true;
        log = [...log, `[User]: ${prompt}`];
        saveChatState();

        chrome.runtime.sendMessage({ type: 'START_TASK', prompt });
        prompt = '';
        saveChatState();
    }

    function stopTask() {
        isTaskRunning = false;
        isTyping = false;
        chrome.runtime.sendMessage({ type: 'STOP_TASK' });
    }

    $: (async () => {
        try {
            await chrome.storage.local.set({ chatPrompt: prompt });
        } catch (e) {}
    })();

    function handleKeyPress(event: KeyboardEvent) {
        const isMeta = event.ctrlKey || event.metaKey;
        if (sendOnEnter) {
            if (event.key === 'Enter' && !isMeta) {
                event.preventDefault();
                startTask();
            } else if (event.key === 'Enter' && isMeta) {
                event.preventDefault();
                prompt = prompt + '\n';
            }
        } else {
            if (event.key === 'Enter' && isMeta) {
                event.preventDefault();
                startTask();
            }
        }
    }

    function selectModel(model: string) {
        activeModel = model;
        showModelDropdown = false;
        chrome.storage.local.set({ activeModel });
    }

    function toggleModelDropdown() {
        showModelDropdown = !showModelDropdown;
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'UPDATE_LOG') {
            log = [...log, message.data];
            isTyping = false;
        } else if (message.type === 'TASK_COMPLETE') {
            isTaskRunning = false;
            isTyping = false;
        }
        return true;
    });

    marked.setOptions({ gfm: true, breaks: true });

    DOMPurify.addHook('afterSanitizeAttributes', (node: any) => {
        if (node && node.tagName === 'A') {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
        }
    });

    function renderMarkdownSafe(input: string): string {
        const rawHtml = marked.parse(input) as string;
        return DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
    }

    
    $: if (textareaElement && prompt !== undefined) {
        autoResize();
    }

    function autoResize() {
        if (!textareaElement) return;
        
        textareaElement.style.height = 'auto';
        const scrollHeight = textareaElement.scrollHeight;
        const maxHeight = 300;
        
        if (scrollHeight <= maxHeight) {
            textareaElement.style.height = scrollHeight + 'px';
            textareaElement.style.overflowY = 'hidden';
        } else {
            textareaElement.style.height = maxHeight + 'px';
            textareaElement.style.overflowY = 'auto';
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
            <div class="input-card">
                <textarea
                    bind:value={prompt}
                    bind:this={textareaElement}
                    on:paste={() => setTimeout(autoResize, 0)}
                    placeholder="Чем могу помочь сегодня?"
                    on:keydown={handleKeyPress}
                    class="welcome-input"
                    rows="3"
                ></textarea>
                <div class="input-controls">
                    <div class="left-controls">
                        <div class="model-selector" on:click={toggleModelDropdown}>
                            <p class="model-name">{activeModel}</p>
                                <span class="chevron">▼</span>
                                {#if showModelDropdown}
                                    <div class="model-dropdown">
                                        {#each models as model}
                                            <div class="model-option {activeModel === model ? 'active' : ''}"
                                                on:click={() => selectModel(model)}>
                                                {model}
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
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
        <div class="chat-messages">
            {#each log as entry}
                <div class="message {entry.startsWith('[User]') ? 'user' : 'assistant'}">
                    {#if entry.startsWith('[User]')}
                        <div class="message-avatar">U</div>
                        <div class="message-bubble user-bubble">
                            {entry.replace('[User]: ', '')}
                        </div>
                    {:else}
                        <div class="message-content">
                            {@html renderMarkdownSafe(entry)}
                        </div>
                    {/if}
                </div>
            {/each}

            {#if isTyping}
                <div class="message assistant">
                    <div class="typing-indicator">
                        <div class="logo-icon">✦</div>
                        <span>Агент думает...</span>
                    </div>
                </div>
            {/if}
        </div>
    {/if}

    {#if log.length !== 0}
        <div class="input-area">
            <div class="input-container">
                <textarea
                    bind:value={prompt}
                    bind:this={textareaElement}
                    on:paste={() => setTimeout(autoResize, 0)}
                    on:keydown={handleKeyPress}
                    class="welcome-input"
                    rows="1"
                ></textarea>
                <div class="input-controls">
                    <div class="model-selector" on:click={toggleModelDropdown}>
                        <p class="model-name">{activeModel}</p>
                        <span class="chevron">▼</span>
                        {#if showModelDropdown}
                            <div class="model-dropdown">
                                {#each models as model}
                                    <div class="model-option {activeModel === model ? 'active' : ''}"
                                        on:click={() => selectModel(model)}>
                                        {model}
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                    <button class="send-btn {isTaskRunning ? 'stop-mode' : ''}" on:click={isTaskRunning ? stopTask : startTask} disabled={!isTaskRunning && !prompt.trim()}>
                        <span class="send-icon">{isTaskRunning ? '■' : '↑'}</span>
                    </button>
                </div>
            </div>
            <div class="disclaimer">
                Агент может допускать ошибки. Пожалуйста, проверяйте результаты.
            </div>
        </div>
    {/if}

</div>

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

    .input-controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
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
    </style>
