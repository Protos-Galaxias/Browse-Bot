// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext, ToolOutput } from './types';
import { findElementIds, resolveElementByRef } from './findElement';
import { resolveTabId, sendToTabOrThrow } from './utils';
import { updateLog, reportError } from '../logger';

export const setCheckboxTool = (context: ToolContext) => tool({
    description: 'Sets a checkbox to checked or unchecked. Provide `ref` from parsePage output (preferred) or `element_description` as fallback.',
    inputSchema: z.object({
        reasoning: z.string().describe('Explain why you need to set this checkbox.'),
        ref: z.string().optional().describe("Element ref from parsePage output (e.g., '@11'). Preferred — skips element search."),
        element_description: z.string().optional().describe('Fallback: description of the checkbox.'),
        checked: z.boolean().describe('Whether the checkbox should be checked.')
    }),
    async execute({ reasoning, ref, element_description, checked }): Promise<ToolOutput> {
        const desc = ref || element_description || '';
        updateLog({ type: 'ui', kind: 'form', titleKey: 'ui.titles.checkbox', textKey: checked ? 'ui.texts.checkboxOn' : 'ui.texts.checkboxOff', text: '', params: { reasoning, element: desc } });

        const elements = context.getInteractiveElements();
        if (elements.length === 0) {
            return { success: false, error: 'Context is empty. Call `parsePage` first to get element refs.' };
        }

        let targetId: string;
        let tid: number | undefined;

        if (ref) {
            const resolved = resolveElementByRef(elements, ref);
            if (!resolved) {
                return { success: false, error: `Ref ${ref} not found in current elements. Call \`parsePage\` to refresh.` };
            }
            targetId = resolved.id;
            tid = resolved.tid;
        } else if (element_description) {
            const elementIds = await findElementIds(elements, element_description, context.aiService)
                .catch((e) => { reportError(e, 'errors.sendMessageCheckbox'); return []; });

            if (!elementIds || elementIds.length === 0) {
                return { success: false, error: `No checkbox found for: ${element_description}` };
            }
            targetId = elementIds[0];
            tid = elements.find((e: any) => e.id === targetId)?.tid;
        } else {
            return { success: false, error: 'Provide either `ref` (from parsePage output) or `element_description`.' };
        }

        const targetTabId = resolveTabId(context, tid);
        await sendToTabOrThrow(context, { type: 'SET_CHECKBOX', aid: targetId, checked, tid }, targetTabId)
            .catch((e) => reportError(e, 'Failed to set checkbox'));

        return { success: true, elementId: targetId };
    }
});
