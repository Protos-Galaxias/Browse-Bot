<script lang="ts">
    import Chat from './Chat.svelte';
    import Settings from './Settings.svelte';

    let currentView: 'chat' | 'settings' = 'chat';
</script>

<main>
    <nav>
        <button on:click={() => currentView = 'chat'}>Чат</button>
        <button on:click={() => currentView = 'settings'}>Настройки</button>
    </nav>

    {#if currentView === 'chat'}
        <Chat />
    {:else}
        <Settings />
    {/if}
</main>
