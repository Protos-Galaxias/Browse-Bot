<script lang="ts">
    import { onMount } from 'svelte';

    let apiKey = '';
    let model = 'google/gemini-2.5-pro';

    onMount(async () => {
        const settings = await chrome.storage.local.get(['apiKey', 'model']);
        apiKey = settings.apiKey || '';
        model = settings.model || 'google/gemini-2.5-pro';
        chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG' });
    });

    function saveSettings() {
        chrome.storage.local.set({ apiKey, model });
        alert('Настройки сохранены!');
    }
</script>

<div class="settings">
    <h3>Настройки</h3>
    <label>
        OpenRouter API Key:
        <input type="password" bind:value={apiKey} />
    </label>
    <label>
        Модель:
        <input type="text" bind:value={model} />
    </label>
    <button on:click={saveSettings}>Сохранить</button>
</div>
