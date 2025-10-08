// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext, ToolOutput } from './types';
import { reportError, updateLog } from '../logger';

export const parsePageTool = (context: ToolContext) => tool({
    description: 'Parses all tabs and returns both interactive elements and meaningful text for each tab in parsedTabs. Also updates interactive elements context from the first tab.',
    inputSchema: z.object({}),
    async execute(): Promise<ToolOutput> {
        updateLog({ type: 'ui', kind: 'parse', title: 'Прочитал страницу', text: 'Собираю интерактивные элементы и текст со всех вкладок' });
        const all = Array.isArray(context.tabs) ? context.tabs : [];
        if (all.length === 0) return { success: false, error: 'No tabs available in context.' };

        const parseOne = async (tid: number, title?: string, url?: string) => {
            try {
                const response = await context.sendMessageToTab({ type: 'PARSE_PAGE_ALL', tid }, tid);
                const interactive = Array.isArray(response?.data?.interactive) ? response.data.interactive : [];
                const text = Array.isArray(response?.data?.text) ? response.data.text : [];
                return { tabId: tid, title, url, interactive, text };
            } catch (e) {
                reportError(e, 'errors.parseAll');
                return { tabId: tid, title, url, interactive: [], text: [] };
            }
        };

        const parsedTabs = await Promise.all(
            all.map(t => parseOne(t.id, t.title, t.url))
        );

        const aggregatedInteractive = parsedTabs.flatMap(t => Array.isArray(t.interactive) ? t.interactive : []);
        if (aggregatedInteractive.length > 0) {
            context.setInteractiveElements(aggregatedInteractive);
        }

        return {
            success: true,
            parsedTabs
        };
    }
});


