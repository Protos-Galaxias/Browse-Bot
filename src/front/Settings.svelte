<script lang="ts">
    import { onMount } from 'svelte';
    import type { Theme } from '../services/ConfigService';
    import DomainPrompts from './DomainPrompts.svelte';

    let apiKey = '';
    let models: string[] = [];
    let newModel = '';
    let activeModel = '';
    let globalPrompt = '';
    let sendOnEnter: boolean = true;
    let hideAgentMessages: boolean = false;
    let theme: Theme = 'system';
    let saveStatus: 'idle' | 'saving' | 'saved' = 'idle';
    let activeTab: 'general' | 'behavior' | 'prompt' = 'general';

    onMount(async () => {
        const settings = await chrome.storage.local.get(['apiKey', 'models', 'activeModel', 'globalPrompt', 'theme', 'sendOnEnter', 'hideAgentMessages']);
        apiKey = settings.apiKey || '';
        models = settings.models || ['openai/gpt-4.1-mini'];
        activeModel = settings.activeModel || models[0];
        globalPrompt = typeof settings.globalPrompt === 'string' ? settings.globalPrompt : '';
        theme = settings.theme || 'system';
        sendOnEnter = typeof settings.sendOnEnter === 'boolean' ? settings.sendOnEnter : true;
        hideAgentMessages = typeof settings.hideAgentMessages === 'boolean' ? settings.hideAgentMessages : false;
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
        await chrome.storage.local.set({ apiKey, models, activeModel, globalPrompt, theme, sendOnEnter, hideAgentMessages });
        saveStatus = 'saved';
        setTimeout(() => {
            saveStatus = 'idle';
        }, 2000);
    }
</script>

<div class="settings-container">
        <div class="tabs">
            <button class="tab {activeTab === 'general' ? 'active' : ''}" on:click={() => activeTab = 'general'}>Общие</button>
            <button class="tab {activeTab === 'behavior' ? 'active' : ''}" on:click={() => activeTab = 'behavior'}>Поведение</button>
            <button class="tab {activeTab === 'prompt' ? 'active' : ''}" on:click={() => activeTab = 'prompt'}>Глобальный промт</button>
        </div>

        {#if activeTab === 'general'}
        <div class="setting-group">
            <label class="setting-label">
                OpenRouter API Key
                <input
                    type="password"
                    bind:value={apiKey}
                    on:input={saveSettings}
                    placeholder="Введите ваш API ключ"
                    class="setting-input"
                />
            </label>
        </div>

        {#if !apiKey}
            <div class="info-card">
                <p>API ключ необходим для обращения к моделям через OpenRouter.</p>
                <ol>
                    <li>Зайдите на <a href="https://openrouter.ai" target="_blank" rel="noopener">openrouter.ai</a>.</li>
                    <li>Авторизуйтесь и перейдите в раздел API Keys.</li>
                    <li>Создайте новый ключ и скопируйте его значение.</li>
                    <li>Вставьте ключ в поле выше — сохранится автоматически.</li>
                </ol>
                <p>Сохранение происходит мгновенно. Ключ хранится локально в браузере.</p>
            </div>
        {/if}

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

        
        {/if}

        {#if activeTab === 'prompt'}
        <div class="setting-group">
            <label class="setting-label">
                Глобальный промт / информация о вас
                <textarea
                    bind:value={globalPrompt}
                    class="setting-textarea"
                    placeholder="Этот текст будет добавляться ко всем запросам в LLM как системная подсказка."
                    rows="6"
                    on:input={saveSettings}
                ></textarea>
            </label>
        </div>

        <div class="setting-group">
            <div class="setting-label">Промты для доменов</div>
            <DomainPrompts />
        </div>
        {/if}

        {#if activeTab === 'behavior'}
        <div class="setting-group">
            <label class="setting-label">
                Отправка по Enter
                <div class="toggle-row">
                    <input id="sendOnEnter" type="checkbox" bind:checked={sendOnEnter} on:change={saveSettings} />
                    <label for="sendOnEnter">Enter — отправка, Ctrl/Cmd+Enter — новая строка</label>
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
                Скрывать промежуточные сообщения агента
                <div class="toggle-row">
                    <input id="hideAgentMessages" type="checkbox" bind:checked={hideAgentMessages} on:change={saveSettings} />
                    <label for="hideAgentMessages">Показывать только итоговый ответ</label>
                </div>
            </label>
        </div>
        {/if}

        {#if saveStatus === 'saved'}
            <div class="save-toast">✓ Настройки сохранены</div>
        {/if}

        <div class="help-text">
            <p>Для работы агента необходим API ключ от OpenRouter.</p>
            <p>Получить ключ можно на сайте: <a href="https://openrouter.ai" target="_blank">openrouter.ai</a></p>
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
        display: block;
        height: 100%;
        min-height: 0;
        overflow-y: auto;
        background: var(--bg-primary);
        padding: 0.75rem;
        transition: background 0.3s;
        box-sizing: border-box;
        max-width: 520px;
        margin: 0 auto;
    }

    .tabs {
        display: flex;
        gap: 0.25rem;
        margin-bottom: 0.75rem;
        position: sticky;
        top: 0;
        background: var(--bg-primary);
        padding-top: 0.25rem;
    }
    .tab {
        background: transparent;
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 0.35rem 0.6rem;
        border-radius: 8px;
        cursor: pointer;
    }
    .tab.active { background: var(--accent-color); border-color: var(--accent-color); color: #fff; }

    

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

    .toggle-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--text-primary);
        font-size: 0.9rem;
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

    .save-toast {
        width: 100%;
        text-align: center;
        background: #28a745;
        color: white;
        padding: 0.5rem;
        border-radius: 8px;
        margin: 0.5rem 0 1rem 0;
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

    .info-card {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 0.75rem;
        color: var(--text-primary);
        margin-bottom: 1rem;
    }
    .info-card ol { margin: 0.5rem 0 0.5rem 1.2rem; padding-left: 1rem; }
    .info-card li { margin: 0.25rem 0; }
    .info-card a { color: var(--accent-color); text-decoration: underline; }
</style>
