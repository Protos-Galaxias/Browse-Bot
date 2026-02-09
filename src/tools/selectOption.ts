// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext, ToolOutput } from './types';
import { findElementIds, resolveElementByRef } from './findElement';
import { resolveTabId, sendToTabOrThrow } from './utils';
import { updateLog, reportError } from '../logger';

export const selectOptionTool = (context: ToolContext) => tool({
    description: 'Selects an option in a <select> element. Provide `ref` from parsePage output (preferred) or `element_description` as fallback.',
    inputSchema: z.object({
        reasoning: z.string().describe('Explain why you need to select this option.'),
        ref: z.string().optional().describe("Element ref from parsePage output (e.g., '@9'). Preferred — skips element search."),
        element_description: z.string().optional().describe('Fallback: description of the target select element, from elements list.'),
        option: z.string().describe('Option label or value to select.'),
        matchBy: z.enum(['label', 'value']).optional().describe('Match by label (default) or value.')
    }),
    inputExamples: [
        {
            input: {
                reasoning: 'Sub-task: Set shipping country. Selecting from the dropdown.',
                ref: '@6',
                option: 'United States',
                matchBy: 'label' as const
            }
        },
        {
            input: {
                reasoning: 'Sub-task: Choose support category. No ref, using description.',
                element_description: 'select with label "Subject" or id "subject"',
                option: 'Technical Support',
                matchBy: 'label' as const
            }
        }
    ],
    async execute({ reasoning, ref, element_description, option, matchBy }): Promise<ToolOutput> {
        const desc = ref || element_description || '';
        updateLog({ type: 'ui', kind: 'form', titleKey: 'ui.titles.select', textKey: 'ui.texts.select', text: '', params: { reasoning, element: desc, option } });

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
                .catch((e) => { reportError(e, 'errors.sendMessageSelect'); return []; });

            if (!elementIds || elementIds.length === 0) {
                return { success: false, error: `No select found for: ${element_description}` };
            }
            targetId = elementIds[0];
            tid = elements.find((e: any) => e.id === targetId)?.tid;
        } else {
            return { success: false, error: 'Provide either `ref` (from parsePage output, e.g. "@9") or `element_description`.' };
        }

        const targetTabId = resolveTabId(context, tid);
        await sendToTabOrThrow(context, { type: 'SELECT_OPTION', aid: targetId, option, matchBy, tid }, targetTabId)
            .catch((e) => reportError(e, 'Failed to select option'));

        return { success: true, elementId: targetId };
    }
});
