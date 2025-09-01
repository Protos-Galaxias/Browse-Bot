<script lang="ts">
    import { onMount } from 'svelte';
    import { _ } from 'svelte-i18n';

    let domainPrompts: Record<string, string> = {};
    let domainPromptCollapsed = true;
    let activeTabMeta: { id: number; title: string; url?: string; favIconUrl?: string } | null = null;
    let activeDomain = '';
    let domainPromptText = '';

    onMount(async () => {
        try {
            const store = await chrome.storage.local.get(['domainPrompts']);
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
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.domainPrompts) {
                    const next = changes.domainPrompts.newValue;
                    if (next && typeof next === 'object') domainPrompts = next;
                }
            });
        } catch {}
    });

    $: activeDomain = (activeTabMeta?.url ? (() => { try { return new URL(activeTabMeta!.url!).hostname.replace(/^www\./,''); } catch { return ''; } })() : '');
    $: domainPromptText = (activeDomain && domainPrompts[activeDomain]) ? domainPrompts[activeDomain] : '';

    async function saveDomainPrompt() {
        if (!activeDomain) return;
        domainPrompts = { ...domainPrompts, [activeDomain]: domainPromptText };
        try { await chrome.storage.local.set({ domainPrompts }); } catch {}
    }
</script>

<div class="dpb">
    <nav class="bar">
        <div class="domain-prompt-top">
            <button class="domain-toggle" on:click={() => domainPromptCollapsed = !domainPromptCollapsed}>
                {domainPromptCollapsed ? '▼' : '▲'} {$_('chat.domainPrompt')} {activeDomain || '(—)'}
            </button>
        </div>
        <div class="right">
            <slot></slot>
        </div>
    </nav>

    {#if !domainPromptCollapsed}
        <div class="domain-prompt-panel">
            <textarea class="domain-textarea" bind:value={domainPromptText} placeholder={$_('chat.domainPromptPlaceholder')} on:input={saveDomainPrompt}></textarea>
        </div>
    {/if}
</div>

<style>
    .dpb { position: relative; }
    .bar { display: flex; justify-content: flex-end; padding: 0.25rem 0; background: var(--bg-primary); transition: background 0.3s, border-color 0.3s; }
    .domain-prompt-top { margin-right: auto; display: flex; align-items: center; padding-left: 0.5rem; min-width: 0; }
    .domain-toggle { background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-secondary); padding: 0.25rem 0.5rem; border-radius: 10px; cursor: pointer; text-align: left; min-width: 0; max-width: calc(100vw - 160px); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; display: inline-flex; align-items: center; gap: 0.25rem; }
    .domain-toggle:hover { background: var(--bg-secondary); color: var(--text-primary); }
    .domain-prompt-panel {
        position: absolute;
        top: calc(100% + 6px);
        left: 0.5rem;
        background: var(--bg-secondary);
        padding: 0.5rem;
        border: 1px solid var(--border-color);
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        z-index: 9999;
        width: min(420px, calc(100vw - 3rem));
        overflow: hidden;
    }
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
</style>

