// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { tool } from 'ai';
import { z } from 'zod';
import { findElementIds, resolveElementByRef } from './findElement';
import type { ToolContext, ToolOutput } from './types';
import { resolveTabId, sendToTabOrThrow } from './utils';
import { reportError, reportErrorKey, updateLog } from '../logger';

export const findAndInsertTextTool = (context: ToolContext) => tool({
    description: 'Types text into an input field. Provide `ref` from parsePage output (preferred) or `element_description` as fallback. Call `parsePage` first to get element refs.',
    inputSchema: z.object({
        reasoning: z.string().describe('First, state the SUB-TASK you are currently working on. Then, explain why you are typing into this input.'),
        ref: z.string().optional().describe("Element ref from parsePage output (e.g., '@7'). Preferred — skips element search."),
        element_description: z.string().optional().describe('Fallback: natural language description of the target input, from the elements list.'),
        text: z.string().describe('The text to insert.')
    }),
    inputExamples: [
        {
            input: {
                reasoning: 'Sub-task: Search for a product. Typing the query into the search bar.',
                ref: '@4',
                text: 'wireless headphones'
            }
        },
        {
            input: {
                reasoning: 'Sub-task: Log in. Entering the email address.',
                ref: '@8',
                text: 'user@example.com'
            }
        },
        {
            input: {
                reasoning: 'Sub-task: Fill contact form. No ref available, using description.',
                element_description: 'textarea with label "Message" or name "message"',
                text: 'I need help with my account settings.'
            }
        }
    ],
    async execute({ reasoning, ref, element_description, text }): Promise<ToolOutput> {
        const desc = ref || element_description || '';
        console.log(`findAndInsertText with reasoning: ${reasoning}`, desc);
        updateLog({ type: 'ui', kind: 'form', titleKey: 'ui.titles.typed', textKey: 'ui.texts.insert', text: '', params: { reasoning, element: desc, text } });

        const elements = context.getInteractiveElements();
        if (elements.length === 0) {
            return { success: false, error: 'Context is empty. Call `parsePage` first to get element refs.' };
        }

        let targetId: string;
        let tid: number | undefined;

        console.log(`[findAndInsertText] mode=${ref ? 'REF' : 'DESCRIPTION'}`, ref || element_description);

        if (ref) {
            const resolved = resolveElementByRef(elements, ref);
            if (!resolved) {
                return { success: false, error: `Ref ${ref} not found in current elements. Call \`parsePage\` to refresh.` };
            }
            targetId = resolved.id;
            tid = resolved.tid;
        } else if (element_description) {
            const elementIds = await findElementIds(elements, element_description, context.aiService)
                .catch((e) => { reportError(e, 'errors.sendMessageInsert'); return []; });

            if (!elementIds || elementIds.length === 0) {
                return { success: false, error: `No input found for: ${element_description}` };
            }
            targetId = elementIds[0];
            tid = elements.find((e: any) => e.id === targetId)?.tid;
        } else {
            return { success: false, error: 'Provide either `ref` (from parsePage output, e.g. "@7") or `element_description`.' };
        }

        const targetTabId = resolveTabId(context, tid);
        await sendToTabOrThrow(context, { type: 'INSERT_TEXT', aid: targetId, text, tid }, targetTabId)
            .catch((e) => reportErrorKey('errors.sendMessageInsert', e));

        // Heuristic: auto-submit search inputs
        const lower = ((element_description || '') + ' ' + reasoning).toLowerCase();
        const likelySearch = /search|поиск|найти|query|поисков/gi.test(lower);
        if (likelySearch) {
            await sendToTabOrThrow(context, { type: 'PRESS_ENTER', aid: targetId, tid }, targetTabId)
                .catch((e) => reportErrorKey('errors.sendMessageEnter', e));
        }

        return { success: true, elementId: targetId };
    }
});
