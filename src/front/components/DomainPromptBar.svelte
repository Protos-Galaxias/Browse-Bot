<!--
Copyright (c) 2025 PROTOS GALAXIAS LIMITED
SPDX-License-Identifier: BSL-1.1
-->

<script lang="ts">
    import { onMount } from 'svelte';
    import { _ } from 'svelte-i18n';
    import { extStorage } from '../../services/ExtStorage';

    let domainPrompts: Record<string, string> = {};
    let isModalOpen = false;
    let activeTabMeta: { id: number; title: string; url?: string; favIconUrl?: string } | null = null;
    let activeDomain = '';
    let domainPromptText = '';

    onMount(async () => {
        try {
            const store = await extStorage.local.get(['domainPrompts']);
            domainPrompts = (store?.domainPrompts && typeof store.domainPrompts === 'object') ? store.domainPrompts : {};
        } catch {}
        try {
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (tab?.id) activeTabMeta = { id: tab.id as number, title: tab.title || '', url: tab.url, favIconUrl: (tab as any).favIconUrl };
        } catch {}
        try {
            chrome.tabs.onActivated.addListener(async (activeInfo) => {
                try { const tab = await chrome.tabs.get(activeInfo.tabId); activeTabMeta = { id: tab.id as number, title: tab.title || '', url: tab.url, favIconUrl: (tab as any).favIconUrl }; } catch {}
            });
            chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
                try { if (tab.active) activeTabMeta = { id: tab.id as number, title: tab.title || '', url: tab.url, favIconUrl: (tab as any).favIconUrl }; } catch {}
            });
        } catch {}
        try {
            extStorage.onChanged.addListener((changes) => {
                if (changes.domainPrompts) {
                    const next = changes.domainPrompts.newValue as any;
                    if (next && typeof next === 'object') domainPrompts = next as Record<string,string>;
                }
            });
        } catch {}
    });

    $: activeDomain = (activeTabMeta?.url ? (() => { try { return new URL(activeTabMeta!.url!).hostname.replace(/^www\./,''); } catch { return ''; } })() : '');
    $: domainPromptText = (activeDomain && domainPrompts[activeDomain]) ? domainPrompts[activeDomain] : '';

    async function saveDomainPrompt() {
        if (!activeDomain) return;
        domainPrompts = { ...domainPrompts, [activeDomain]: domainPromptText };
        try { await extStorage.local.set({ domainPrompts }); } catch {}
    }
</script>

<div class="dpb">
    <nav class="bar">
        <div class="domain-prompt-top">
            <button class="domain-toggle" on:click={() => isModalOpen = true}>
                ✎ {$_('chat.domainPrompt')} {activeDomain || '(—)'}
            </button>
        </div>
        <div class="right">
            <slot></slot>
        </div>
    </nav>

    {#if isModalOpen}
        <div
            class="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`Domain prompt — ${activeDomain || '(—)'}`}
            tabindex="0"
            on:keydown={(e) => { if (e.key === 'Escape') { isModalOpen = false; } }}
            on:click|self={() => isModalOpen = false}
        >
            <div class="modal">
                <div class="modal-header">
                    <div class="modal-title">{$_('chat.domainPrompt')} — {activeDomain || '(—)'}</div>
                    <button class="icon-btn" type="button" aria-label="Close" on:click={() => isModalOpen = false}>×</button>
                </div>
                <div class="modal-body">
                    <textarea
                        class="domain-textarea"
                        bind:value={domainPromptText}
                        placeholder={$_('chat.domainPromptPlaceholder')}
                        on:input={saveDomainPrompt}
                        rows="8"
                    ></textarea>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .dpb { position: relative; }
    .bar { display: flex; justify-content: flex-end; padding: 0.25rem 0; background: var(--bg-primary); transition: background 0.3s, border-color 0.3s; }
    .domain-prompt-top { margin-right: auto; display: flex; align-items: center; padding-left: 0.5rem; min-width: 0; }
    .domain-toggle { background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-secondary); padding: 0.25rem 0.5rem; border-radius: 10px; cursor: pointer; text-align: left; min-width: 0; max-width: calc(100vw - 160px); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; display: inline-flex; align-items: center; gap: 0.25rem; }
    .domain-toggle:hover { background: var(--bg-secondary); color: var(--text-primary); }
    .domain-textarea {
        width: 100%;
        box-sizing: border-box;
        display: block;
        margin: 0;
        min-height: 64px;
        background: var(--bg-secondary);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 0.5rem;
        resize: none;
        outline: none;
        box-shadow: none;
    }
    .domain-textarea:focus { outline: none; box-shadow: none; border-color: var(--border-color); }
    .right :global(button) { background: transparent; border: none; color: var(--text-primary); padding: 0.5rem 0.75rem; cursor: pointer; border-radius: 6px; margin-right: 0.25rem; transition: background-color 0.2s, color 0.3s; font-size: 0.9rem; }
    .right :global(button:hover) { background: var(--border-color); }
    .right :global(button:active) { background: var(--accent-color); color: white; }
    :global(.nav-icon) { width: 18px; height: 18px; display: block; }

    /* Modal styles (consistent with Settings.svelte) */
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
    .icon-btn { background: transparent; color: var(--text-primary); width: 28px; height: 28px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 0; padding: 0; }
    .icon-btn:hover { background: var(--border-color); color: var(--text-primary); }
</style>

