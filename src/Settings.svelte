<script lang="ts">
    import { onMount } from 'svelte';

    let apiKey = '';
    let models: string[] = [];
    let newModel = '';
    let activeModel = '';

    onMount(async () => {
        const settings = await chrome.storage.local.get(['apiKey', 'models', 'activeModel']);
        apiKey = settings.apiKey || '';
        models = settings.models || ['google/gemini-2.5-pro'];
        activeModel = settings.activeModel || models[0];
        chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG' });
    });

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

    function saveSettings() {
        chrome.storage.local.set({ apiKey, models, activeModel });
        alert('Настройки сохранены!');
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
        
        <button class="save-btn" on:click={saveSettings}>
            Сохранить настройки
        </button>
        
        <div class="help-text">
            <p>Для работы агента необходим API ключ от OpenRouter.</p>
            <p>Получить ключ можно на сайте: <a href="https://openrouter.ai" target="_blank">openrouter.ai</a></p>
        </div>
    </div>
</div>

<style>
    .settings-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: #2a2a2a;
        padding: 2rem;
    }

    .settings-card {
        background: #2a2a2a;
        border-radius: 12px;
        padding: 1rem;
        width: 100%;
        max-width: 300px;
        border: 1px solid #3a3a3a;
        box-sizing: border-box;
    }

    h2 {
        color: #e0e0e0;
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
        color: #e0e0e0;
        margin-bottom: 0.5rem;
        font-weight: 500;
    }

    .setting-input {
        width: 100%;
        padding: 0.75rem;
        background: #1a1a1a;
        border: 1px solid #3a3a3a;
        border-radius: 8px;
        color: #e0e0e0;
        font-size: 1rem;
        outline: none;
        transition: border-color 0.2s;
        box-sizing: border-box;
    }

    .setting-input:focus {
        border-color: #ff6b35;
    }

    .setting-input::placeholder {
        color: #a0a0a0;
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
        border: 1px solid #3a3a3a;
        transition: all 0.2s;
    }

    .model-item.active {
        border-color: #ff6b35;
        background: rgba(255, 107, 53, 0.1);
    }

    .model-name {
        color: #e0e0e0;
        font-size: 0.9rem;
        flex: 1;
    }

    .model-actions {
        display: flex;
        gap: 0.25rem;
    }

    .set-active-btn {
        background: transparent;
        border: 1px solid #3a3a3a;
        color: #e0e0e0;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.2s;
    }

    .set-active-btn:hover {
        background: #3a3a3a;
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
        background: #ff6b35;
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
        background: #ff5722;
    }

    .save-btn {
        width: 100%;
        background: #ff6b35;
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
        background: #ff5722;
        transform: translateY(-1px);
    }

    .save-btn:active {
        transform: translateY(0);
    }

    .help-text {
        color: #a0a0a0;
        font-size: 0.9rem;
        line-height: 1.5;
    }

    .help-text p {
        margin: 0.5rem 0;
    }

    .help-text a {
        color: #ff6b35;
        text-decoration: none;
    }

    .help-text a:hover {
        text-decoration: underline;
    }
</style>
