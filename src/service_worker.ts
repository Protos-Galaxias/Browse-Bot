import { updateLog } from './logger';
import { OpenRouterAIService } from './services/AIService';
import { agentTools } from './tools/agent-tools';
import type { ToolContext } from './tools/agent-tools';
import type { ModelMessage, ToolSet } from 'ai';
import type { AIService } from './services/AIService';

if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

const aiService = OpenRouterAIService.getInstance();

async function runAgentTask(
    prompt: string,
    tools: ToolSet,
    aiService: AIService,
    toolContext: ToolContext,
    systemPrompt: string,
    maxSteps: number = 10
) {
    const history: ModelMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
    ];

    for (let step = 0; step < maxSteps; step++) {
        updateLog(`[Agent] Step ${step + 1}`);

        const { toolCalls, text } = await aiService.generateWithTools({
            messages: history,
            tools
        });

        if (!toolCalls || toolCalls.length === 0) {
            updateLog(`[Agent] No more tool calls. Final Answer: ${text}`);
            return text || "Task completed without a final text answer.";
        }
        console.log('toolCalls', toolCalls);

        history.push({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: toolCalls[0].toolCallId, toolName: toolCalls[0].toolName, input: toolCalls[0].input }] });

        console.log('history', history);
        const toolResults: ModelMessage[] = [];
        for (const call of toolCalls) {
            console.log('call111111111', call);

            const tool = tools[call.toolName];
            if (!tool) {
                updateLog(`[Agent] Unknown tool: ${call.toolName}`);
                continue;
            }

            try {
                const result = await tool.execute(call.input ?? {});
                console.log('Tool result:', result);

                toolResults.push({
                    role: 'tool',
                    content: [{ type: 'tool-result', toolCallId: call.toolCallId, toolName: call.toolName, output: {
                        type: 'json',
                        value: result
                    } }],
                });

                updateLog(`[Agent] Called ${call.toolName}.`);

                if (call.toolName === 'finishTask') {
                    return (result as { answer: string }).answer;
                }
            } catch (err) {
                updateLog(`[Agent] Error calling ${call.toolName}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        history.push(...toolResults);
    }

    return 'Agent reached max steps without finishing.';
}

chrome.runtime.onMessage.addListener(async (message) => {
    if (message.type === 'START_TASK') {
        const { prompt } = message;
        updateLog(`[System]: Starting task: "${prompt}"`);

        try {
            await aiService.initialize();
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (!tab?.id) throw new Error('No active tab');
            const tabId = tab.id;

            let elements: any[] = [];

            const toolContext: ToolContext = {
                aiService,
                tabId: tabId,
                getInteractiveElements: () => elements,
                setInteractiveElements: (e) => { elements = e; },
                sendMessageToTab: (msg) => chrome.tabs.sendMessage(tabId, msg)
            };

            const tools = agentTools(toolContext);

            const systemPrompt = `You are a web automation agent. Your goal is to complete the user's request by breaking it down into smaller sub-tasks.
Your workflow:
1.  **Analyze**: Look at the user's request and the history. Identify the very next sub-task to perform.
2.  **Act**: Call a tool to complete that sub-task. Your first tool call MUST be \`parseCurrentPage\`.
3.  **Reflect**: After a tool is used, the history will be updated. Look at the new state and decide if the sub-task is complete.
4.  **Repeat**: If the main task is not complete, go back to step 1 and identify the next sub-task.
5.  **Finish**: Once all sub-tasks are done, call \`finishTask\`.
Example sub-tasks for "add items from favorites to cart":
- Sub-task 1: Navigate to the favorites page.
- Sub-task 2: Add all items on the favorites page to the cart.`;

            const finalAnswer = await runAgentTask(prompt, tools, aiService, toolContext, systemPrompt);
            updateLog(`[Result]: ${finalAnswer}`);

        } catch (err) {
            updateLog(`[Error]: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            chrome.runtime.sendMessage({ type: 'TASK_COMPLETE' }).catch(console.error);
        }
    }
    return true;
});
