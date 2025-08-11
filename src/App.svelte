<script lang="ts">
    import { onMount } from 'svelte';
    import Chat from './Chat.svelte';
    import Settings from './Settings.svelte';
    import Capabilities from './Capabilities.svelte';
    import type { Theme } from './services/ConfigService';

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

    // Загрузка темы при запуске
    onMount(async () => {
        const settings = await chrome.storage.local.get(['theme']);
        const theme = settings.theme || 'system';
        applyTheme(theme);

        // Слушаем изменения темы из настроек
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.theme) {
                applyTheme(changes.theme.newValue);
            }
        });
    });

    function applyTheme(selectedTheme: Theme) {
        const root = document.documentElement;

        if (selectedTheme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            selectedTheme = prefersDark ? 'dark' : 'light';
        }

        root.setAttribute('data-theme', selectedTheme);
    }
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
    :global(:root) {
        --bg-primary: #2a2a2a;
        --bg-secondary: #1a1a1a;
        --border-color: #3a3a3a;
        --text-primary: #e0e0e0;
        --text-secondary: #a0a0a0;
        --accent-color: #ff6b35;
        --accent-hover: #ff5722;
    }

    :global(:root[data-theme="light"]) {
        --bg-primary: #f5f5f5;
        --bg-secondary: #ffffff;
        --border-color: #e0e0e0;
        --text-primary: #333333;
        --text-secondary: #666666;
        --accent-color: #ff6b35;
        --accent-hover: #ff5722;
    }

    :global(:root[data-theme="dark"]) {
        --bg-primary: #1a1a1a;
        --bg-secondary: #0a0a0a;
        --border-color: #3a3a3a;
        --text-primary: #f0f0f0;
        --text-secondary: #b0b0b0;
        --accent-color: #ff6b35;
        --accent-hover: #ff5722;
    }

    :global(body) {
        margin: 0 !important;
        padding: 0 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: var(--bg-primary);
        color: var(--text-primary);
        height: 100vh;
        overflow: hidden;
        min-width: 0 !important;
        min-height: 0 !important;
        transition: background 0.3s, color 0.3s;
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
        background: var(--bg-primary);
        border-bottom: 1px solid var(--border-color);
        transition: background 0.3s, border-color 0.3s;
    }

    nav button {
        background: transparent;
        border: none;
        color: var(--text-primary);
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        border-radius: 6px;
        margin-right: 0.25rem;
        transition: background-color 0.2s, color 0.3s;
        font-size: 0.9rem;
    }

    nav button:hover {
        background: var(--border-color);
    }

    nav button:active {
        background: var(--accent-color);
        color: white;
    }
</style>
