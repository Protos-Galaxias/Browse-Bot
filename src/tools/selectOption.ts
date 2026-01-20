// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext, ToolOutput } from './types';
import { findElementIds } from './findElement';
import { resolveTabId, sendToTabOrThrow } from './utils';
import { updateLog, reportError } from '../logger';

export const selectOptionTool = (context: ToolContext) => tool({
    description: 'Selects an option in a <select> element by visible label or value. Build elements context first via `parsePage` (preferred) or `parsePageInteractiveElements`.',
    inputSchema: z.object({
        reasoning: z.string().describe('Explain why you need to select this option.'),
        element_description: z.string().describe('Description of the target select element, from elements list.'),
        option: z.string().describe('Option label or value to select.'),
        matchBy: z.enum(['label', 'value']).optional().describe('Match by label (default) or value.')
    }),
    async execute({ reasoning, element_description, option, matchBy }): Promise<ToolOutput> {
        updateLog({ type: 'ui', kind: 'form', titleKey: 'ui.titles.select', textKey: 'ui.texts.select', text: '', params: { reasoning, element: element_description, option } });
        const elements = context.getInteractiveElements();
        if (elements.length === 0) return { success: false, error: 'Context is empty. Call `parsePage` or `parsePageInteractiveElements` first.' };
        const elementIds = await findElementIds(elements, element_description, context.aiService).catch((e) => { reportError(e, 'errors.sendMessageSelect'); return []; });
        if (!elementIds || elementIds.length === 0) return { success: false, error: `No select found for: ${element_description}` };
        const targetId = elementIds[0];
        const tid = elements.find(e => e.id === targetId)?.tid;
        const targetTabId = resolveTabId(context, tid);
        await sendToTabOrThrow(context, { type: 'SELECT_OPTION', aid: targetId, option, matchBy, tid }, targetTabId).catch((e) => reportError(e, 'Failed to select option'));
        return { success: true, elementId: targetId };
    }
});


