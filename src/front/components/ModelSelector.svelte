<!--
Copyright (c) 2025 PROTOS GALAXIAS LIMITED
SPDX-License-Identifier: BSL-1.1
-->

<script lang="ts">
    import {createEventDispatcher} from 'svelte';

    export let models: string[] = [];
    export let activeModel = '';
    export let open = false;
    const dispatch = createEventDispatcher();

    function selectModel(m: string) {
        dispatch('change', {model: m});
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
</script>

<div class="model-selector" role="button" tabindex="0" on:click={toggle} on:keydown={(e) => onKeyActivate(e, toggle)}>
    <p class="model-name">{activeModel}</p>
    <span class="chevron">▼</span>
    {#if open}
        <div class="model-dropdown" on:click|stopPropagation>
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
</style>
