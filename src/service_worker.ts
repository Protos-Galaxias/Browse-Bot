// @ts-expect-error: This is a Vite-specific import syntax, and the variable is used in executeScript which is currently commented out.
// import contentScript from './content?script';
import { updateLog } from './logger';
import { plannerTool } from './tools';
import { findElementIds } from './tools/findElement';
import { OpenRouterAIService } from './services/AIService';

if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

let currentTask: { prompt: string; history: string[] } | null = null;
const aiService = OpenRouterAIService.getInstance();

async function parseCurrentPage(tabId: number): Promise<any[]> {
    updateLog('[Action]: Parsing current page...');
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PARSE_CURRENT_PAGE' });
    if (!response || !response.data) {
        updateLog('[Warning]: Did not receive valid interactive elements.');
        return [];
    }
    updateLog(`[Action]: Found ${response.data.length} interactive elements.`);
    return response.data;
}

async function findAndClickElements(tabId: number, elements: any[], description: string): Promise<void> {
    updateLog(`[Action]: Finding elements to click: "${description}"`);
    const elementIds = await findElementIds(elements, description, aiService);
    if (!elementIds || elementIds.length === 0) {
        updateLog(`[Warning]: No elements found for "${description}".`);
        return;
    }
    updateLog(`[Action]: Found ${elementIds.length} elements. Clicking...`);
    for (const aid of elementIds) {
        await chrome.tabs.sendMessage(tabId, { type: 'CLICK_ON_ELEMENT', aid: aid });
    }
}

async function findAndInsertText(tabId: number, elements: any[], description: string, text: string): Promise<void> {
    updateLog(`[Action]: Finding input for "${description}" to insert text.`);
    const elementIds = await findElementIds(elements, description, aiService);
    if (!elementIds || elementIds.length === 0) {
        updateLog(`[Warning]: No input elements found for "${description}".`);
        return;
    }
    // Assume the first found element is the correct one.
    const targetId = elementIds[0];

    updateLog(`[Action]: Found input ${targetId}. Inserting text: "${text}"`);
    await chrome.tabs.sendMessage(tabId, { type: 'INSERT_TEXT', aid: targetId, text: text });
}

function returnResult(message: string): void {
    updateLog(`[Result]: ${message}`);
    finishTask();
}

chrome.runtime.onMessage.addListener(async (message) => {
    if (message.type === 'START_TASK') {
        if (currentTask) {
            updateLog('[System]: A task is already running.');
            return true;
        }

        currentTask = { prompt: message.prompt, history: [] };
        updateLog(`[System]: Starting task: "${message.prompt}"`);

        try {
            await aiService.initialize();

            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (!tab?.id || !tab.url || tab.url.startsWith('chrome://')) {
                throw new Error('Cannot run on the current page.');
            }

            const plan = await plannerTool(message.prompt, aiService);
            updateLog(`[System]: Generated plan with ${plan.length} steps.`);

            let interactiveElements: any[] = [];

            for (const action of plan) {
                updateLog(`[Step]: Executing: ${action.description}`);
                switch (action.type) {
                    case 'parse_current_page':
                        interactiveElements = await parseCurrentPage(tab.id);
                        break;
                    case 'find_and_insert_text':
                        if (!action.element_description || !action.text) {
                            throw new Error("Action 'find_and_insert_text' is missing parameters.");
                        }
                        await findAndInsertText(tab.id, interactiveElements, action.element_description, action.text);
                        break;
                    case 'find_and_click':
                        if (!action.element_description) {
                            throw new Error("Action 'find_and_click' is missing 'element_description' parameter.");
                        }
                        await findAndClickElements(tab.id, interactiveElements, action.element_description);
                        break;
                    case 'return_result':
                        if (!action.data) {
                            throw new Error("Action 'return_result' is missing 'data' parameter.");
                        }
                        returnResult(action.data);
                        break;
                    default:
                        // @ts-expect-error An unknown action type would be a planning failure.
                        throw new Error(`Unknown action type in plan: ${action.type}`);
                }
                // Small delay to allow the page to react
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            if (!plan.some(p => p.type === 'return_result')) {
                finishTask();
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            updateLog(`[System Error]: ${errorMessage}`);
            finishTask();
        }
    }
    return true;
});

function finishTask() {
    updateLog('[System]: Task finished.');
    chrome.runtime.sendMessage({ type: 'TASK_COMPLETE' }).catch(e => console.error('Failed to send task complete to UI:', e));
    currentTask = null;
}
