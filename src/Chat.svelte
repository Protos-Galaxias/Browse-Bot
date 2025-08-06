<script lang="ts">
    let prompt = '';
    let log: string[] = [];
    let isTaskCompleted = false;

    function startTask() {
        if (!prompt) return;
        log = [`[User]: ${prompt}`];
        isTaskCompleted = false;
        // Отправляем задачу в Service Worker
        chrome.runtime.sendMessage({ type: 'START_TASK', prompt });
    }

    function analyzeWork() {
        if (!prompt) return;
        log = [...log, `[User]: ${prompt}`];
        // Отправляем запрос на анализ работы
        chrome.runtime.sendMessage({ type: 'ANALYZE_WORK', prompt });
    }

    // Слушаем обновления от Service Worker
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'UPDATE_LOG') {
            log = [...log, message.data];
        } else if (message.type === 'TASK_COMPLETE') {
            isTaskCompleted = true;
        }
        return true;
    });
</script>

<div class="chat">
    <div class="log-container">
        {#each log as entry}
            <p>{entry}</p>
        {/each}
    </div>
    <div class="input-area">
        <input type="text" bind:value={prompt} placeholder="Что мне сделать?" />
        <div class="button-group">
            <button on:click={startTask}>► Выполнить</button>
            {#if isTaskCompleted}
                <button on:click={analyzeWork} class="analyze-btn">🔍 Анализ</button>
            {/if}
        </div>
    </div>
</div>

<style>
    .chat {
        display: flex;
        flex-direction: column;
        height: 100vh;
        padding: 1rem;
    }

    .log-container {
        flex: 1;
        overflow-y: auto;
        border: 1px solid #ccc;
        padding: 1rem;
        margin-bottom: 1rem;
        background: #f9f9f9;
    }

    .input-area {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .input-area input {
        flex: 1;
        padding: 0.5rem;
        border: 1px solid #ccc;
        border-radius: 4px;
    }

    .button-group {
        display: flex;
        gap: 0.5rem;
    }

    .button-group button {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        background: #007bff;
        color: white;
    }

    .button-group button:hover {
        background: #0056b3;
    }

    .analyze-btn {
        background: #28a745 !important;
    }

    .analyze-btn:hover {
        background: #1e7e34 !important;
    }
</style>
