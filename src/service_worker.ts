import { updateLog } from './logger';
import { OpenRouterAIService } from './services/AIService';
import { agentTools } from './tools/agent-tools';
import type { ToolContext } from './tools/types';
import type { ToolSet } from 'ai';
import type { AIService } from './services/AIService';

if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

const aiService = OpenRouterAIService.getInstance();

let agentHistory: any[] = [];
let lastTaskPrompt = '';
let currentController: AbortController | null = null;

type PromptType = 'BROWSER_ACTION' | 'DIRECT_QUESTION' | 'HISTORY_ANALYSIS';

async function classifyPrompt(prompt: string): Promise<PromptType> {
    const classificationPrompt = `Классифицируй запрос пользователя как один из трех типов:

BROWSER_ACTION — если запрос требует действий на сайте (клик, поиск, добавить в корзину и т.д.)
DIRECT_QUESTION — если это просто вопрос к ИИ (погода, анекдот, как дела и т.д.)
HISTORY_ANALYSIS — если пользователь спрашивает о проделанной работе агента (сколько шагов, что делал и т.д.)

Примеры:
Запрос: "добавь товары из избранного в корзину"
Ответ: BROWSER_ACTION

Запрос: "найди молоко"
Ответ: BROWSER_ACTION

Запрос: "кликни на кнопку поиска"
Ответ: BROWSER_ACTION

Запрос: "как дела?"
Ответ: DIRECT_QUESTION

Запрос: "какая погода в Москве?"
Ответ: DIRECT_QUESTION

Запрос: "расскажи анекдот"
Ответ: DIRECT_QUESTION

Запрос: "за сколько шагов ты это сделал?"
Ответ: HISTORY_ANALYSIS

Запрос: "что ты делал?"
Ответ: HISTORY_ANALYSIS

Запрос: "какие инструменты использовал?"
Ответ: HISTORY_ANALYSIS

Запрос: "${prompt}"
Ответ:`;

    try {
        await aiService.initialize();
        const response = await aiService.generateTextByPrompt(classificationPrompt);
        const result = response.text?.trim().toUpperCase();

        if (result === 'BROWSER_ACTION' || result === 'DIRECT_QUESTION' || result === 'HISTORY_ANALYSIS') {
            return result as PromptType;
        }

        const browserKeywords = ['добавь', 'найди', 'кликни', 'нажми', 'перейди', 'открой', 'заполни', 'введи', 'корзина', 'избранное', 'поиск', 'товар', 'купить'];
        const historyKeywords = ['шагов', 'делал', 'использовал', 'инструменты', 'анализ', 'что делал'];
        const lowerPrompt = prompt.toLowerCase();

        if (historyKeywords.some(keyword => lowerPrompt.includes(keyword))) {
            return 'HISTORY_ANALYSIS';
        }

        if (browserKeywords.some(keyword => lowerPrompt.includes(keyword))) {
            return 'BROWSER_ACTION';
        }

        return 'DIRECT_QUESTION';
    } catch (err) {
        updateLog(`[Ошибка] Не удалось классифицировать запрос: ${err instanceof Error ? err.message : String(err)}`);
        return 'DIRECT_QUESTION';
    }
}


async function runAgentTask(
    prompt: string,
    tools: ToolSet,
    aiService: AIService,
    systemPrompt: string
) {
    const history: any[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
    ];

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

async function analyzeWork(prompt: string): Promise<string> {
    if (!agentHistory.length || !lastTaskPrompt) {
        return 'Нет данных о проделанной работе. Сначала выполните какое-либо действие в браузере.';
    }

    const hasToolCalls = agentHistory.some(msg =>
        msg.role === 'assistant' && Array.isArray(msg.content) && msg.content[0]?.type === 'tool-call'
    );

    if (!hasToolCalls) {
        return 'Нет данных о проделанной работе. Сначала выполните какое-либо действие в браузере.';
    }

    const analysisPrompt = `Проанализируй проделанную работу агента.

Исходный запрос пользователя: "${lastTaskPrompt}"
Текущий вопрос: "${prompt}"

История действий агента:
${agentHistory.map((msg, index) => {
        if (msg.role === 'user') return `Шаг ${index}: Пользователь: ${msg.content}`;
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            const toolCall = msg.content[0];
            if (toolCall.type === 'tool-call') {
                return `Шаг ${index}: Агент вызвал инструмент '${toolCall.toolName}'`;
            }
        }
        if (msg.role === 'tool' && Array.isArray(msg.content)) {
            const toolResult = msg.content[0];
            if (toolResult.type === 'tool-result') {
                return `Шаг ${index}: Результат инструмента '${toolResult.toolName}': ${JSON.stringify(toolResult.output)}`;
            }
        }
        return `Шаг ${index}: ${msg.role}: ${JSON.stringify(msg.content)}`;
    }).join('\n')}

Ответь на вопрос пользователя, основываясь на этой истории.`;

    try {
        await aiService.initialize();
        const response = await aiService.generateTextByPrompt(analysisPrompt);
        return response.text || 'Не удалось проанализировать работу.';
    } catch (err) {
        return `Ошибка при анализе: ${err instanceof Error ? err.message : String(err)}`;
    }
}

chrome.runtime.onMessage.addListener(async (message) => {
    if (message.type === 'START_TASK') {
        const { prompt, tabs } = message as { prompt: string; tabs?: Array<{ id: number; title?: string; url?: string }> };
        if (Array.isArray(tabs)) console.log('tabs meta back', tabs);

        try {
            await aiService.initialize();
            const promptType = await classifyPrompt(prompt);
            updateLog(`[Система]: Запрос классифицирован как: ${promptType}`);

            if (promptType === 'BROWSER_ACTION' || (Array.isArray(tabs) && tabs.length > 0)) {
                updateLog('Обнаружено действие в браузере, запускаю агента');

                let seedTabs = Array.isArray(tabs) && tabs.length > 0 ? tabs : [];
                if (seedTabs.length === 0) {
                    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                    if (!activeTab?.id) throw new Error('No active tab');
                    seedTabs = [{ id: activeTab.id, title: activeTab.title, url: activeTab.url }];
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

                agentHistory = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ];
                lastTaskPrompt = prompt;

                const finalAnswer = await runAgentTask(prompt, tools, aiService, systemPrompt);

                updateLog(`[Результат]: ${finalAnswer}`);
            } else if (promptType === 'HISTORY_ANALYSIS') {
                updateLog('[Система]: Запрошен анализ истории');
                const analysis = await analyzeWork(prompt);
                updateLog(`[Анализ]: ${analysis}`);

            } else {
                updateLog('[Система]: Обнаружен прямой вопрос, отправляю в LLM');

                const response = await aiService.generateTextByPrompt(prompt);
                const answer = response.text || 'Не удалось получить ответ.';
                updateLog(`[Результат]: ${answer}`);
            }
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
