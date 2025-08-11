<script lang="ts">
    import { onMount } from 'svelte';
    import type { Theme } from './services/ConfigService';

    let apiKey = '';
    let models: string[] = [];
    let newModel = '';
    let activeModel = '';
    let globalPrompt = '';
    let theme: Theme = 'system';
    let saveStatus: 'idle' | 'saving' | 'saved' = 'idle';

    onMount(async () => {
        const settings = await chrome.storage.local.get(['apiKey', 'models', 'activeModel', 'globalPrompt', 'theme']);
        apiKey = settings.apiKey || '';
        models = settings.models || ['google/gemini-2.5-pro'];
        activeModel = settings.activeModel || models[0];
        globalPrompt = typeof settings.globalPrompt === 'string' ? settings.globalPrompt : '';
        theme = settings.theme || 'system';
        applyTheme(theme);
        chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG' });
    });

    function applyTheme(selectedTheme: Theme) {
        const root = document.documentElement;

        if (selectedTheme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            selectedTheme = prefersDark ? 'dark' : 'light';
        }

        root.setAttribute('data-theme', selectedTheme);
    }

    function handleThemeChange(newTheme: Theme) {
        theme = newTheme;
        applyTheme(theme);
        saveSettings();
    }

    function addModel() {
        if (newModel.trim() && !models.includes(newModel.trim())) {
            models = [...models, newModel.trim()];
            newModel = '';
            saveSettings();
        }
    }

    function removeModel(index: number) {
        if (models.length > 1) {
            models = models.filter((_, i) => i !== index);
            if (activeModel === models[index]) {
                activeModel = models[0];
            }
            saveSettings();
        }
    }

    function setActiveModel(model: string) {
        activeModel = model;
        saveSettings();
    }

    async function saveSettings() {
        saveStatus = 'saving';
        await chrome.storage.local.set({ apiKey, models, activeModel, globalPrompt, theme });
        saveStatus = 'saved';
        setTimeout(() => {
            saveStatus = 'idle';
        }, 2000);
    }
</script>

