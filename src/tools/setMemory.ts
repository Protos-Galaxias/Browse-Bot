// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { tool } from 'ai';
import { z } from 'zod';
import type { ToolOutput } from './types';
import { StateService } from '../services/StateService';

export const setMemoryTool = () => tool({
    description: 'Persist short-term memory for follow-up commands (e.g., selected item, page state). Memory survives across turns within the same chat session.',
    inputSchema: z.object({
        lastEntities: z.any().optional().describe('Array/object with extracted items, e.g., list of products with price/url.'),
        lastSelection: z.any().optional().describe('The single chosen item, e.g., the cheapest product.'),
        pageContext: z.object({
            url: z.string().optional(),
            title: z.string().optional(),
            cartCount: z.number().optional()
        }).optional().describe('Current page state snapshot for context continuity.')
    }),
    async execute({ lastEntities, lastSelection, pageContext }): Promise<ToolOutput> {
        const svc = StateService.getInstance();
        svc.setMemory({ lastEntities, lastSelection, pageContext });

        return { success: true };
    }
});
