<script lang="ts">
    import Chat from './Chat.svelte';
    import Settings from './Settings.svelte';
    import Capabilities from './Capabilities.svelte';

    let currentView: 'chat' | 'settings' | 'capabilities' = 'chat';

    // Обработка хэша в URL
    function updateViewFromHash() {
        const hash = window.location.hash;
        if (hash === '#settings') {
            currentView = 'settings';
        } else if (hash === '#capabilities') {
            currentView = 'capabilities';
        } else {
            currentView = 'chat';
        }
    }

    // Слушаем изменения хэша
    window.addEventListener('hashchange', updateViewFromHash);
    
    // Инициализация при загрузке
    updateViewFromHash();
</script>

<main>
    <nav>
        <button on:click={() => currentView = 'chat'}>Чат</button>
        <button on:click={() => currentView = 'capabilities'}>Возможности</button>
        <button on:click={() => currentView = 'settings'}>Настройки</button>
    </nav>

    {#if currentView === 'chat'}
        <Chat />
    {:else if currentView === 'settings'}
        <Settings />
    {:else if currentView === 'capabilities'}
        <Capabilities />
    {/if}
</main>

<style>
    :global(body) {
        margin: 0 !important;
        padding: 0 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #2a2a2a;
        color: #e0e0e0;
        height: 100vh;
        overflow: hidden;
        min-width: 0 !important;
        min-height: 0 !important;
    }

    main {
        margin: 0 !important;
        padding: 0 !important;
        height: 100vh;
        display: flex;
        flex-direction: column;
        width: 100% !important;
    }

    nav {
        display: flex;
        padding: 0;
        background: #2a2a2a;
        border-bottom: 1px solid #3a3a3a;
    }

    nav button {
        background: transparent;
        border: none;
        color: #e0e0e0;
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        border-radius: 6px;
        margin-right: 0.25rem;
        transition: background-color 0.2s;
        font-size: 0.9rem;
    }

    nav button:hover {
        background: #3a3a3a;
    }

    nav button:active {
        background: #4a4a4a;
    }
</style>
