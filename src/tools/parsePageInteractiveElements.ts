// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext, ToolOutput } from './types';
import { reportError, updateLog } from '../logger';

function summarizeElement(el: any): string {
    // Use markdownValue as primary — it's the same format used by findElement for matching
    if (el.markdownValue) {
        return String(el.markdownValue).slice(0, 150);
    }

    // Fallback for elements without markdownValue
    const parts: string[] = [];
    if (el.tag) { parts.push(el.tag); }
    if (el.type) { parts.push(`type=${el.type}`); }
    if (el.text) { parts.push(`"${String(el.text).slice(0, 60)}"`); }
    if (el.ariaLabel) { parts.push(`aria="${el.ariaLabel}"`); }
    if (el.placeholder) { parts.push(`placeholder="${el.placeholder}"`); }
    if (el.name) { parts.push(`name=${el.name}`); }

    return parts.join(' ');
}

export const parsePageInteractiveElementsTool = (context: ToolContext) => tool({
    description: 'Scans all tabs from context and returns their parsed elements in parsedTabs. Also updates interactive elements with the first parsed tab for compatibility.',
    inputSchema: z.object({}),
    async execute(): Promise<ToolOutput> {
        updateLog({ type: 'ui', kind: 'parse', titleKey: 'ui.titles.parsed', textKey: 'ui.texts.parse.interactive', text: '' });
        const all = Array.isArray(context.tabs) ? context.tabs : [];
        if (all.length === 0) { return { success: false, error: 'No tabs available in context.' }; }

        const parseOne = async (tid: number, title?: string, url?: string) => {
            try {
                const response = await context.sendMessageToTab({ type: 'PARSE_CURRENT_PAGE', tid }, tid);
                const elements = Array.isArray(response?.data) ? response.data : [];

                return { tabId: tid, title, url, elements };
            } catch (e) {
                reportError(e, 'errors.parseInteractive');

                return { tabId: tid, title, url, elements: [] };
            }
        };

        const parsedTabs = await Promise.all(
            all.map(t => parseOne(t.id, t.title, t.url))
        );

        const aggregated = parsedTabs.flatMap(t => Array.isArray(t.elements) ? t.elements : []);
        // Assign global refs for direct targeting by action tools
        aggregated.forEach((el: any, idx: number) => {
            el._ref = String(idx + 1);
        });
        if (aggregated.length > 0) {
            context.setInteractiveElements(aggregated);
        }

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
            const elSummary = tab.elements.map((el: any) => `  @${el._ref || '?'}: ${summarizeElement(el)}`).join('\n');

            return `${header}\n### Elements (${tab.elements.length}):\n${elSummary}`;
        });

        return { type: 'text' as const, value: sections.join('\n\n') };
    }
});


