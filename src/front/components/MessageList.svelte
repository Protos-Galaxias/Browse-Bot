<script lang="ts">
    import MessageItem from './MessageItem.svelte';
    import { afterUpdate, onMount } from 'svelte';
    import { _ } from 'svelte-i18n';
    export let log: string[] = [];
    export let isTyping = false;

    let container: HTMLDivElement | null = null;
    let endRef: HTMLDivElement | null = null;

    function scrollToBottom() {
        if (endRef) endRef.scrollIntoView({ behavior: 'auto', block: 'end' });
    }

    onMount(scrollToBottom);
    afterUpdate(scrollToBottom);
</script>

<div class="chat-messages" bind:this={container}>
    {#each log as entry}
        <MessageItem {entry} />
    {/each}

    {#if isTyping}
        <div class="message assistant">
            <div class="typing-indicator">
                <div class="logo-icon">✦</div>
                <span>{$_('chat.typing')}</span>
            </div>
        </div>
    {/if}
    <div bind:this={endRef}></div>
</div>

<style>
	.chat-messages { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
	.typing-indicator { display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); font-style: italic; }
</style>
