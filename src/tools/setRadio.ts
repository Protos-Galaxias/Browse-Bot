import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext, ToolOutput } from './types';
import { findElementIds } from './findElement';
import { resolveTabId } from './utils';
import { updateLog } from '../logger';

export const setRadioTool = (context: ToolContext) => tool({
    description: 'Selects a radio button in a radio group. Build elements context first via `parsePage` (preferred) or `parsePageInteractiveElements`.',
    inputSchema: z.object({
        reasoning: z.string().describe('Explain why you need to select this radio.'),
        element_description: z.string().describe('Description of the radio to select.')
    }),
    async execute({ reasoning, element_description }): Promise<ToolOutput> {
        updateLog(`${reasoning}. Выбор радио-кнопки.`);
        const elements = context.getInteractiveElements();
        if (elements.length === 0) return { success: false, error: 'Context is empty. Call `parsePage` or `parsePageInteractiveElements` first.' };
        const elementIds = await findElementIds(elements, element_description, context.aiService);
        if (!elementIds || elementIds.length === 0) return { success: false, error: `No radio found for: ${element_description}` };
        const targetId = elementIds[0];
        const tid = elements.find(e => e.id === targetId)?.tid;
        const targetTabId = resolveTabId(context, tid);
        await context.sendMessageToTab({ type: 'SET_RADIO', aid: targetId, tid }, targetTabId);
        return { success: true, elementId: targetId };
    }
});


