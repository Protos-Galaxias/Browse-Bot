<script lang="ts">
    let prompt = '';
    let log: string[] = [];

    function startTask() {
        if (!prompt) return;
        log = [`[User]: ${prompt}`];
        chrome.runtime.sendMessage({ type: 'START_TASK', prompt });
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'UPDATE_LOG') {
            log = [...log, message.data];
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
        <button on:click={startTask}>► Выполнить</button>
    </div>
</div>

<style>
    .chat {
        display: flex;
        flex-direction: column;
        height: 90vh;
        padding: 1rem;
    }

    .log-container {
        flex: 1;
        overflow-y: auto;
        border: 1px solid #ccc;
        padding: 3px;
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

    .input-area button {
        padding: 0.5rem 0.1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        background: #007bff;
        color: white;
    }

    .input-area button:hover {
        background: #0056b3;
    }
</style>
