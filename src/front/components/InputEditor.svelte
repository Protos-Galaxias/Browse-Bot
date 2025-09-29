<!--
Copyright (c) 2025 PROTOS GALAXIAS LIMITED
SPDX-License-Identifier: BSL-1.1
-->

<script lang="ts">
    import { onMount, createEventDispatcher } from 'svelte';
    import { _ } from 'svelte-i18n';
    export let value = '';
    export let placeholder = '';
    export let sendOnEnter = true;
    export let mentions: Array<{ id: number; title: string; url?: string; favIconUrl?: string }> = [];

    const dispatch = createEventDispatcher();

    let el: HTMLDivElement | null = null;
    let showTabsDropdown = false;
    let tabsDropdownPosition = { top: 0, left: 0 };
    let openTabs: Array<{ id: number; title: string; url?: string; favIconUrl?: string }> = [];
    let activeEditorElement: HTMLElement | null = null;
    let lastCaretRange: Range | null = null;
    let lastCaretRect: { top: number; bottom: number; left: number; right: number } | null = null;
    let mentionQuery = '';
    let filteredTabs: Array<{ id: number; title: string; url?: string; favIconUrl?: string }> = [];
    let selectedMentionIdx = 0;

    const mentionMap: Map<number, { id: number; title: string; url?: string; favIconUrl?: string }> = new Map();

    function sanitizePromptText(text: string): string {
        return (text || '').replace(/\u00D7/g, '');
    }
    function normalizeMentionNewlines(text: string): string {
        let out = text.replace(/(@tab:[^\n]*?)\n(?!\n)/g, '$1 ');
        out = out.replace(/\n\s*(?=@tab:)/g, ' ');
        out = out.replace(/[ \t]{2,}/g, ' ');
        return out;
    }
    function autoResize() {
        if (!el) return;
        el.style.height = 'auto';
        const scrollHeight = el.scrollHeight;
        const maxHeight = 300;
        if (scrollHeight <= maxHeight) {
            el.style.height = scrollHeight + 'px';
            el.style.overflowY = 'hidden';
        } else {
            el.style.height = maxHeight + 'px';
            el.style.overflowY = 'auto';
        }
    }
    function syncMentionsOut() {
        mentions = Array.from(mentionMap.values());
        dispatch('mentionsChange', { mentions });
    }
    function reconcileMentionsFromDOM() {
        if (!el) return;
        try {
            const chips = el.querySelectorAll('.mention-chip');
            const presentIds = new Set<number>();
            chips.forEach((chip) => {
                const idStr = (chip as HTMLElement).getAttribute('data-tab-id') || '';
                const idNum = Number(idStr);
                if (!Number.isNaN(idNum)) presentIds.add(idNum);
            });
            Array.from(mentionMap.keys()).forEach((id) => {
                if (!presentIds.has(id)) mentionMap.delete(id);
            });
            syncMentionsOut();
        } catch {
        // ignore
        }
    }
    function handleInput() {
        if (!el) return;
        const raw = (el.innerText || '').replace(/\r/g, '');
        const sanitized = sanitizePromptText(raw);
        value = normalizeMentionNewlines(sanitized);
        dispatch('input', { value });
        autoResize();
        if (showTabsDropdown) updateMentionQueryFromCaret();
        reconcileMentionsFromDOM();
    }
    function handlePaste(e: ClipboardEvent) {
        if (!el) return;
        e.preventDefault();
        const text = e.clipboardData?.getData('text/plain') || '';
        document.execCommand('insertText', false, text);
        handleInput();
        setTimeout(autoResize, 0);
    }
    async function ensureOpenTabs() {
        try {
            const tabs = await chrome.tabs.query({});
            openTabs = tabs.map(t => ({ id: t.id as number, title: t.title || '', url: t.url, favIconUrl: (t as any).favIconUrl }));
        } catch {
            try { chrome.tabs.query({}, (tabs) => { openTabs = tabs.map(t => ({ id: t.id as number, title: t.title || '', url: t.url, favIconUrl: (t as any).favIconUrl })); }); } catch {}
        }
    }
    function positionDropdownAtCaret() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0).cloneRange();
        lastCaretRange = range.cloneRange();
        range.collapse(true);
        let rect: DOMRect | null = null;
        if (range.getClientRects().length > 0) rect = range.getClientRects()[0] as DOMRect; else {
            const dummy = document.createElement('span');
            dummy.textContent = '\u200C';
            range.insertNode(dummy);
            rect = dummy.getBoundingClientRect();
            dummy.parentNode?.removeChild(dummy);
        }
        if (rect) {
            tabsDropdownPosition = { top: rect.bottom + 4, left: rect.left };
            lastCaretRect = { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
        }
    }
    function adjustDropdownToViewport() {
        if (!lastCaretRect) return;
        const vw = window.innerWidth; const vh = window.innerHeight; const rect = lastCaretRect; const ddWidth = 260;
        const el = document.getElementById('tabs-mention-dropdown');
        const measured = el?.getBoundingClientRect();
        const approx = Math.min(240, Math.max(36 * (filteredTabs.length || 1), 36));
        const ddHeight = measured?.height ?? approx;
        let top = rect.bottom + 4; let left = rect.left;
        if (top + ddHeight > vh - 8) top = Math.max(8, rect.top - ddHeight - 4);
        if (left + ddWidth > vw - 8) left = Math.max(8, vw - ddWidth - 8);
        left = Math.max(8, left);
        tabsDropdownPosition = { top, left };
    }
    function updateFilteredTabs() {
        const q = (mentionQuery || '').toLowerCase();
        filteredTabs = !q ? openTabs.slice() : openTabs.filter(t => (t.title || '').toLowerCase().includes(q));
        if (filteredTabs.length === 0 || selectedMentionIdx >= filteredTabs.length) selectedMentionIdx = 0;
    }
    function updateMentionQueryFromCaret() {
        try {
            const editor = (activeEditorElement || el) as HTMLElement | null;
            const selection = window.getSelection();
            if (!editor || !selection || selection.rangeCount === 0) return;
            const range = selection.getRangeAt(0).cloneRange();
            const preRange = document.createRange();
            preRange.selectNodeContents(editor);
            preRange.setEnd(range.endContainer, range.endOffset);
            const upToCaret = preRange.toString();
            const match = upToCaret.match(/@([^\s@]*)$/);
            if (match) {
                mentionQuery = match[1] || '';
                updateFilteredTabs();
                positionDropdownAtCaret();
                setTimeout(adjustDropdownToViewport, 0);
            } else { showTabsDropdown = false; mentionQuery = ''; }
        } catch {}
    }
    function insertTabMention(tab: { id: number; title: string; url?: string; favIconUrl?: string }) {
        mentionMap.set(tab.id, { id: tab.id, title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl });
        const selection = window.getSelection();
        if (activeEditorElement instanceof HTMLElement) activeEditorElement.focus();
        if (selection && lastCaretRange) { selection.removeAllRanges(); selection.addRange(lastCaretRange); }
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);

        // Expand selection start to the beginning of the current @token
        try {
            const node = range.startContainer;
            if (node.nodeType === Node.TEXT_NODE) {
                const textNode = node as Text;
                const textContent = textNode.textContent || '';
                let start = range.startOffset;
                while (start > 0 && !/\s/.test(textContent.charAt(start - 1))) {
                    start--;
                }
                if (textContent.charAt(start) === '@') {
                    range.setStart(textNode, start);
                } else {
                    if (range.startOffset > 0 && textContent.charAt(range.startOffset - 1) === '@') {
                        range.setStart(textNode, range.startOffset - 1);
                    }
                }
            }
        } catch {}

        const chip = document.createElement('span');
        chip.className = 'mention-chip';
        chip.setAttribute('contenteditable', 'false');
        chip.setAttribute('data-tab-id', String(tab.id));
        const label = document.createElement('span');
        label.className = 'chip-label';
        label.textContent = `@tab:${tab.title}`;
        if (tab.favIconUrl) { const icon = document.createElement('img'); icon.className = 'chip-favicon'; icon.src = tab.favIconUrl; icon.alt = ''; chip.appendChild(icon); }
        const close = document.createElement('span');
        close.className = 'chip-close';
        close.setAttribute('role', 'button');
        close.tabIndex = 0; close.textContent = '×';
        const removeChip = (e: Event) => {
            e.preventDefault(); e.stopPropagation();
            const chipEl = (e.currentTarget as HTMLElement).closest('.mention-chip') as HTMLElement | null;
            if (!chipEl) return; const parent = chipEl.parentNode; const tabIdStr = chipEl.getAttribute('data-tab-id') || '';
            const next = chipEl.nextSibling; if (next && next.nodeType === Node.TEXT_NODE) { const t = next as Text; if (t.data.startsWith(' ')) { if (t.data.length > 1) t.data = t.data.slice(1); else parent?.removeChild(next); } }
            parent?.removeChild(chipEl);
            if (tabIdStr) mentionMap.delete(Number(tabIdStr));
            syncMentionsOut();
            if (activeEditorElement instanceof HTMLElement) activeEditorElement.focus();
            if (parent) {
                const newRange = document.createRange();
                if (next && parent.contains(next)) newRange.setStart(next, 0); else if (parent.lastChild) newRange.setStartAfter(parent.lastChild as Node); else { newRange.selectNode(parent as Node); newRange.collapse(false); }
                const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(newRange);
            }
            handleInput();
        };
        close.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
        close.addEventListener('click', removeChip);
        close.addEventListener('keydown', (e) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') removeChip(e); });
        chip.append(label, close);
        range.deleteContents(); range.insertNode(chip);
        const space = document.createTextNode(' '); chip.after(space);
        const newRange = document.createRange(); newRange.setStartAfter(space); newRange.collapse(true);
        selection.removeAllRanges(); selection.addRange(newRange);

        syncMentionsOut();
        handleInput();
        autoResize();
    }

    function onKeydown(event: KeyboardEvent) {
        const isMeta = event.ctrlKey || event.metaKey;
        if (showTabsDropdown && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === 'Tab')) {
            if (filteredTabs.length > 0) {
                event.preventDefault();
                if (event.key === 'ArrowDown') selectedMentionIdx = (selectedMentionIdx + 1) % filteredTabs.length;
                else if (event.key === 'ArrowUp') selectedMentionIdx = (selectedMentionIdx - 1 + filteredTabs.length) % filteredTabs.length;
                else if (event.key === 'Enter' || event.key === 'Tab') {
                    const picked = filteredTabs[selectedMentionIdx];
                    if (picked) { insertTabMention(picked); showTabsDropdown = false; }
                }
                return;
            }
        }
        if (event.key === '@') {
            activeEditorElement = event.currentTarget as HTMLElement;
            queueMicrotask(async () => {
                await ensureOpenTabs();
                positionDropdownAtCaret();
                showTabsDropdown = true;
                setTimeout(adjustDropdownToViewport, 0);
                mentionQuery = '';
                updateFilteredTabs();
                selectedMentionIdx = 0;
            });
        } else if (event.key === 'Escape') {
            showTabsDropdown = false;
        }
        if (showTabsDropdown) setTimeout(updateMentionQueryFromCaret, 0);
        // After key handling, reconcile mentions in case a chip was deleted via Backspace/Delete
        setTimeout(reconcileMentionsFromDOM, 0);

        if (sendOnEnter) {
            if (event.key === 'Enter' && !isMeta) { event.preventDefault(); dispatch('submit'); }
            else if (event.key === 'Enter' && isMeta) { event.preventDefault(); document.execCommand('insertLineBreak'); handleInput(); setTimeout(autoResize, 0); }
        } else {
            if (event.key === 'Enter' && isMeta) { event.preventDefault(); dispatch('submit'); }
        }
    }

    function pickTab(t: any) { insertTabMention(t); showTabsDropdown = false; }

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

    $: if (el) {
        const isFocused = document.activeElement === el;
        const forceSync = isFocused && ((value || '') === '');
        if (!isFocused || forceSync) {
            if ((el.innerText || '') !== (value || '')) {
                el.innerText = value || '';
                autoResize();
            }
        }
    }
