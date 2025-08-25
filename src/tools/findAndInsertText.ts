import { tool } from 'ai';
import { z } from 'zod';
import { findElementIds } from './findElement';
import type { ToolContext, ToolOutput } from './types';
import { resolveTabId } from './utils';

export const findAndInsertTextTool = (context: ToolContext) => tool({
    description: 'Types text into an input. Use `parsePage` (preferred) or `parsePageInteractiveElements` beforehand to build elements context. For read-only content questions, prefer `parsePageText`.',
    inputSchema: z.object({
        reasoning: z.string().describe('First, state the SUB-TASK you are currently working on. Then, explain why you are typing into this input.'),
        element_description: z.string().describe('A specific description of the target input, taken from the `elements` array.'),
        text: z.string().describe('The text to insert.')
    }),
    async execute({ reasoning, element_description, text }): Promise<ToolOutput> {
        console.log(`findAndInsertText with reasoning: ${reasoning}`);
        const elements = context.getInteractiveElements();
        if (elements.length === 0) return { success: false, error: 'Context is empty. Call `parsePage` or `parsePageInteractiveElements` first.' };
        const elementIds = await findElementIds(elements, element_description, context.aiService);
        if (!elementIds || elementIds.length === 0) return { success: false, error: `No input found for: ${element_description}` };
        const targetId = elementIds[0];
        const tid = elements.find(e => e.id === targetId)?.tid;
        const targetTabId = resolveTabId(context, tid);
        await context.sendMessageToTab({ type: 'INSERT_TEXT', aid: targetId, text, tid }, targetTabId);
        // Heuristic: If user is searching (common cases), press Enter to submit search when no explicit search button is guaranteed
        const lower = (element_description + ' ' + reasoning).toLowerCase();
        const likelySearch = /search|поиск|найти|query|поисков/gi.test(lower);
        if (likelySearch) {
            await context.sendMessageToTab({ type: 'PRESS_ENTER', aid: targetId, tid }, targetTabId);
        }
        return { success: true, elementId: targetId };
    }
});


