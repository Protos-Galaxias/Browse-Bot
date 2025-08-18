import { tool } from 'ai';
import { z } from 'zod';
import { findElementIds } from './findElement';
import type { AIService as AIServiceType } from '../services/AIService';
import { updateLog } from '../logger';

export interface ToolContext {
    aiService: AIServiceType;
    tabs: Array<{ id: number; title?: string; url?: string }>;
    getInteractiveElements: () => any[];
    setInteractiveElements: (elements: any[]) => void;
    sendMessageToTab: (message: any, tabId?: number) => Promise<any>;
}

type ToolOutput = {
    success: boolean;
    error?: string;
    [key: string]: any;
};

export const agentTools = (context: ToolContext) => {
    const resolveTabId = (tab_id?: number): number => {
        const available = Array.isArray(context.tabs) && context.tabs.length > 0 ? context.tabs.map(t => t.id) : [];
        if (available.length === 0) throw new Error('No tabs available in ToolContext');
        if (typeof tab_id === 'number' && available.includes(tab_id)) return tab_id;
        return available[0];
    };

    return {
        parsePageInteractiveElements: tool({
            description: 'Scans all tabs from context and returns their parsed elements in parsedTabs. Also updates interactive elements with the first parsed tab for compatibility.',
            inputSchema: z.object({}),
            async execute(): Promise<ToolOutput> {
                const all = Array.isArray(context.tabs) ? context.tabs : [];
                if (all.length === 0) return { success: false, error: 'No tabs available in context.' };

                const parseOne = async (tid: number, title?: string, url?: string) => {
                    const response = await context.sendMessageToTab({ type: 'PARSE_CURRENT_PAGE' }, tid);
                    const elements = Array.isArray(response?.data) ? response.data : [];
                    return { tabId: tid, title, url, elements };
                };

                const parsedTabs = await Promise.all(
                    all.map(t => parseOne(t.id, t.title, t.url))
                );

                if (parsedTabs[0] && Array.isArray(parsedTabs[0].elements)) {
                    context.setInteractiveElements(parsedTabs[0].elements);
                }

                return {
                    success: true,
                    parsedTabs
                };
            }
        }),
        // parseCurrentPage: tool({
        //     description: 'MUST BE CALLED FIRST to see the page. Scans the page to get a list of elements that other tools can use. Example result format: { "id": "3", "markdownValue": "[button: Search]" }',
        //     inputSchema: z.object({
        //         tab_id: z.number().optional().describe('Optional specific tab id to target. If omitted, the first selected tab is used.')
        //     }),
        //     async execute({ tab_id }): Promise<ToolOutput> {
        //         console.log('разбор текущей страницы', tab_id);
        //         const targetTabId = resolveTabId(tab_id);
        //         const response = await context.sendMessageToTab({ type: 'PARSE_CURRENT_PAGE' }, targetTabId);
        //         if (!response || !response.data) {
        //             return { success: false, error: 'Failed to parse page.' };
        //         }
        //         context.setInteractiveElements(response.data);

        //         return {
        //             success: true,
        //             elements: response.data
        //         };
        //     }
        // }),

        parsePageText: tool({
            description: 'Gets meaningful text from the page for analysis (summaries, comparisons, Q&A). Does not collect interactive elements.',
            inputSchema: z.object({}),
            async execute(): Promise<ToolOutput> {
                const all = Array.isArray(context.tabs) ? context.tabs : [];
                if (all.length === 0) return { success: false, error: 'No tabs available in context.' };

                const parseOne = async (tid: number, title?: string, url?: string) => {
                    const response = await context.sendMessageToTab({ type: 'PARSE_PAGE_TEXT' }, tid);
                    const elements = Array.isArray(response?.data) ? response.data : [];
                    return { tabId: tid, title, url, elements };
                };

                const parsedTabs = await Promise.all(
                    all.map(t => parseOne(t.id, t.title, t.url))
                );

                if (parsedTabs[0] && Array.isArray(parsedTabs[0].elements)) {
                    context.setInteractiveElements(parsedTabs[0].elements);
                }

                return {
                    success: true,
                    parsedTabs
                };
            }
        }),

        findAndClick: tool({
            description: 'Clicks an element. Use `parsePageInteractiveElements` beforehand to build elements context. If only text is needed (no clicks), use `parsePageText` instead.',
            inputSchema: z.object({
                reasoning: z.string().describe("First, state the SUB-TASK you are currently working on (e.g., 'Navigate to favorites page'). Then, explain why clicking this element completes this sub-task."),
                element_description: z.string().describe("A specific description of the element to click, taken from the `elements` array.For example: 'the link with text \"Favorites\"' or 'button with class \"add-to-cart\".'"),
                tab_id: z.number().optional().describe('Optional specific tab id to target.')
            }),
            async execute({ reasoning, element_description, tab_id }): Promise<ToolOutput> {
                console.log(`findAndClick with reasoning: ${reasoning}`, element_description);
                updateLog(`${reasoning}. ${element_description}`);
                const elements = context.getInteractiveElements();
                if (elements.length === 0) return { success: false, error: 'Context is empty. Call `parsePageInteractiveElements` first.' };

                const elementIds = await findElementIds(elements, `Reason: ${reasoning}. Element description: ${element_description}`, context.aiService);

                if (!elementIds || elementIds.length === 0) return { success: false, error: `No element found for: ${element_description}` };

                for (const aid of elementIds) {
                    const targetTabId = resolveTabId(tab_id);
                    await context.sendMessageToTab({ type: 'CLICK_ON_ELEMENT', aid }, targetTabId);
                }

                return { success: true, clickedElements: elementIds.length };
            }
        }),

        findAndInsertText: tool({
            description: 'Types text into an input. Use `parsePageInteractiveElements` beforehand to build elements context. For read-only content questions, prefer `parsePageText`.',
            inputSchema: z.object({
                reasoning: z.string().describe('First, state the SUB-TASK you are currently working on. Then, explain why you are typing into this input.'),
                element_description: z.string().describe('A specific description of the target input, taken from the `elements` array.'),
                text: z.string().describe('The text to insert.'),
                tab_id: z.number().optional().describe('Optional specific tab id to target.')
            }),
            async execute({ reasoning, element_description, text, tab_id }): Promise<ToolOutput> {
                console.log(`findAndInsertText with reasoning: ${reasoning}`);
                const elements = context.getInteractiveElements();
                if (elements.length === 0) return { success: false, error: 'Context is empty. Call `parsePageInteractiveElements` first.' };
                const elementIds = await findElementIds(elements, element_description, context.aiService);
                if (!elementIds || elementIds.length === 0) return { success: false, error: `No input found for: ${element_description}` };
                const targetId = elementIds[0];
                const targetTabId = resolveTabId(tab_id);
                await context.sendMessageToTab({ type: 'INSERT_TEXT', aid: targetId, text }, targetTabId);
                return { success: true, elementId: targetId };
            }
        }),

        selectOption: tool({
            description: 'Selects an option in a <select> element by visible label or value. Build elements context first via `parsePageInteractiveElements`.',
            inputSchema: z.object({
                reasoning: z.string().describe('Explain why you need to select this option.'),
                element_description: z.string().describe('Description of the target select element, from elements list.'),
                option: z.string().describe('Option label or value to select.'),
                matchBy: z.enum(['label', 'value']).optional().describe('Match by label (default) or value.'),
                tab_id: z.number().optional().describe('Optional specific tab id to target.')
            }),
            async execute({ reasoning, element_description, option, matchBy, tab_id }): Promise<ToolOutput> {
                updateLog(`${reasoning}. Выбор опции "${option}".`);
                const elements = context.getInteractiveElements();
                if (elements.length === 0) return { success: false, error: 'Context is empty. Call `parsePageInteractiveElements` first.' };
                const elementIds = await findElementIds(elements, element_description, context.aiService);
                if (!elementIds || elementIds.length === 0) return { success: false, error: `No select found for: ${element_description}` };
                const targetId = elementIds[0];
                const targetTabId = resolveTabId(tab_id);
                await context.sendMessageToTab({ type: 'SELECT_OPTION', aid: targetId, option, matchBy }, targetTabId);
                return { success: true, elementId: targetId };
            }
        }),

        setCheckbox: tool({
            description: 'Sets a checkbox to checked or unchecked. Build elements context first via `parsePageInteractiveElements`.',
            inputSchema: z.object({
                reasoning: z.string().describe('Explain why you need to set this checkbox.'),
                element_description: z.string().describe('Description of the checkbox.'),
                checked: z.boolean().describe('Whether the checkbox should be checked.'),
                tab_id: z.number().optional().describe('Optional specific tab id to target.')
            }),
            async execute({ reasoning, element_description, checked, tab_id }): Promise<ToolOutput> {
                updateLog(`${reasoning}. Установка чекбокса: ${checked ? 'включен' : 'выключен'}.`);
                const elements = context.getInteractiveElements();
                if (elements.length === 0) return { success: false, error: 'Context is empty. Call `parsePageInteractiveElements` first.' };
                const elementIds = await findElementIds(elements, element_description, context.aiService);
                if (!elementIds || elementIds.length === 0) return { success: false, error: `No checkbox found for: ${element_description}` };
                const targetId = elementIds[0];
                const targetTabId = resolveTabId(tab_id);
                await context.sendMessageToTab({ type: 'SET_CHECKBOX', aid: targetId, checked }, targetTabId);
                return { success: true, elementId: targetId };
            }
        }),

        setRadio: tool({
            description: 'Selects a radio button in a radio group. Build elements context first via `parsePageInteractiveElements`.',
            inputSchema: z.object({
                reasoning: z.string().describe('Explain why you need to select this radio.'),
                element_description: z.string().describe('Description of the radio to select.'),
                tab_id: z.number().optional().describe('Optional specific tab id to target.')
            }),
            async execute({ reasoning, element_description, tab_id }): Promise<ToolOutput> {
                updateLog(`${reasoning}. Выбор радио-кнопки.`);
                const elements = context.getInteractiveElements();
                if (elements.length === 0) return { success: false, error: 'Context is empty. Call `parsePageInteractiveElements` first.' };
                const elementIds = await findElementIds(elements, element_description, context.aiService);
                if (!elementIds || elementIds.length === 0) return { success: false, error: `No radio found for: ${element_description}` };
                const targetId = elementIds[0];
                const targetTabId = resolveTabId(tab_id);
                await context.sendMessageToTab({ type: 'SET_RADIO', aid: targetId }, targetTabId);
                return { success: true, elementId: targetId };
            }
        }),

        finishTask: tool({
            description: 'Call this tool ONLY when all sub-tasks of the user\'s request have been fully completed.',
            inputSchema: z.object({
                final_answer: z.string().describe("A summary of the task's completion.")
            }),
            async execute({ final_answer }): Promise<ToolOutput> {
                return { success: true, answer: final_answer };
            }
        })
    };
};
