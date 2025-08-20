<script lang="ts">
    import { renderMarkdownSafe } from '../lib/markdown';
    import { renderUserMessage } from '../lib/renderUser';
    export let entry: string;
    $: isUser = entry.startsWith('[User]');
    $: html = isUser ? renderUserMessage(entry.replace('[User]: ', '')) : renderMarkdownSafe(entry);
</script>

<div class="message {isUser ? 'user' : 'assistant'}">
    {#if isUser}
        <div class="message-avatar">U</div>
        <div class="message-bubble user-bubble">
            {@html html}
        </div>
    {:else}
        <div class="message-content">
            {@html html}
        </div>
    {/if}
</div>

<style>
	.message { display: flex; gap: 1rem; align-items: flex-start; }
	.message.user { flex-direction: row; }
	.message.assistant { flex-direction: column; }
	.message-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--accent-color); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.9rem; flex-shrink: 0; }
	.message-bubble { background: var(--bg-primary); padding: 0.2rem 0.5rem; border-radius: 12px; max-width: 80%; word-wrap: break-word; text-align: left; }
	.user-bubble { background: var(--accent-color); color: white; }
	.message-content { color: var(--text-primary); line-height: 1.5; white-space: normal; text-align: left; }
	.message-content p { margin: 0.35rem 0; }
	.message-content ul { margin: 0.35rem 0 0.35rem 1rem; padding-left: 1rem; }
	.message-content ol { margin: 0.35rem 0 0.35rem 1rem; padding-left: 1rem; }
	.message-content li { margin: 0.2rem 0; }
	.message-content h1, .message-content h2, .message-content h3, .message-content h4, .message-content h5, .message-content h6 { margin: 0.5rem 0 0.25rem 0; font-weight: 600; line-height: 1.25; }
	.message-content h1 { font-size: 1.25rem; }
	.message-content h2 { font-size: 1.15rem; }
	.message-content h3 { font-size: 1.05rem; }
	.message-content code { background: var(--bg-secondary); border: 1px solid var(--border-color); padding: 0.05rem 0.3rem; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 0.85em; }
	.message-content a { color: var(--accent-color); text-decoration: underline; }
</style>
