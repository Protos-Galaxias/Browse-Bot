<script lang="ts">
    import MessageItem from './MessageItem.svelte';
    export let log: string[] = [];
    export let isTyping = false;
</script>

<div class="chat-messages">
    {#each log as entry}
        <MessageItem {entry} />
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

<style>
	.chat-messages { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
	.typing-indicator { display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); font-style: italic; }
</style>
