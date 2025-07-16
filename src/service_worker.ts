// @ts-ignore
import contentScript from './content?script';

if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
} else {
    chrome.action.onClicked.addListener(() => {
        // @ts-ignore
        chrome.sidebarAction.toggle();
    });
}

let currentTask: { prompt: string; history: string[] } | null = null;
let activeTabId: number | null = null;

=chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'START_TASK') {
    if (currentTask) {
      updateLog('[System]: A task is already running.');
      return;
    }
    console.log("Service Worker: Received START_TASK", message.prompt);
    currentTask = { prompt: message.prompt, history: [] };
    runAgentLoop();
  }
  return true;
});

async function runAgentLoop() {
  if (!currentTask) return;

  updateLog('[Agent]: Thinking...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !tab.url || tab.url.startsWith("chrome://")) {
      updateLog('[Error]: Cannot run on the current page. Please use a standard http/https page.');
      finishTask();
      return;
    }
    activeTabId = tab.id;

    try {
        await chrome.scripting.executeScript({
          target: {
            tabId: activeTabId, 
            allFrames: true,
          },
          files: [contentScript],
        });
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.error("Failed to inject content script:", e);
        if (e instanceof Error && e.message.includes('Cannot access a chrome:// URL')) {
           updateLog('[Error]: Cannot run on Chrome-specific pages.');
           finishTask();
           return;
        }
      }

    updateLog('[Agent]: Reading page content...');
    const contextResponse = await chrome.tabs.sendMessage(activeTabId, { type: 'GET_CONTEXT' });
    const pageContext = contextResponse.dom;

    const action = await getNextActionFromLLM(pageContext);
    if (!action) {
      updateLog('[Error]: Failed to get a valid action from LLM.');
      finishTask();
      return;
    }

    await executeAction(action);
  } catch (error) {
    console.error("Agent loop error:", error);
    updateLog(`[Error]: An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`);
    finishTask();
  }
}

async function getNextActionFromLLM(pageContext: string): Promise<any | null> {
  if (!currentTask) return null;

  updateLog('[Agent]: Asking LLM for the next step...');
  const { apiKey, model } = await chrome.storage.local.get(['apiKey', 'model']);

  if (!apiKey) {
    updateLog('[Error]: OpenRouter API Key is not set. Please set it in the settings.');
    return { action: 'FINISH', result: 'Task failed: API key not set.' };
  }

  const systemPrompt = `You are an autonomous web browsing agent. Your goal is to complete the user's request.
You can see a simplified version of the web page, containing only text and interactive elements.
Interactive elements are represented by <interactive id="some-id" type="button|input|textarea|etc">text</interactive>.
You have the following tools at your disposal:

1. CLICK(id: string, comment: string) - Clicks an interactive element with the given id.
2. TYPE(id: string, text: string, comment: string) - Types text into an input field or textarea.
3. NAVIGATE(url: string, comment: string) - Navigates to a new URL.
4. FINISH(result: string) - Finishes the task and provides the final result to the user.

RULES:
- Respond ONLY with a single JSON object representing your next action.
- Think step-by-step.
- The 'comment' field should explain your reasoning for the action.
- Do not hallucinate element IDs. Only use IDs present in the page context.
- If you can't find a way to proceed, use FINISH to report the issue.
`;

  const userPrompt = `
Task History:
${currentTask.history.join('\n')}

Current Page Context:
---
${pageContext.substring(0, 8000)} 
---

User's Goal: "${currentTask.prompt}"

Based on the context and history, what is your next single action? Respond with a JSON object.`;

console.log("systemPrompt666", systemPrompt)
console.log("userPromptt666", userPrompt)

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'google/gemini-2.0-flash-exp:free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`LLM API request failed with status ${response.status}: ${errorBody}`);
    }

    const result = await response.json();
    const actionJson = result.choices[0].message.content;
    const action = JSON.parse(actionJson);

    // Логируем действие и добавляем в историю
    const actionString = `[Action]: ${action.action} - ${action.comment}`;
    updateLog(actionString);
    currentTask.history.push(actionString);

    return action;
  } catch (error) {
    console.error("LLM request failed:", error);
    updateLog(`[Error]: LLM request failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function executeAction(action: any) {
  if (!activeTabId) return;

  switch (action.action) {
    case 'CLICK':
    case 'TYPE':
      await chrome.tabs.sendMessage(activeTabId, {
        type: action.action === 'CLICK' ? 'EXECUTE_CLICK' : 'EXECUTE_TYPE',
        elementId: action.id,
        text: action.text,
      });
      setTimeout(runAgentLoop, 2000);
      break;

    case 'NAVIGATE':
      await chrome.tabs.update(activeTabId, { url: action.url });
      break;

    case 'FINISH':
      updateLog(`[Result]: ${action.result}`);
      finishTask();
      break;

    default:
      updateLog(`[Error]: Unknown action type "${action.action}"`);
      finishTask();
      break;
  }
}

function updateLog(data: string) {
  console.log(data);
  chrome.runtime.sendMessage({ type: 'UPDATE_LOG', data }).catch(e => console.error("Failed to send log to UI:", e));
}

function finishTask() {
  chrome.runtime.sendMessage({ type: 'TASK_COMPLETE' }).catch(e => console.error("Failed to send task complete to UI:", e));
  currentTask = null;
  activeTabId = null;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (currentTask && tabId === activeTabId && changeInfo.status === 'complete') {
    console.log(`Tab ${tabId} updated, continuing agent loop.`);
    updateLog('[Agent]: Page loaded, continuing task...');
    setTimeout(runAgentLoop, 1000);
  }
});

if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
} else {
    // @ts-ignore
    if (chrome.sidebarAction) {
        chrome.action.onClicked.addListener(() => {
            // @ts-ignore
            chrome.sidebarAction.toggle();
        });
    }
}