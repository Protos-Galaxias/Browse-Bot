// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { tool } from 'ai';
import { z } from 'zod';
import { findElementIds } from './findElement';
import type { ToolContext, ToolOutput } from './types';
import { resolveTabId, sendToTabOrThrow } from './utils';
import { reportError, updateLog } from '../logger';

export const findAndInsertTextTool = (context: ToolContext) => tool({
    description: 'Types text into an input. Use `parsePage` (preferred) or `parsePageInteractiveElements` beforehand to build elements context. For read-only content questions, prefer `parsePageText`.',
    inputSchema: z.object({
        reasoning: z.string().describe('First, state the SUB-TASK you are currently working on. Then, explain why you are typing into this input.'),
        element_description: z.string().describe('A specific description of the target input, taken from the `elements` array.'),
        text: z.string().describe('The text to insert.')
    }),
    async execute({ reasoning, element_description, text }): Promise<ToolOutput> {
        console.log(`findAndInsertText with reasoning: ${reasoning}`);
        updateLog({ type: 'ui', kind: 'form', title: 'Ввели текст', text: `${reasoning}. ${element_description}. Текст: "${text}"` });
        const elements = context.getInteractiveElements();
        if (elements.length === 0) {
            return { success: false, error: 'Context is empty. Call `parsePage` or `parsePageInteractiveElements` first.' };
        }
        const elementIds = await findElementIds(elements, element_description, context.aiService).catch((e) => { reportError(e, 'errors.sendMessageInsert'); return []; });
        if (!elementIds || elementIds.length === 0) return { success: false, error: `No input found for: ${element_description}` };
        const targetId = elementIds[0];
        const tid = elements.find(e => e.id === targetId)?.tid;
        const targetTabId = resolveTabId(context, tid);
        await sendToTabOrThrow(context, { type: 'INSERT_TEXT', aid: targetId, text, tid }, targetTabId).catch((e) => reportError(e, 'Не удалось ввести текст'));
        // Heuristic: If user is searching (common cases), press Enter to submit search when no explicit search button is guaranteed
        const lower = (element_description + ' ' + reasoning).toLowerCase();
        const likelySearch = /search|поиск|найти|query|поисков/gi.test(lower);
        if (likelySearch) {
            await sendToTabOrThrow(context, { type: 'PRESS_ENTER', aid: targetId, tid }, targetTabId).catch((e) => reportError(e, 'Не удалось нажать Enter'));
        }
        return { success: true, elementId: targetId };
    }
});


