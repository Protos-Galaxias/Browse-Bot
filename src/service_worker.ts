import { updateLog } from './logger';
import { OpenRouterAIService } from './services/AIService';
import { agentTools } from './tools/agent-tools';
import type { ToolContext } from './tools/agent-tools';
import type { CoreMessage, ToolSet, ToolResultPart } from 'ai';
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
    const history: CoreMessage[] = [
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

        history.push({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: toolCalls[0].toolCallId, toolName: toolCalls[0].toolName, input: toolCalls[0].input }] });

        const toolResults: CoreMessage[] = [];
        for (const call of toolCalls) {
            const tool = tools[call.toolName];
            if (!tool) {
                updateLog(`[Agent] Unknown tool: ${call.toolName}`);
                continue;
            }

            try {
                const result = await tool.execute(call.args);
                console.log('Tool result:', result);

                toolResults.push({
                    role: 'tool',
                    content: [{ type: 'tool-result', toolCallId: call.toolCallId, toolName: call.toolName, output: result }],
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
    return "Agent reached max steps without finishing.";
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

            const systemPrompt = `You are a browser automation agent. You MUST call tools to perform any action.
                1. Call "parseCurrentPage" to inspect the page.
                2. Then use "findAndClick" or "findAndInsertText" as needed.
                3. When the task is 100% done, call "finishTask".
                NEVER respond with plain text.`;

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
