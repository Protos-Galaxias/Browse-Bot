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

let agentHistory: ModelMessage[] = [];
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
    systemPrompt: string,
    maxSteps: number = 10
) {
    const history: ModelMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
    ];

    agentHistory = [...history];

    currentController = new AbortController();
    const signal = currentController.signal;

    for (let step = 0; step < maxSteps; step++) {
        updateLog(`[Агент] Шаг ${step + 1}`);

        try {
            const res: any = await aiService.generateWithTools({
                messages: history,
                tools,
                abortSignal: signal
            });

            const toolCalls = res.toolCalls as Array<any> | undefined;
            const text = res.text as string | undefined;
            const sdkToolResults = res.toolResults as Array<any> | undefined;

            if (!toolCalls || toolCalls.length === 0) {
                updateLog(`[Агент] Больше нет вызовов инструментов. Финальный ответ: ${text}`);
                return text || 'Task completed without a final text answer.';
            }

            for (const call of toolCalls) {
                history.push({
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

            if (Array.isArray(sdkToolResults) && sdkToolResults.length > 0) {
                const toolResultsMsgs: ModelMessage[] = sdkToolResults.map((tr: any) => ({
                    role: 'tool',
                    content: [{
                        type: 'tool-result',
                        toolCallId: tr.toolCallId,
                        toolName: tr.toolName,
                        output: { type: 'json', value: tr.output }
                    }]
                }));

                history.push(...toolResultsMsgs);
            }

            agentHistory = [...history];
            console.log('agentHistory', agentHistory);

            const finish = (sdkToolResults || []).find((tr: any) => tr.toolName === 'finishTask');
            if (finish && finish.output && typeof finish.output.answer === 'string') {
                return finish.output.answer as string;
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                updateLog('[Агент] Задача была прервана пользователем');
                return 'Задача была остановлена пользователем';
            }
            throw error;
        }
    }

    return 'Агент достиг максимального количества шагов без завершения.';
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
        const { prompt, mentionedTabIds } = message;
        console.log('mentionedTabIds back', mentionedTabIds);

        try {
            await aiService.initialize();
            const promptType = await classifyPrompt(prompt);
            updateLog(`[Система]: Запрос классифицирован как: ${promptType}`);

            if (promptType === 'BROWSER_ACTION') {
                updateLog('Обнаружено действие в браузере, запускаю агента');

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
