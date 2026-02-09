// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext, ToolOutput } from './types';
import { reportError, updateLog } from '../logger';

export const parsePageTextTool = (context: ToolContext) => tool({
    description: 'Gets meaningful text from the page for analysis (summaries, comparisons, Q&A). Does not collect interactive elements.',
    inputSchema: z.object({}),
    async execute(): Promise<ToolOutput> {
        updateLog({ type: 'ui', kind: 'parse', titleKey: 'ui.titles.parsed', textKey: 'ui.texts.parse.text', text: '' });
        const all = Array.isArray(context.tabs) ? context.tabs : [];
        if (all.length === 0) { return { success: false, error: 'No tabs available in context.' }; }

        const parseOne = async (tid: number, title?: string, url?: string) => {
            try {
                const response = await context.sendMessageToTab({ type: 'PARSE_PAGE_TEXT' }, tid);
                const elements = Array.isArray(response?.data) ? response.data : [];

                return { tabId: tid, title, url, elements };
            } catch (e) {
                reportError(e, 'errors.parseText');

                return { tabId: tid, title, url, elements: [] };
            }
        };

        const parsedTabs = await Promise.all(
            all.map(t => parseOne(t.id, t.title, t.url))
        );

        return {
            success: true,
            parsedTabs
        };
    },
    toModelOutput: ({ output }) => {
        if (!output.success) {
            return { type: 'text' as const, value: `Parse failed: ${output.error}` };
        }

        const tabs = output.parsedTabs as Array<{ tabId: number; title?: string; url?: string; elements: any[] }>;
        const sections = tabs.map(tab => {
            const header = `## Tab: ${tab.title || 'Untitled'} (${tab.url || 'no url'})`;
            const textContent = tab.elements
                .map((t: any) => String(t.text || t).slice(0, 300))
                .join('\n');

            return `${header}\n${textContent}`;
        });

        return { type: 'text' as const, value: sections.join('\n\n') };
    }
});


