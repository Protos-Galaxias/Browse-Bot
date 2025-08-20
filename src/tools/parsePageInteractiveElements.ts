import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext, ToolOutput } from './types';

export const parsePageInteractiveElementsTool = (context: ToolContext) => tool({
    description: 'Scans all tabs from context and returns their parsed elements in parsedTabs. Also updates interactive elements with the first parsed tab for compatibility.',
    inputSchema: z.object({}),
    async execute(): Promise<ToolOutput> {
        const all = Array.isArray(context.tabs) ? context.tabs : [];
        if (all.length === 0) return { success: false, error: 'No tabs available in context.' };

        const parseOne = async (tid: number, title?: string, url?: string) => {
            const response = await context.sendMessageToTab({ type: 'PARSE_CURRENT_PAGE', tid }, tid);
            const elements = Array.isArray(response?.data) ? response.data : [];
            return { tabId: tid, title, url, elements };
        };

        const parsedTabs = await Promise.all(
            all.map(t => parseOne(t.id, t.title, t.url))
        );

        const aggregated = parsedTabs.flatMap(t => Array.isArray(t.elements) ? t.elements : []);
        if (aggregated.length > 0) {
            context.setInteractiveElements(aggregated);
        }

        return {
            success: true,
            parsedTabs
        };
    }
});


