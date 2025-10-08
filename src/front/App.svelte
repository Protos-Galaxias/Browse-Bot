<script lang="ts">
    import { onMount } from 'svelte';
    import Chat from './Chat.svelte';
    import Settings from './Settings.svelte';
    import Capabilities from './Capabilities.svelte';
    import Wizard from './Wizard.svelte';
    import type { Theme } from '../services/ConfigService';
    import { _ } from 'svelte-i18n';
    import settingsIcon from './icons/settings.svg';
    import chatIcon from './icons/chat.svg';
    import ideaIcon from './icons/idea.svg';
    import menuIcon from './icons/menu.svg';
    import DomainPromptBar from './components/DomainPromptBar.svelte';
    import { extStorage } from '../services/ExtStorage';


    let currentView: 'chat' | 'settings' | 'capabilities' = 'chat';
    let chatRef: InstanceType<typeof Chat> | null = null;
    let showWizard = false;
    let checkingSetup = true;

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
        const settings = await extStorage.local.get(['theme', 'provider', 'apiKey', 'openaiApiKey', 'xaiApiKey', 'ollamaBaseURL']);
        const theme = settings.theme || 'system';
        applyTheme(theme);

        try {
            extStorage.onChanged.addListener((changes) => {
                if (changes.theme) {
                    applyTheme(changes.theme.newValue as any);
                }
            });
        } catch {}

        // Connectivity check with background service worker
        try {
            chrome.runtime.sendMessage({ type: 'PING' }, (resp) => {
                const err = chrome.runtime.lastError;
                if (err) {
                    console.warn('[UI] PING failed', err.message);
                } else {
                    try { console.log('[UI] PING ok', resp); } catch {}
                }
            });
        } catch (e) {
            console.warn('[UI] PING threw', e);
        }

        // Check if we need to show wizard (no provider configured)
        const hasProvider = settings.provider;
        const hasAnyKey = settings.apiKey || settings.openaiApiKey || settings.xaiApiKey || settings.ollamaBaseURL;
        
        if (!hasProvider || !hasAnyKey) {
            showWizard = true;
        }
        
        checkingSetup = false;
    });

    function onWizardComplete() {
        showWizard = false;
        currentView = 'chat';
    }

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
    {#if checkingSetup}
        <div class="loading-screen">
            <div class="loading-spinner"></div>
        </div>
    {:else if showWizard}
        <Wizard onComplete={onWizardComplete} />
    {:else}
        <header class="header">
            <button on:click={() => chatRef?.openChatSidebar?.()} title="Chats" aria-label="Open chats">
                <img class="nav-icon" src={menuIcon} alt="Chats" />
            </button>
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
                <Chat bind:this={chatRef} />
            {:else if currentView === 'settings'}
                <Settings />
            {:else if currentView === 'capabilities'}
                <Capabilities />
            {/if}
        </div>
    {/if}
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

    .loading-screen {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background: var(--bg-primary);
    }

    .loading-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid var(--border-color);
        border-top-color: var(--accent-color);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }
</style>
