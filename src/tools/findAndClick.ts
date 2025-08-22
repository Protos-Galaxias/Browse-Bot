import { tool } from 'ai';
import { z } from 'zod';
import { findElementIds } from './findElement';
import type { ToolContext, ToolOutput } from './types';
import { resolveTabId } from './utils';
import { updateLog } from '../logger';

export const findAndClickTool = (context: ToolContext) => tool({
    description: 'Clicks an element. Use `parsePage` (preferred) or `parsePageInteractiveElements` beforehand to build elements context. If only text is needed (no clicks), use `parsePageText` instead.',
    inputSchema: z.object({
        reasoning: z.string().describe("First, state the SUB-TASK you are currently working on (e.g., 'Navigate to favorites page'). Then, explain why clicking this element completes this sub-task."),
        element_description: z.string().describe("A specific description of the element to click, taken from the `elements` array.For example: 'the link with text \"Favorites\"' or 'button with class \"add-to-cart\".'")
    }),
    async execute({ reasoning, element_description }): Promise<ToolOutput> {
        console.log(`findAndClick with reasoning: ${reasoning}`, element_description);
        updateLog(`${reasoning}. ${element_description}`);
        const elements = context.getInteractiveElements();
        if (elements.length === 0) return { success: false, error: 'Context is empty. Call `parsePage` or `parsePageInteractiveElements` first.' };

        const elementIds = await findElementIds(elements, `Reason: ${reasoning}. Element description: ${element_description}`, context.aiService);

        if (!elementIds || elementIds.length === 0) return { success: false, error: `No element found for: ${element_description}` };

        for (const aid of elementIds) {
            const elementMeta = elements.find(e => e.id === aid);
            const tid = elementMeta?.tid;
            const targetTabId = resolveTabId(context, tid);

            // Ask content script about link and target
            const info = await context.sendMessageToTab({ type: 'GET_LINK_INFO', aid, tid }, targetTabId).catch(() => null);
            console.log('info', info);
            const href = info?.href as string | null | undefined;
            const isBlank = Boolean(info?.targetBlank);

            if (href && isBlank) {
                console.log('open link', href);
                // Open via background (worker)
                await context.sendMessageToTab({ type: 'OPEN_LINK', aid, tid }, targetTabId);
            } else {
                console.log('click element', aid, tid);
                // Fallback to regular click
                await context.sendMessageToTab({ type: 'CLICK_ON_ELEMENT', aid, tid }, targetTabId);
            }
        }

        return { success: true, clickedElements: elementIds.length };
    }
});


