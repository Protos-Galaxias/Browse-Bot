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
    let textareaElement: HTMLDivElement | null = null;
    let showTabsDropdown = false;
    let tabsDropdownPosition = { top: 0, left: 0 };
    let openTabs: Array<{ id: number; title: string; url?: string; favIconUrl?: string }> = [];
    let activeEditorElement: HTMLElement | null = null;
    let lastCaretRange: Range | null = null;
    const mentionedTabIds: Set<number> = new Set();

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

        chrome.runtime.sendMessage({ type: 'START_TASK', prompt, mentionedTabIds });
        prompt = '';
        saveChatState();
        if (textareaElement) {
            textareaElement.innerText = '';
            autoResize();
            mentionedTabIds.clear();
        }
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
        if (event.key === '@') {
            activeEditorElement = event.currentTarget as HTMLElement;
            queueMicrotask(async () => {
                await ensureOpenTabs();
                positionDropdownAtCaret();
                showTabsDropdown = true;
            });
        } else if (event.key === 'Escape') {
            showTabsDropdown = false;
        }
        if (sendOnEnter) {
            if (event.key === 'Enter' && !isMeta) {
                event.preventDefault();
                startTask();
            } else if (event.key === 'Enter' && isMeta) {
                event.preventDefault();
                prompt = prompt + '\n';
                if (textareaElement) {
                    textareaElement.innerText = prompt;
                    placeCaretAtEnd(textareaElement);
                    autoResize();
                }
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

    function handleInput() {
        if (!textareaElement) return;
        prompt = (textareaElement.innerText || '').replace(/\r/g, '');
        autoResize();
    }

    function handlePaste(e: ClipboardEvent) {
        if (!textareaElement) return;
        e.preventDefault();
        const text = e.clipboardData?.getData('text/plain') || '';
        document.execCommand('insertText', false, text);
        handleInput();
        setTimeout(autoResize, 0);
    }

    async function ensureOpenTabs() {
        try {
            const tabs = await chrome.tabs.query({});
            console.log('tabs', tabs);
            openTabs = tabs.map(t => ({ id: t.id as number, title: t.title || '', url: t.url, favIconUrl: (t as any).favIconUrl }));
        } catch (e) {
            try {
                chrome.tabs.query({}, (tabs) => {
                    openTabs = tabs.map(t => ({ id: t.id as number, title: t.title || '', url: t.url, favIconUrl: (t as any).favIconUrl }));
                });
            } catch (_) {}
        }
    }

    function positionDropdownAtCaret() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0).cloneRange();
        lastCaretRange = range.cloneRange();
        range.collapse(true);
        let rect: DOMRect | null = null;
        if (range.getClientRects().length > 0) {
            rect = range.getClientRects()[0] as DOMRect;
        } else {
            const dummy = document.createElement('span');
            dummy.textContent = '\u200C';
            range.insertNode(dummy);
            rect = dummy.getBoundingClientRect();
            dummy.parentNode?.removeChild(dummy);
        }
        if (rect) {
            tabsDropdownPosition = { top: rect.bottom + 4, left: rect.left };
        }
    }

    function insertTabMention(tab: { id: number; title: string }) {
        mentionedTabIds.add(tab.id);
        console.log(tab.id);
        const selection = window.getSelection();
        if (activeEditorElement instanceof HTMLElement) {
            activeEditorElement.focus();
        }
        if (selection && lastCaretRange) {
            selection.removeAllRanges();
            selection.addRange(lastCaretRange);
        }
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);

        try {
            const startContainer = range.startContainer as Text;
            if (startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
                const textContent = startContainer.textContent || '';
                if (textContent.charAt(range.startOffset - 1) === '@') {
                    range.setStart(startContainer, range.startOffset - 1);
                }
            }
        } catch (_) {}

        const chip = document.createElement('span');
        chip.className = 'mention-chip';
        chip.setAttribute('contenteditable', 'false');
        chip.setAttribute('data-tab-id', String(tab.id));
        const label = document.createElement('span');
        label.className = 'chip-label';
        label.textContent = `@tab:${tab.title}`;
        if ((tab as any).favIconUrl) {
            const icon = document.createElement('img');
            icon.className = 'chip-favicon';
            icon.src = (tab as any).favIconUrl;
            icon.alt = '';
            chip.appendChild(icon);
        }
        const close = document.createElement('span');
        close.className = 'chip-close';
        close.setAttribute('role', 'button');
        close.tabIndex = 0;
        close.textContent = '×';
        const removeChip = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            const chipEl = (e.currentTarget as HTMLElement).closest('.mention-chip') as HTMLElement | null;
            if (!chipEl) return;
            const parent = chipEl.parentNode;
            const tabIdStr = chipEl.getAttribute('data-tab-id') || '';
            const next = chipEl.nextSibling;
            if (next && next.nodeType === Node.TEXT_NODE) {
                const t = next as Text;
                if (t.data.startsWith(' ')) {
                    if (t.data.length > 1) {
                        t.data = t.data.slice(1);
                    } else {
                        parent?.removeChild(next);
                    }
                }
            }
            parent?.removeChild(chipEl);
            if (activeEditorElement instanceof HTMLElement) {
                activeEditorElement.focus();
            }
            if (parent) {
                const newRange = document.createRange();
                if (next && parent.contains(next)) {
                    newRange.setStart(next, 0);
                } else if (parent.lastChild) {
                    newRange.setStartAfter(parent.lastChild as Node);
                } else {
                    newRange.selectNode(parent as Node);
                    newRange.collapse(false);
                }
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(newRange);
            }
            if (tabIdStr) {
                const remaining = textareaElement?.querySelectorAll(`.mention-chip[data-tab-id="${tabIdStr}"]`).length || 0;
                if (remaining === 0) {
                    mentionedTabIds.delete(Number(tabIdStr));
                }
            }
            handleInput();
        };
        close.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
        close.addEventListener('click', removeChip);
        close.addEventListener('keydown', (e) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') removeChip(e); });
        chip.append(label, close);
        range.deleteContents();
        range.insertNode(chip);

        const space = document.createTextNode(' ');
        chip.after(space);
        const newRange = document.createRange();
        newRange.setStartAfter(space);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        handleInput();
        autoResize();
    }

    function onClickOutside(event: MouseEvent) {
        const target = event.target as Node;
        const dropdownEl = document.getElementById('tabs-mention-dropdown');
        if (dropdownEl && !dropdownEl.contains(target) && activeEditorElement && !activeEditorElement.contains(target)) {
            showTabsDropdown = false;
        }
    }

    onMount(() => {
        document.addEventListener('click', onClickOutside, true);
        return () => document.removeEventListener('click', onClickOutside, true);
    });

    function placeCaretAtEnd(el: HTMLElement) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
    }

    function onKeyActivate(event: KeyboardEvent, callback: () => void) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            callback();
        }
    }

    $: if (textareaElement && document.activeElement !== textareaElement) {
        if ((textareaElement.innerText || '') !== (prompt || '')) {
            textareaElement.innerText = prompt || '';
            autoResize();
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
                <div
                    contenteditable="true"
                    role="textbox"
                    aria-multiline="true"
                    tabindex="0"
                    bind:this={textareaElement}
                    on:input={handleInput}
                    on:paste={handlePaste}
                    data-placeholder="Чем могу помочь сегодня?"
                    on:keydown={handleKeyPress}
                    class="welcome-input welcome-editor"
                ></div>
                <div class="input-controls">
                    <div class="left-controls">
                        <div class="model-selector" role="button" tabindex="0" on:click={toggleModelDropdown} on:keydown={(e) => onKeyActivate(e, toggleModelDropdown)}>
                            <p class="model-name">{activeModel}</p>
                                <span class="chevron">▼</span>
                                {#if showModelDropdown}
                                    <div class="model-dropdown">
                                        {#each models as model}
                                            <div class="model-option {activeModel === model ? 'active' : ''}" role="button" tabindex="0"
                                                on:click={() => selectModel(model)}
                                                on:keydown={(e) => onKeyActivate(e, () => selectModel(model))}>
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
                <div
                    contenteditable="true"
                    role="textbox"
                    aria-multiline="true"
                    tabindex="0"
                    bind:this={textareaElement}
                    on:input={handleInput}
                    on:paste={handlePaste}
                    on:keydown={handleKeyPress}
                    class="welcome-input inline-editor"
                ></div>
                <div class="input-controls">
                    <div class="model-selector" role="button" tabindex="0" on:click={toggleModelDropdown} on:keydown={(e) => onKeyActivate(e, toggleModelDropdown)}>
                        <p class="model-name">{activeModel}</p>
                        <span class="chevron">▼</span>
                        {#if showModelDropdown}
                            <div class="model-dropdown">
                                {#each models as model}
                                    <div class="model-option {activeModel === model ? 'active' : ''}" role="button" tabindex="0"
                                        on:click={() => selectModel(model)}
                                        on:keydown={(e) => onKeyActivate(e, () => selectModel(model))}>
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

{#if showTabsDropdown}
    <div id="tabs-mention-dropdown" class="tabs-dropdown" style="top: {tabsDropdownPosition.top}px; left: {tabsDropdownPosition.left}px;">
        {#if openTabs.length === 0}
            <div class="tabs-dropdown-item empty">Нет открытых вкладок</div>
        {:else}
            {#each openTabs as t}
                <div class="tabs-dropdown-item" role="button" tabindex="0"
                    on:mousedown|preventDefault
                    on:click={() => { insertTabMention(t); showTabsDropdown = false; }}
                    on:keydown={(e) => { if (e.key === 'Enter') { insertTabMention(t); showTabsDropdown = false; } }}>
                    {#if t.favIconUrl}
                        <img class="tab-favicon" alt="" src={t.favIconUrl} />
                    {/if}
                    {t.title}
                </div>
            {/each}
        {/if}
    </div>
{/if}

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

    .tabs-dropdown {
        position: fixed;
        z-index: 10000;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        min-width: 220px;
        max-width: 400px;
        max-height: 240px;
        overflow-y: auto;
    }

    .tabs-dropdown-item {
        padding: 0.4rem 0.6rem;
        cursor: pointer;
        color: var(--text-primary);
        font-size: 0.85rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }

    .tabs-dropdown-item:hover {
        background: var(--border-color);
    }

    .tabs-dropdown-item.empty {
        color: var(--text-secondary);
        cursor: default;
    }

    :global(.mention-chip) {
        display: inline-block;
        padding: 0 0.25rem;
        border: 1px solid var(--accent-color);
        border-radius: 4px;
        background: rgba(0,0,0,0.05);
        color: var(--text-primary);
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
    }

    .tab-favicon { width: 16px; height: 16px; border-radius: 2px; }
    :global(.mention-chip .chip-favicon) { width: 14px; height: 14px; border-radius: 2px; }

    :global(.mention-chip .chip-close) {
        margin-left: 0.25rem;
        cursor: pointer;
        color: var(--text-secondary);
        user-select: none;
        -webkit-user-select: none;
    }

    :global(.mention-chip .chip-close:hover) {
        color: var(--text-primary);
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
