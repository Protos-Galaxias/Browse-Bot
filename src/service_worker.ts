import { updateLog } from './logger';
import { OpenRouterAIService } from './services/AIService';
import { agentTools } from './tools/agent-tools';
import type { ToolContext } from './tools/agent-tools';
import type { CoreMessage } from 'ai';

if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

let currentTask: { prompt: string; history: CoreMessage[] } | null = null;
const aiService = OpenRouterAIService.getInstance();

chrome.runtime.onMessage.addListener(async (message) => {
    if (message.type === 'START_TASK') {
        if (currentTask) {
            updateLog('[System]: A task is already running.');
            return true;
        }

        const systemPrompt = `You are a web agent. Your only job is to complete the user's request by calling tools.
NEVER respond with text. ALWAYS call a tool.
Your workflow is a strict loop:
1.  Call \`parseCurrentPage\` to see the page.
2.  Review the \`elements\` from the result.
3.  Based on the user's goal, call the next logical tool (\`findAndClick\` or \`findAndInsertText\`).
4.  When the task is 100% complete, call the \`finishTask\` tool with a summary. This is your ONLY way to finish the task.`;
        
        currentTask = { 
            prompt: message.prompt, 
            history: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message.prompt }
            ]
        };
        updateLog(`[System]: Starting task: "${message.prompt}"`);

        try {
            await aiService.initialize();
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (!tab?.id) { throw new Error('Active tab not found.'); }
            const tabId = tab.id;

            let interactiveElements: any[] = [];

            const toolContext: ToolContext = {
                aiService,
                tabId: tabId,
                getInteractiveElements: () => interactiveElements,
                setInteractiveElements: (elements) => { interactiveElements = elements; },
                sendMessageToTab: (msg) => chrome.tabs.sendMessage(tabId, msg)
            };

            const tools = agentTools(toolContext);

            const { text, toolCalls } = await aiService.generateWithTools({
                messages: currentTask.history,
                tools: tools,
                maxToolRoundtrips: 10,
            });
            
            let finalMessage = text;
            if (toolCalls?.some(call => call.toolName === 'finishTask')) {
                const finishCall = toolCalls.find(call => call.toolName === 'finishTask');
                finalMessage = finishCall?.args?.final_answer || "Task completed successfully.";
            } else if (!text) {
                finalMessage = "Task ended without a final answer.";
            }

            updateLog(`[Result]: ${finalMessage}`);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            updateLog(`[System Error]: ${errorMessage}`);
        } finally {
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
