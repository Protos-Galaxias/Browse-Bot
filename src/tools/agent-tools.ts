import { tool } from 'ai';
import { z } from 'zod';
import { findElementIds } from './findElement';
import type { AIService as AIServiceType } from '../services/AIService';

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
        description: 'MUST BE CALLED FIRST to see the page. Scans the page to get a list of elements that other tools can use.',
        parameters: z.object({}),
        async execute({}: {}): Promise<ToolOutput> {
            console.log('parseCurrentPage');
            const response = await context.sendMessageToTab({ type: 'PARSE_CURRENT_PAGE' });
            if (!response || !response.data) {
                return { success: false, error: "Failed to parse page." };
            }
            context.setInteractiveElements(response.data);
            
            const elementDataForLLM = response.data.map((el: any) => ({
                id: el.id,
                markdownValue: el.markdownValue
            })).slice(0, 50);
            
            return { 
                success: true, 
                elements: elementDataForLLM 
            };
        }
    }),

    findAndClick: tool({
        description: 'Use this tool to click an element AFTER getting the `elements` list from `parseCurrentPage`.',
        parameters: z.object({
            reasoning: z.string().describe("Why you are clicking this element."),
            element_description: z.string().describe("Description of the element to click, based on the `elements` from `parseCurrentPage` output.")
        }),
        async execute({ element_description }): Promise<ToolOutput> {
            console.log('findAndClick');
            const elements = context.getInteractiveElements();
            if (elements.length === 0) return { success: false, error: "Context is empty. Call `parseCurrentPage` first." };
            const elementIds = await findElementIds(elements, element_description, context.aiService);
            if (!elementIds || elementIds.length === 0) return { success: false, error: `No element found for: ${element_description}` };
            for (const aid of elementIds) {
                await context.sendMessageToTab({ type: 'CLICK_ON_ELEMENT', aid });
            }
            return { success: true, clickedElements: elementIds.length };
        }
    }),

    findAndInsertText: tool({
        description: 'Use this tool to type into an input AFTER getting the `elements` list from `parseCurrentPage`.',
        parameters: z.object({
            reasoning: z.string().describe("Why you are inserting text here."),
            element_description: z.string().describe('Description of the target input, based on the `elements` from `parseCurrentPage` output.'),
            text: z.string().describe('The text to insert.')
        }),
        async execute({ element_description, text }): Promise<ToolOutput> {
            console.log('findAndInsertText');
            const elements = context.getInteractiveElements();
            if (elements.length === 0) return { success: false, error: "Context is empty. Call `parseCurrentPage` first." };
            const elementIds = await findElementIds(elements, element_description, context.aiService);
            if (!elementIds || elementIds.length === 0) return { success: false, error: `No input found for: ${element_description}` };
            const targetId = elementIds[0];
            await context.sendMessageToTab({ type: 'INSERT_TEXT_AND_SEARCH', aid: targetId, text });
            return { success: true, elementId: targetId };
        }
    }),

    finishTask: tool({
        description: 'Call this tool ONLY when the user\'s request has been fully completed. This is the final step.',
        parameters: z.object({
            final_answer: z.string().describe("The final summary of the task's completion.")
        }),
        async execute({ final_answer }): Promise<ToolOutput> {
            console.log('finishTask called');
            return { success: true, answer: final_answer };
        }
    })
});
