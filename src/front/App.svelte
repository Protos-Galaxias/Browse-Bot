<script lang="ts">
    import { onMount } from 'svelte';
    import Chat from './Chat.svelte';
    import Settings from './Settings.svelte';
    import Capabilities from './Capabilities.svelte';
    import type { Theme } from '../services/ConfigService';
    import { _ } from 'svelte-i18n';
    import settingsIcon from './icons/settings.svg';
    import chatIcon from './icons/chat.svg';
    import ideaIcon from './icons/idea.svg';
    import DomainPromptBar from './components/DomainPromptBar.svelte';


    let currentView: 'chat' | 'settings' | 'capabilities' = 'chat';

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

    window.addEventListener('hashchange', updateViewFromHash);

    updateViewFromHash();

    onMount(async () => {
        const settings = await chrome.storage.local.get(['theme', 'apiKey']);
        const theme = settings.theme || 'system';
        applyTheme(theme);

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.theme) {
                applyTheme(changes.theme.newValue);
            }
        });

        // Если API ключ не задан – открываем настройки
        const apiKey = settings.apiKey || '';
        if (!apiKey) {
            currentView = 'settings';
            try { window.location.hash = '#settings'; } catch {}
        }
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
    <header class="header">
        <DomainPromptBar/>
        <nav>
            <button on:click={() => currentView = 'chat'}>
                <img class="nav-icon" src={chatIcon} alt="Chat" />
            </button>
            <button on:click={() => currentView = 'capabilities'}>
                <img class="nav-icon" src={ideaIcon} alt="Capabilities" />
            </button>
            <button on:click={() => currentView = 'settings'}>
                <img class="nav-icon" src={settingsIcon} alt="Settings" />
            </button>
        </nav>
    </header>


    <div class="view">
        {#if currentView === 'chat'}
            <Chat />
        {:else if currentView === 'settings'}
            <Settings />
        {:else if currentView === 'capabilities'}
            <Capabilities />
        {/if}
    </div>
</main>

<style>
    :global(:root) {
        --bg-primary: #2a2a2a;
        --bg-secondary: #1a1a1a;
        --border-color: #3a3a3a;
        --text-primary: #e0e0e0;
        --text-secondary: #a0a0a0;
        --accent-color: #e7e6db;
        --accent-hover: #c6c4ae;
    }

    :global(:root[data-theme="light"]) {
        --bg-primary: #f5f5f5;
        --bg-secondary: #ffffff;
        --border-color: #e0e0e0;
        --text-primary: #333333;
        --text-secondary: #666666;
        --accent-color: #e7e6db;
        --accent-hover: #c6c4ae;
    }

    :global(:root[data-theme="dark"]) {
        --bg-primary: #1a1a1a;
        --bg-secondary: #0a0a0a;
        --border-color: #3a3a3a;
        --text-primary: #f0f0f0;
        --text-secondary: #b0b0b0;
        --accent-color: #e7e6db;
        --accent-hover: #c6c4ae;
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

    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    main {
        margin: 0 !important;
        padding: 0 !important;
        height: 100vh;
        display: flex;
        flex-direction: column;
        width: 100% !important;
    }

    .view {
        flex: 1;
        min-height: 0; /* allow children to manage their own scroll */
        overflow: hidden; /* prevent body scroll; children can scroll internally */
        display: block;
    }

    nav {
        display: flex;
        padding: 0;
        background: var(--bg-primary);
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

    .nav-icon {
        width: 18px;
        height: 18px;
        display: block;
    }

    /* Make stroke-based SVG icons white in dark theme */
    :global(:root[data-theme="dark"]) .nav-icon {
        filter: invert(1);
    }
</style>
