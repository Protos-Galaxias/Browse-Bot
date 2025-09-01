import { tool } from 'ai';
import { z } from 'zod';
import { findElementIds } from './findElement';
import type { ToolContext, ToolOutput } from './types';
import { resolveTabId, sendToTabOrThrow } from './utils';
import { updateLog, reportErrorKey, updateLogI18n } from '../logger';

export const findAndClickTool = (context: ToolContext) => tool({
    description: 'Clicks an element. Use `parsePage` (preferred) or `parsePageInteractiveElements` beforehand to build elements context. If only text is needed (no clicks), use `parsePageText` instead.',
    inputSchema: z.object({
        reasoning: z.string().describe("First, state the SUB-TASK you are currently working on (e.g., 'Navigate to favorites page'). Then, explain why clicking this element completes this sub-task."),
        element_description: z.string().describe("A specific description of the element to click, taken from the `elements` array.For example: 'the link with text \"Favorites\"' or 'button with class \"add-to-cart\".'")
    }),
    async execute({ reasoning, element_description }): Promise<ToolOutput> {
        console.log(`findAndClick with reasoning: ${reasoning}`, element_description);
        updateLog({ type: 'ui', kind: 'click', title: 'Нажали', text: `${reasoning}. ${element_description}` });
        const elements = context.getInteractiveElements();
        if (elements.length === 0) {
            updateLogI18n('errors.noElementsContext', undefined, 'error');
            return { success: false, error: 'Context is empty. Call `parsePage` or `parsePageInteractiveElements` first.' };
        }

        const elementIds = await findElementIds(elements, element_description, context.aiService).catch((e) => { reportErrorKey('errors.elementNotFound', e, { description: element_description }); return []; });

        if (!elementIds || elementIds.length === 0) {
            updateLogI18n('errors.elementNotFound', { description: element_description }, 'error');
            return { success: false, error: `No element found for: ${element_description}` };
        }

        for (const aid of elementIds) {
            const elementMeta = elements.find(e => e.id === aid);
            const tid = elementMeta?.tid;
            const targetTabId = resolveTabId(context, tid);

            // Ask content script about link and target
            const info = await sendToTabOrThrow(context, { type: 'GET_LINK_INFO', aid, tid }, targetTabId).catch((e) => { reportErrorKey('errors.sendMessageGetLinkInfo', e); return null; });
            console.log('info', info);
            const href = info?.href as string | null | undefined;
            const isBlank = Boolean(info?.targetBlank);

            if (href && isBlank) {
                console.log('open link', href);
                // Open via background (worker)
                await sendToTabOrThrow(context, { type: 'OPEN_LINK', aid, tid }, targetTabId).catch((e) => reportErrorKey('errors.sendMessageOpenLink', e));
            } else {
                console.log('click element', aid, tid);
                // Fallback to regular click
                await sendToTabOrThrow(context, { type: 'CLICK_ON_ELEMENT', aid, tid }, targetTabId).catch((e) => reportErrorKey('errors.sendMessageClick', e));
            }
        }

        return { success: true, clickedElements: elementIds.length };
    }
});


