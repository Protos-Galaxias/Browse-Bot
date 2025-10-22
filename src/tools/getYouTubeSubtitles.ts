// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext, ToolOutput } from './types';
import { resolveTabId, sendToTabOrThrow } from './utils';
import { updateLogI18n, updateLog } from '../logger';

export const getYouTubeSubtitlesTool = (context: ToolContext) => tool({
    description: 'Retrieves subtitles from a YouTube video. Returns clean subtitle text.',
    inputSchema: z.object({
        tabId: z.number().optional().describe('Optional specific tab id to target')
    }),
    async execute({ tabId }): Promise<ToolOutput> {
        const targetTabId = resolveTabId(context, tabId);
        updateLog({ type: 'ui', kind: 'parse', titleKey: 'ui.titles.youtube', textKey: 'ui.texts.youtube', text: '' });
        try {
            const timeoutMs = 20000;
            const response: unknown = await Promise.race([
                sendToTabOrThrow(context, { type: 'GET_YT_SUBTITLES' }, targetTabId),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for subtitles')), timeoutMs))
            ]);
            const subtitles = (response && typeof response === 'object' && 'subtitles' in (response as Record<string, unknown>))
                ? String((response as Record<string, unknown>).subtitles ?? '')
                : '';
            return { success: true, subtitles };
        } catch (e) {
            updateLogI18n('errors.generic', undefined, 'error');
            return { success: false, error: e instanceof Error ? e.message : 'Failed to get subtitles' };
        }
    }
});

