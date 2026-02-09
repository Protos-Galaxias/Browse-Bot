// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { tool } from 'ai';
import { z } from 'zod';
import { findElementIds, resolveElementByRef } from './findElement';
import type { ToolContext, ToolOutput } from './types';
import { resolveTabId, sendToTabOrThrow } from './utils';
import { updateLog, reportErrorKey, updateLogI18n } from '../logger';

export const findAndClickTool = (context: ToolContext) => tool({
    description: 'Clicks an element on the page. Provide `ref` from parsePage output (preferred) or `element_description` as fallback. Call `parsePage` first to get element refs.',
    inputSchema: z.object({
        reasoning: z.string().describe("First, state the SUB-TASK you are currently working on (e.g., 'Navigate to favorites page'). Then, explain why clicking this element completes this sub-task."),
        ref: z.string().optional().describe("Element ref from parsePage output (e.g., '@5'). Preferred — skips element search."),
        element_description: z.string().optional().describe("Fallback: natural language description of the element to click, from the elements list.")
    }),
    inputExamples: [
        {
            input: {
                reasoning: 'Sub-task: Add product to cart. Clicking the "Add to Cart" button.',
                ref: '@3'
            }
        },
        {
            input: {
                reasoning: 'Sub-task: Navigate to login page. Clicking the Sign In link.',
                ref: '@12'
            }
        },
        {
            input: {
                reasoning: 'Sub-task: Submit the search form. No ref available, using description.',
                element_description: 'button with type "submit" or aria-label "Search" inside the search form'
            }
        }
    ],
    async execute({ reasoning, ref, element_description }): Promise<ToolOutput> {
        const desc = ref || element_description || '';
        console.log(`findAndClick with reasoning: ${reasoning}`, desc);
        updateLog({ type: 'ui', kind: 'click', titleKey: 'ui.titles.clicked', textKey: 'ui.texts.click', text: '', params: { reasoning, element: desc } });

        const elements = context.getInteractiveElements();
        if (elements.length === 0) {
            updateLogI18n('errors.noElementsContext', undefined, 'error');

            return { success: false, error: 'Context is empty. Call `parsePage` first to get element refs.' };
        }

        // Resolve element(s) — ref path is direct (no LLM call)
        let resolvedElements: Array<{ id: string; tid?: number }> = [];

        console.log(`[findAndClick] mode=${ref ? 'REF' : 'DESCRIPTION'}`, ref || element_description);

        if (ref) {
            const resolved = resolveElementByRef(elements, ref);
            if (!resolved) {
                return { success: false, error: `Ref ${ref} not found in current elements. Call \`parsePage\` to refresh.` };
            }
            resolvedElements = [resolved];
        } else if (element_description) {
            const elementIds = await findElementIds(elements, element_description, context.aiService)
                .catch((e) => { reportErrorKey('errors.elementNotFound', e, { description: element_description }); return []; });

            if (!elementIds || elementIds.length === 0) {
                updateLogI18n('errors.elementNotFound', { description: element_description }, 'error');

                return { success: false, error: `No element found for: ${element_description}` };
            }
            resolvedElements = elementIds.map(aid => {
                const el = elements.find((e: any) => e.id === aid);

                return { id: aid, tid: el?.tid };
            });
        } else {
            return { success: false, error: 'Provide either `ref` (from parsePage output, e.g. "@5") or `element_description`.' };
        }

        for (const { id: aid, tid } of resolvedElements) {
            const targetTabId = resolveTabId(context, tid);

            const info = await sendToTabOrThrow(context, { type: 'GET_LINK_INFO', aid, tid }, targetTabId)
                .catch((e) => { reportErrorKey('errors.sendMessageGetLinkInfo', e); return null; });
            const href = info?.href as string | null | undefined;
            const isBlank = Boolean(info?.targetBlank);

            if (href && isBlank) {
                await sendToTabOrThrow(context, { type: 'OPEN_LINK', aid, tid }, targetTabId)
                    .catch((e) => reportErrorKey('errors.sendMessageOpenLink', e));
            } else {
                await sendToTabOrThrow(context, { type: 'CLICK_ON_ELEMENT', aid, tid }, targetTabId)
                    .catch((e) => reportErrorKey('errors.sendMessageClick', e));
            }
        }

        return { success: true, clickedElements: resolvedElements.length };
    }
});
