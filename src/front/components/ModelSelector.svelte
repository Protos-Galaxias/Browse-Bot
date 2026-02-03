<!--
Copyright (c) 2025 PROTOS GALAXIAS LIMITED
SPDX-License-Identifier: BSL-1.1
-->

<script lang="ts">
    import {createEventDispatcher, onMount} from 'svelte';

    export let models: string[] = [];
    export let activeModel = '';
    export let open = false;
    export let openUpward = false;
    const dispatch = createEventDispatcher();

    let containerEl: HTMLDivElement;

    function selectModel(m: string) {
        dispatch('change', {model: m});
        open = false;
    }

    function toggle() {
        open = !open;
    }

    function onKeyActivate(event: KeyboardEvent, callback: () => void) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            callback();
        }
    }

    function onClickOutside(event: MouseEvent) {
        if (!open) {
            return;
        }

        const target = event.target as Node;
        if (containerEl && !containerEl.contains(target)) {
            open = false;
        }
    }

    onMount(() => {
        document.addEventListener('click', onClickOutside, true);

        return () => document.removeEventListener('click', onClickOutside, true);
    });
</script>

<div class="model-selector" role="button" tabindex="0" bind:this={containerEl} on:click={toggle} on:keydown={(e) => onKeyActivate(e, toggle)}>
    <p class="model-name">{activeModel}</p>
    <span class="chevron">▼</span>
    {#if open}
        <div class="model-dropdown {openUpward ? 'upward' : ''}" role="menu" tabindex="-1" on:click|stopPropagation on:keydown={(e) => { if (e.key === 'Escape') open = false; }}>
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

<style>
    .model-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
        padding: .2rem;
        margin: 0;
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
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }

    .model-dropdown.upward {
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
        color: #000000;
    }
</style>