<div class="settings-container">
    <div class="settings-card">
        <h2>Настройки Web Walker</h2>

        <div class="setting-group">
            <label class="setting-label">
                OpenRouter API Key
                <input
                    type="password"
                    bind:value={apiKey}
                    placeholder="Введите ваш API ключ"
                    class="setting-input"
                />
            </label>
        </div>

        <div class="setting-group">
            <label class="setting-label">
                Модели AI
                <div class="models-container">
                    {#each models as model, index}
                        <div class="model-item {activeModel === model ? 'active' : ''}">
                            <span class="model-name">{model}</span>
                            <div class="model-actions">
                                <button class="set-active-btn" on:click={() => setActiveModel(model)}>
                                    {activeModel === model ? '✓' : 'Выбрать'}
                                </button>
                                {#if models.length > 1}
                                    <button class="remove-btn" on:click={() => removeModel(index)}>×</button>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
                <div class="add-model">
                    <input
                        type="text"
                        bind:value={newModel}
                        placeholder="Название модели"
                        class="setting-input"
                    />
                    <button class="add-btn" on:click={addModel}>+</button>
                </div>
            </label>
        </div>

        <div class="setting-group">
            <label class="setting-label">
                Цветовая схема
                <div class="theme-selector">
                    <button
                        class="theme-btn {theme === 'light' ? 'active' : ''}"
                        on:click={() => handleThemeChange('light')}
                    >
                        ☀️ Светлая
                    </button>
                    <button
                        class="theme-btn {theme === 'dark' ? 'active' : ''}"
                        on:click={() => handleThemeChange('dark')}
                    >
                        🌙 Темная
                    </button>
                    <button
                        class="theme-btn {theme === 'system' ? 'active' : ''}"
                        on:click={() => handleThemeChange('system')}
                    >
                        💻 Системная
                    </button>
                </div>
            </label>
        </div>

        <div class="setting-group">
            <label class="setting-label">
                Глобальный промт / информация о вас
                <textarea
                    bind:value={globalPrompt}
                    class="setting-textarea"
                    placeholder="Этот текст будет добавляться ко всем запросам в LLM как системная подсказка."
                    rows="6"
                ></textarea>
            </label>
        </div>

        <button class="save-btn {saveStatus}" on:click={saveSettings} disabled={saveStatus === 'saving'}>
            {#if saveStatus === 'saving'}
                Сохранение...
            {:else if saveStatus === 'saved'}
                ✓ Сохранено
            {:else}
                Сохранить настройки
            {/if}
        </button>

        <div class="help-text">
            <p>Для работы агента необходим API ключ от OpenRouter.</p>
            <p>Получить ключ можно на сайте: <a href="https://openrouter.ai" target="_blank">openrouter.ai</a></p>
        </div>
    </div>
</div>

<style>
    :root {
        --bg-primary: #2a2a2a;
        --bg-secondary: #1a1a1a;
        --border-color: #3a3a3a;
        --text-primary: #e0e0e0;
        --text-secondary: #a0a0a0;
        --accent-color: #ff6b35;
        --accent-hover: #ff5722;
    }

    :root[data-theme="light"] {
        --bg-primary: #f5f5f5;
        --bg-secondary: #ffffff;
        --border-color: #e0e0e0;
        --text-primary: #333333;
        --text-secondary: #666666;
        --accent-color: #ff6b35;
        --accent-hover: #ff5722;
    }

    :root[data-theme="dark"] {
        --bg-primary: #1a1a1a;
        --bg-secondary: #0a0a0a;
        --border-color: #3a3a3a;
        --text-primary: #f0f0f0;
        --text-secondary: #b0b0b0;
        --accent-color: #ff6b35;
        --accent-hover: #ff5722;
    }

    .settings-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: var(--bg-primary);
        padding: 2rem;
        transition: background 0.3s;
    }

    .settings-card {
        background: var(--bg-primary);
        border-radius: 12px;
        padding: 1rem;
        width: 100%;
        max-width: 300px;
        border: 1px solid var(--border-color);
        box-sizing: border-box;
        transition: background 0.3s, border-color 0.3s;
    }

    h2 {
        color: var(--text-primary);
        margin: 0 0 1.5rem 0;
        font-size: 1.2rem;
        font-weight: 300;
        text-align: center;
    }

    .setting-group {
        margin-bottom: 1rem;
    }

    .setting-label {
        display: block;
        color: var(--text-primary);
        margin-bottom: 0.5rem;
        font-weight: 500;
    }

    .setting-input {
        width: 100%;
        padding: 0.75rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        color: var(--text-primary);
        font-size: 1rem;
        outline: none;
        transition: border-color 0.2s, background 0.3s;
        box-sizing: border-box;
    }

    .setting-input:focus {
        border-color: var(--accent-color);
    }

    .setting-input::placeholder {
        color: var(--text-secondary);
    }

    .theme-selector {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }

    .theme-btn {
        flex: 1;
        padding: 0.5rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        color: var(--text-primary);
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s;
    }

    .theme-btn:hover {
        border-color: var(--accent-color);
    }

    .theme-btn.active {
        background: var(--accent-color);
        border-color: var(--accent-color);
        color: white;
    }

    .setting-textarea {
        width: 100%;
        padding: 0.75rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        color: var(--text-primary);
        font-size: 0.95rem;
        outline: none;
        transition: border-color 0.2s, background 0.3s;
        box-sizing: border-box;
        resize: vertical;
        min-height: 120px;
    }

    .setting-textarea:focus {
        border-color: var(--accent-color);
    }

    .setting-textarea::placeholder {
        color: var(--text-secondary);
    }

    .models-container {
        margin-bottom: 0.5rem;
    }

    .model-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        margin-bottom: 0.25rem;
        border-radius: 6px;
        border: 1px solid var(--border-color);
        transition: all 0.2s;
    }

    .model-item.active {
        border-color: var(--accent-color);
        background: rgba(255, 107, 53, 0.1);
    }

    .model-name {
        color: var(--text-primary);
        font-size: 0.9rem;
        flex: 1;
    }

    .model-actions {
        display: flex;
        gap: 0.25rem;
    }

    .set-active-btn {
        background: transparent;
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.2s;
    }

    .set-active-btn:hover {
        background: var(--border-color);
    }

    .remove-btn {
        background: #ff4444;
        border: none;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .remove-btn:hover {
        background: #cc3333;
    }

    .add-model {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .add-model .setting-input {
        flex: 1;
    }

    .add-btn {
        background: var(--accent-color);
        border: none;
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 6px;
        font-size: 1.2rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .add-btn:hover {
        background: var(--accent-hover);
    }

    .save-btn {
        width: 100%;
        background: var(--accent-color);
        border: none;
        color: white;
        padding: 0.75rem;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 1rem;
    }

    .save-btn:hover {
        background: var(--accent-hover);
        transform: translateY(-1px);
    }

    .save-btn:active {
        transform: translateY(0);
    }

    .save-btn.saving {
        opacity: 0.7;
        cursor: wait;
    }

    .save-btn.saved {
        background: #28a745;
    }

    .save-btn.saved:hover {
        background: #218838;
    }

    .help-text {
        color: var(--text-secondary);
        font-size: 0.9rem;
        line-height: 1.5;
    }

    .help-text p {
        margin: 0.5rem 0;
    }

    .help-text a {
        color: var(--accent-color);
        text-decoration: none;
    }

    .help-text a:hover {
        text-decoration: underline;
    }
</style>