</script>

<div class="input-container">
    <div
        class="welcome-input inline-editor"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        tabindex="0"
        bind:this={el}
        on:input={handleInput}
        on:paste={handlePaste}
        on:keydown={onKeydown}
        data-placeholder={placeholder}
    ></div>

    {#if showTabsDropdown}
        <div id="tabs-mention-dropdown" class="tabs-dropdown" style="top: {tabsDropdownPosition.top}px; left: {tabsDropdownPosition.left}px;">
            {#if filteredTabs.length === 0}
                <div class="tabs-dropdown-item empty">{$_('tabs.noOpenTabs')}</div>
            {:else}
                {#each filteredTabs as t, i}
                    <div class="tabs-dropdown-item {i === selectedMentionIdx ? 'active' : ''}" role="button" tabindex="0"
                        on:mousedown|preventDefault
                        on:mouseenter={() => selectedMentionIdx = i}
                        on:click={() => pickTab(t)}
                        on:keydown={(e) => { if ((e as KeyboardEvent).key === 'Enter') pickTab(t); }}>
                        {#if t.favIconUrl}<img class="tab-favicon" alt="" src={t.favIconUrl} />{/if}
                        <span class="tab-title">{t.title}</span>
                    </div>
                {/each}
            {/if}
        </div>
    {/if}
</div>

<style>
    .welcome-input { width: 100%; background: transparent; border: none; resize: none; color: var(--text-primary); font-size: 0.9rem; outline: none; }
    .inline-editor { min-height: 20px; white-space: pre-wrap; word-break: break-word; text-align: left; }
    :global(.mention-chip) { display: inline-block; padding: 0 0.25rem; border: 1px solid var(--accent-color); border-radius: 4px; background: rgba(0,0,0,0.05); color: var(--text-primary); display: inline-flex; align-items: center; gap: 0.25rem; white-space: nowrap; max-width: 280px; overflow: hidden; }
    :global(.mention-chip .chip-favicon) { width: 14px; height: 14px; border-radius: 2px; }
    :global(.mention-chip .chip-label) { display: inline-block; max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    :global(.mention-chip .chip-close) { margin-left: 0.25rem; cursor: pointer; color: var(--text-secondary); user-select: none; -webkit-user-select: none; }
    :global(.mention-chip .chip-close:hover) { color: var(--text-primary); }

    .tabs-dropdown { position: fixed; z-index: 10000; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); min-width: 220px; max-width: 400px; max-height: 240px; overflow-y: auto; text-align: left; }
    .tabs-dropdown-item { padding: 0.4rem 0.6rem; cursor: pointer; color: var(--text-primary); font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 0.4rem; justify-content: flex-start; text-align: left; }
    .tabs-dropdown-item:nth-child(even):not(.empty) { background: var(--bg-primary); }
    .tabs-dropdown-item:nth-child(even):not(.empty):hover,
    .tabs-dropdown-item:nth-child(even).active,
    .tabs-dropdown-item:hover:not(.empty),
    .tabs-dropdown-item.active { background: var(--accent-color); color: white; }
    .tabs-dropdown-item.empty { color: var(--text-secondary); cursor: default; }
    .tab-favicon { width: 16px; height: 16px; border-radius: 2px; }
</style>
