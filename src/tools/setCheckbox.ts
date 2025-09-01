import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext, ToolOutput } from './types';
import { findElementIds } from './findElement';
import { resolveTabId, sendToTabOrThrow } from './utils';
import { updateLog, reportError } from '../logger';

export const setCheckboxTool = (context: ToolContext) => tool({
    description: 'Sets a checkbox to checked or unchecked. Build elements context first via `parsePage` (preferred) or `parsePageInteractiveElements`.',
    inputSchema: z.object({
        reasoning: z.string().describe('Explain why you need to set this checkbox.'),
        element_description: z.string().describe('Description of the checkbox.'),
        checked: z.boolean().describe('Whether the checkbox should be checked.')
    }),
    async execute({ reasoning, element_description, checked }): Promise<ToolOutput> {
        updateLog({ type: 'ui', kind: 'form', title: 'Нажали на чекбокс', text: `${reasoning}. Установка чекбокса: ${checked ? 'включен' : 'выключен'}. ${element_description}` });
        const elements = context.getInteractiveElements();
        if (elements.length === 0) return { success: false, error: 'Context is empty. Call `parsePage` or `parsePageInteractiveElements` first.' };
        const elementIds = await findElementIds(elements, element_description, context.aiService).catch((e) => { reportError(e, 'errors.sendMessageCheckbox'); return []; });
        if (!elementIds || elementIds.length === 0) return { success: false, error: `No checkbox found for: ${element_description}` };
        const targetId = elementIds[0];
        const tid = elements.find(e => e.id === targetId)?.tid;
        const targetTabId = resolveTabId(context, tid);
        await sendToTabOrThrow(context, { type: 'SET_CHECKBOX', aid: targetId, checked, tid }, targetTabId).catch((e) => reportError(e, 'Не удалось установить чекбокс'));
        return { success: true, elementId: targetId };
    }
});


