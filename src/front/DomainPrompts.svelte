<script lang="ts">
    import { onMount } from 'svelte';
    import { _ } from 'svelte-i18n';
    import { extStorage } from '../services/ExtStorage';

    let domainPrompts: Record<string, string> = {};
    let entries: Array<{ domain: string; prompt: string }> = [];

    let filter = '';

    function rebuildEntries() {
        const list = Object.entries(domainPrompts).map(([domain, prompt]) => ({ domain, prompt }));
        const f = (filter || '').toLowerCase();
        entries = !f ? list : list.filter(e => e.domain.toLowerCase().includes(f));
    }

    async function load() {
        try {
            const store = await extStorage.local.get(['domainPrompts']);
            domainPrompts = (store?.domainPrompts && typeof store.domainPrompts === 'object') ? store.domainPrompts : {};
        } catch {
            domainPrompts = {};
        }
        rebuildEntries();
    }

    async function persist() {
        try { await extStorage.local.set({ domainPrompts }); } catch {}
        rebuildEntries();
    }

    async function updateEntry(domain: string, value: string) {
        domainPrompts = { ...domainPrompts, [domain]: value };
        await persist();
    }

    async function deleteEntry(domain: string) {
        const copy = { ...domainPrompts };
        delete copy[domain];
        domainPrompts = copy;
        await persist();
    }

    onMount(load);
</script>

<div class="page">
    <div class="header">
        <input class="filter" placeholder={$_('domains.filterPlaceholder')} bind:value={filter} on:input={rebuildEntries} />
    </div>

    <div class="list">
        {#if entries.length === 0}
            <div class="empty">{$_('domains.empty')}</div>
        {:else}
            {#each entries as e}
                <div class="item">
                    <div class="item-head">
                        <div class="item-domain" title={e.domain}>{e.domain}</div>
                        <div class="item-actions">
                            <button class="delete-btn" on:click={() => deleteEntry(e.domain)} title={$_('common.remove')}>✕</button>
                        </div>
                    </div>
                    <textarea class="item-textarea" bind:value={e.prompt} on:change={(ev) => updateEntry(e.domain, (ev.target as HTMLTextAreaElement).value)}></textarea>
                </div>
            {/each}
        {/if}
    </div>
</div>

<style>
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
    .page { padding: 0.5rem; height: 100%; overflow: auto; }
    .filter { background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 6px; padding: 0.3rem 0.4rem; }

    /* add-card UI removed */

    .list { display: flex; flex-direction: column; gap: 0.5rem; }
    .empty { color: var(--text-secondary); font-style: italic; }
    .item { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.5rem; }
    .item-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.35rem; }
    .item-domain { font-weight: 600; color: var(--text-primary); max-width: 70%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .item-actions { display: flex; gap: 0.25rem; }
    .delete-btn { background: transparent; color: var(--text-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.2rem 0.4rem; cursor: pointer; }
    .delete-btn:hover { background: var(--bg-primary); color: var(--text-primary); }
    .item-textarea { width: 98%; min-height: 64px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; resize: vertical; }
</style>


