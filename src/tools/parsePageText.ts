import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext, ToolOutput } from './types';

export const parsePageTextTool = (context: ToolContext) => tool({
    description: 'Gets meaningful text from the page for analysis (summaries, comparisons, Q&A). Does not collect interactive elements.',
    inputSchema: z.object({}),
    async execute(): Promise<ToolOutput> {
        const all = Array.isArray(context.tabs) ? context.tabs : [];
        if (all.length === 0) return { success: false, error: 'No tabs available in context.' };

        const parseOne = async (tid: number, title?: string, url?: string) => {
            const response = await context.sendMessageToTab({ type: 'PARSE_PAGE_TEXT' }, tid);
            const elements = Array.isArray(response?.data) ? response.data : [];
            return { tabId: tid, title, url, elements };
        };

        const parsedTabs = await Promise.all(
            all.map(t => parseOne(t.id, t.title, t.url))
        );

        return {
            success: true,
            parsedTabs
        };
    }
});


