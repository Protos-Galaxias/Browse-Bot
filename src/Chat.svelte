<script lang="ts">
    let prompt = '';
    let log: string[] = [];
  
    function startTask() {
      if (!prompt) return;
      log = [`[User]: ${prompt}`];
      // Отправляем задачу в Service Worker
      chrome.runtime.sendMessage({ type: "START_TASK", prompt });
    }
  
    // Слушаем обновления от Service Worker
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
      <button on:click={startTask}>►</button>
    </div>
  </div>