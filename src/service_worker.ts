import { updateLog } from './logger';
import { OpenRouterAIService } from './services/AIService';
import { agentTools } from './tools/agent-tools';
import type { ToolContext } from './tools/types';
import type { ToolSet, ModelMessage } from 'ai';
import type { AIService } from './services/AIService';

if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

const aiService = OpenRouterAIService.getInstance();

let agentHistory: any[] = [];
let currentController: AbortController | null = null;


async function runAgentTask(
    messages: ModelMessage[],
    tools: ToolSet,
    aiService: AIService
) {
    const history: ModelMessage[] = messages;

    agentHistory = [...history];

    currentController = new AbortController();
    const signal = currentController.signal;

    type ToolResultOutput = { answer?: string; [key: string]: unknown };
    type ToolResult = { toolCallId: string; toolName: string; output: ToolResultOutput };

    try {
        const res: unknown = await aiService.generateWithTools({
            messages: history,
            tools,
            abortSignal: signal
        });

        const raw: any = res as any;
        console.log('res', raw);
        const steps: Array<any> | undefined = Array.isArray(raw?.steps) ? raw.steps : undefined;
        const flattenContent: Array<any> = Array.isArray(steps)
            ? steps.flatMap((s: any) => (Array.isArray(s?.content) ? s.content : []))
            : [];

        const toolCalls = flattenContent.filter((c: any) => c?.type === 'tool-call');
        const sdkToolResults = flattenContent.filter((c: any) => c?.type === 'tool-result');
        const text = (() => {
            const texts = flattenContent.filter((c: any) => c?.type === 'text' && typeof c.text === 'string');
            return texts.length > 0 ? texts[texts.length - 1].text : undefined;
        })();
        console.log('derived', { stepsCount: steps?.length ?? 0, toolCalls: toolCalls.length, toolResults: sdkToolResults.length, hasText: Boolean(text) });

        if (Array.isArray(toolCalls)) {
            for (const call of toolCalls) {
                agentHistory.push({
                    role: 'assistant',
                    content: [{
                        type: 'tool-call',
                        toolCallId: call.toolCallId,
                        toolName: call.toolName,
                        input: call.input
                    }]
                });
                updateLog(`[Агент] Вызвал ${call.toolName}.`);
            }
        }
        if (Array.isArray(sdkToolResults) && sdkToolResults.length > 0) {
            const toolResultsMsgs = sdkToolResults.map((tr: ToolResult) => ({
                role: 'tool',
                content: [{
                    type: 'tool-result',
                    toolCallId: tr.toolCallId,
                    toolName: tr.toolName,
                    output: { type: 'json', value: tr.output }
                }]
            }));
            agentHistory.push(...toolResultsMsgs);
        }

        const finish = (sdkToolResults || []).find((tr: ToolResult) => tr.toolName === 'finishTask');
        if (finish && finish.output && typeof finish.output.answer === 'string') {
            return finish.output.answer as string;
        }


        if (Array.isArray(steps)) agentHistory.push(...steps);
        if (typeof text === 'string' && text.length > 0) {
            agentHistory.push({ role: 'assistant', content: text });
        }
        console.log('agentHistory', agentHistory);

        return text || 'Task completed without a final text answer.';
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            updateLog('[Агент] Задача была прервана пользователем');
            return 'Задача была остановлена пользователем';
        }
        throw error;
    }
}

function formatWorkHistoryForContext(): string | null {
    if (!Array.isArray(agentHistory) || agentHistory.length === 0) return null;
    try {
        const lines: string[] = agentHistory.map((msg: any, index: number) => {
            if (msg.role === 'user' && typeof msg.content === 'string') {
                return `Шаг ${index}: Пользователь: ${msg.content}`;
            }
            if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                const item = msg.content[0];
                if (item?.type === 'tool-call') {
                    return `Шаг ${index}: Агент вызвал инструмент '${item.toolName}'`;
                }
            }
            if (msg.role === 'tool' && Array.isArray(msg.content)) {
                const item = msg.content[0];
                if (item?.type === 'tool-result') {
                    return `Шаг ${index}: Результат '${item.toolName}': ${JSON.stringify(item.output)}`;
                }
            }
            if (typeof msg.content === 'string') {
                return `Шаг ${index}: ${msg.role}: ${msg.content}`;
            }
            return `Шаг ${index}: ${msg.role}`;
        });
        return `Контекст (история предыдущей работы агента):\n${lines.join('\n')}`;
    } catch {
        return null;
    }
}

chrome.runtime.onMessage.addListener(async (message) => {
    if (message.type === 'START_TASK') {
        const { prompt, tabs } = message as { prompt: string; tabs?: Array<{ id: number; title?: string; url?: string }> };
        if (Array.isArray(tabs)) console.log('tabs meta back', tabs);

        try {
            await aiService.initialize();

            let seedTabs = Array.isArray(tabs) && tabs.length > 0 ? tabs : [];
            if (seedTabs.length === 0) {
                const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (!activeTab?.id) {
                    updateLog('[Система]: Нет активной вкладки — отвечаю без инструментов, но с историей');

                    const systemPrompt = (await import('./prompts/system.md?raw')).default as string;
                    const historyText = formatWorkHistoryForContext();
                    const messages: ModelMessage[] = [
                        { role: 'system', content: systemPrompt },
                        ...(historyText ? [{ role: 'system', content: historyText } as ModelMessage] : []),
                        { role: 'user', content: prompt }
                    ];

                    agentHistory = [...messages];

                    const finalAnswer = await runAgentTask(messages, {} as ToolSet, aiService);
                    updateLog(`[Результат]: ${finalAnswer}`);
                    return true;
                } else {
                    seedTabs = [{ id: activeTab.id, title: activeTab.title, url: activeTab.url }];
                }
            }

            const resolvedDefaultTabId = seedTabs[0]!.id;
            let elements: any[] = [];

            const toolContext: ToolContext = {
                aiService,
                tabs: seedTabs,
                getInteractiveElements: () => elements,
                setInteractiveElements: (e) => { elements = e; },
                sendMessageToTab: (msg, targetTabId?: number) => chrome.tabs.sendMessage(targetTabId ?? resolvedDefaultTabId, msg)
            };

            const tools = agentTools(toolContext);

            const systemPrompt = (await import('./prompts/system.md?raw')).default as string;
            const historyText = formatWorkHistoryForContext();

            const messages: ModelMessage[] = [
                { role: 'system', content: systemPrompt },
                ...(historyText ? [{ role: 'system', content: historyText } as ModelMessage] : []),
                { role: 'user', content: prompt }
            ];

            agentHistory = [...messages];

            const finalAnswer = await runAgentTask(messages, tools, aiService);

            updateLog(`[Результат]: ${finalAnswer}`);
        } catch (err) {
            console.log('err', err);
            updateLog(`[Ошибка]: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            chrome.runtime.sendMessage({ type: 'TASK_COMPLETE' }).catch(console.error);
        }
    } else if (message.type === 'STOP_TASK') {
        if (currentController) {
            currentController.abort();
            currentController = null;
            updateLog('[Система]: Задача остановлена пользователем');
            chrome.runtime.sendMessage({ type: 'TASK_COMPLETE' }).catch(console.error);
        }
    }
    return true;
});
