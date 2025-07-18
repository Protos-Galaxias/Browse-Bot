export async function aggregationAndCleaningTool(data: string[] | string): Promise<string> {
    console.log('Aggregating and cleaning data...');
    // If data is an array, join it. If it's already a string, just use it.
    const aggregatedResult = Array.isArray(data) ? data.flat().join('\n\n---\n') : data;
  
    // Potentially send to Sidebar or other UI component
    chrome.runtime.sendMessage({ type: 'FINAL_RESULT', data: aggregatedResult }).catch(e => console.error("Failed to send final result to UI:", e));
  
    return aggregatedResult;
  }