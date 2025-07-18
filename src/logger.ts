export function updateLog(data: string) {
    console.log(data);
    chrome.runtime.sendMessage({ type: 'UPDATE_LOG', data }).catch(e => console.error("Failed to send log to UI:", e));
  }