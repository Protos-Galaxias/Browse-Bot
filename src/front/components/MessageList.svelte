<!--
Copyright (c) 2025 PROTOS GALAXIAS LIMITED
SPDX-License-Identifier: BSL-1.1
-->

<script lang="ts">
    import MessageItem from './MessageItem.svelte';
    import { afterUpdate, onMount } from 'svelte';
    import { _ } from 'svelte-i18n';
    import { renderMarkdownSafe } from '../lib/markdown';

    export let log: any[] = [];
    export let isTyping = false;
    export let streamingText = '';

    let container: HTMLDivElement | null = null;
    let endRef: HTMLDivElement | null = null;

    function scrollToBottom() {
        if (endRef) endRef.scrollIntoView({ behavior: 'auto', block: 'end' });
    }

    onMount(scrollToBottom);
    afterUpdate(scrollToBottom);

    $: isStreaming = streamingText.length > 0;
    $: renderedStreaming = isStreaming ? renderMarkdownSafe(streamingText) : '';
</script>

<div class="chat-messages" bind:this={container}>
    {#each log as entry}
        <MessageItem {entry} />
    {/each}

    {#if isStreaming}
        <div class="message assistant">
            <div class="streaming-content">
                <img class="logo-icon" src="/logos/48x48.png" alt="Browse Bot" />
                <div class="streaming-text markdown-body">
                    {@html renderedStreaming}
                </div>
            </div>
        </div>
    {:else if isTyping}
        <div class="message assistant">
            <div class="typing-indicator">
                <img class="logo-icon" src="/logos/48x48.png" alt="Browse Bot" />
                <span>{$_('chat.typing')}</span>
            </div>
        </div>
    {/if}
    <div bind:this={endRef}></div>
</div>

<style>
    .chat-messages { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
    .typing-indicator { display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); font-style: italic; }
    .typing-indicator .logo-icon { width: 24px; height: 24px; }
    .streaming-content { display: flex; align-items: flex-start; gap: 0.5rem; }
    .streaming-content .logo-icon { width: 24px; height: 24px; flex-shrink: 0; margin-top: 2px; }
    .streaming-text { flex: 1; color: var(--text-primary); line-height: 1.5; }
</style>
