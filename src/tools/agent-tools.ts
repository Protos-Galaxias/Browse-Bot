import { tool } from 'ai';
import { z } from 'zod';
import { findElementIds } from './findElement';
import type { AIService as AIServiceType } from '../services/AIService';
import { updateLog } from '../logger';

export interface ToolContext {
    aiService: AIServiceType;
    tabId: number;
    getInteractiveElements: () => any[];
    setInteractiveElements: (elements: any[]) => void;
    sendMessageToTab: (message: any) => Promise<any>;
}

type ToolOutput = {
    success: boolean;
    error?: string;
    [key: string]: any;
};

export const agentTools = (context: ToolContext) => ({
    parseCurrentPage: tool({
        description: 'MUST BE CALLED FIRST to see the page. Scans the page to get a list of elements that other tools can use. Example result format: { "id": "3", "markdownValue": "[button: Search]" }',
        inputSchema: z.object({}),
        async execute(): Promise<ToolOutput> {
            console.log('разбор текущей страницы');
            const response = await context.sendMessageToTab({ type: 'PARSE_CURRENT_PAGE' });
            if (!response || !response.data) {
                return { success: false, error: 'Failed to parse page.' };
            }
            context.setInteractiveElements(response.data);

            return {
                success: true,
                elements: response.data
            };
        }
    }),

    findAndClick: tool({
        description: 'Clicks an element. CRITICAL: After this action, the page will change. You MUST call `parseCurrentPage` again in the next step.',
        inputSchema: z.object({
            reasoning: z.string().describe("First, state the SUB-TASK you are currently working on (e.g., 'Navigate to favorites page'). Then, explain why clicking this element completes this sub-task."),
            element_description: z.string().describe("A specific description of the element to click, taken from the `elements` array.For example: 'the link with text \"Favorites\"' or 'button with class \"add-to-cart\".'")
        }),
        async execute({ reasoning, element_description }): Promise<ToolOutput> {
            console.log(`findAndClick with reasoning: ${reasoning}`, element_description);
            updateLog(`${reasoning}. ${element_description}`);
            const elements = context.getInteractiveElements();
            if (elements.length === 0) return { success: false, error: 'Context is empty. Call `parseCurrentPage` first.' };

            const elementIds = await findElementIds(elements, `Reason: ${reasoning}. Element description: ${element_description}`, context.aiService);

            if (!elementIds || elementIds.length === 0) return { success: false, error: `No element found for: ${element_description}` };

            for (const aid of elementIds) {
                await context.sendMessageToTab({ type: 'CLICK_ON_ELEMENT', aid });
            }

            return { success: true, clickedElements: elementIds.length };
        }
    }),

    findAndInsertText: tool({
        description: 'Types text into an input. CRITICAL: After this action, you will likely need to click a search button and then call `parseCurrentPage` again.',
        inputSchema: z.object({
            reasoning: z.string().describe('First, state the SUB-TASK you are currently working on. Then, explain why you are typing into this input.'),
            element_description: z.string().describe('A specific description of the target input, taken from the `elements` array.'),
            text: z.string().describe('The text to insert.')
        }),
        async execute({ reasoning, element_description, text }): Promise<ToolOutput> {
            console.log(`findAndInsertText with reasoning: ${reasoning}`);
            const elements = context.getInteractiveElements();
            if (elements.length === 0) return { success: false, error: 'Context is empty. Call `parseCurrentPage` first.' };
            const elementIds = await findElementIds(elements, element_description, context.aiService);
            if (!elementIds || elementIds.length === 0) return { success: false, error: `No input found for: ${element_description}` };
            const targetId = elementIds[0];
            await context.sendMessageToTab({ type: 'INSERT_TEXT', aid: targetId, text });
            return { success: true, elementId: targetId };
        }
    }),

    selectOption: tool({
        description: 'Selects an option in a <select> element by visible label or value.',
        inputSchema: z.object({
            reasoning: z.string().describe('Explain why you need to select this option.'),
            element_description: z.string().describe('Description of the target select element, from elements list.'),
            option: z.string().describe('Option label or value to select.'),
            matchBy: z.enum(['label', 'value']).optional().describe('Match by label (default) or value.')
        }),
        async execute({ reasoning, element_description, option, matchBy }): Promise<ToolOutput> {
            updateLog(`${reasoning}. Выбор опции "${option}".`);
            const elements = context.getInteractiveElements();
            if (elements.length === 0) return { success: false, error: 'Context is empty. Call `parseCurrentPage` first.' };
            const elementIds = await findElementIds(elements, element_description, context.aiService);
            if (!elementIds || elementIds.length === 0) return { success: false, error: `No select found for: ${element_description}` };
            const targetId = elementIds[0];
            await context.sendMessageToTab({ type: 'SELECT_OPTION', aid: targetId, option, matchBy });
            return { success: true, elementId: targetId };
        }
    }),

    setCheckbox: tool({
        description: 'Sets a checkbox to checked or unchecked.',
        inputSchema: z.object({
            reasoning: z.string().describe('Explain why you need to set this checkbox.'),
            element_description: z.string().describe('Description of the checkbox.'),
            checked: z.boolean().describe('Whether the checkbox should be checked.')
        }),
        async execute({ reasoning, element_description, checked }): Promise<ToolOutput> {
            updateLog(`${reasoning}. Установка чекбокса: ${checked ? 'включен' : 'выключен'}.`);
            const elements = context.getInteractiveElements();
            if (elements.length === 0) return { success: false, error: 'Context is empty. Call `parseCurrentPage` first.' };
            const elementIds = await findElementIds(elements, element_description, context.aiService);
            if (!elementIds || elementIds.length === 0) return { success: false, error: `No checkbox found for: ${element_description}` };
            const targetId = elementIds[0];
            await context.sendMessageToTab({ type: 'SET_CHECKBOX', aid: targetId, checked });
            return { success: true, elementId: targetId };
        }
    }),

    setRadio: tool({
        description: 'Selects a radio button in a radio group.',
        inputSchema: z.object({
            reasoning: z.string().describe('Explain why you need to select this radio.'),
            element_description: z.string().describe('Description of the radio to select.')
        }),
        async execute({ reasoning, element_description }): Promise<ToolOutput> {
            updateLog(`${reasoning}. Выбор радио-кнопки.`);
            const elements = context.getInteractiveElements();
            if (elements.length === 0) return { success: false, error: 'Context is empty. Call `parseCurrentPage` first.' };
            const elementIds = await findElementIds(elements, element_description, context.aiService);
            if (!elementIds || elementIds.length === 0) return { success: false, error: `No radio found for: ${element_description}` };
            const targetId = elementIds[0];
            await context.sendMessageToTab({ type: 'SET_RADIO', aid: targetId });
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
});
