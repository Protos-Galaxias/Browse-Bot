// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext, ToolOutput } from './types';
import { streamChunk } from '../logger';

export const chatTool = (context: ToolContext) => tool({
    description: 'Use ONLY for pure knowledge questions completely unrelated to the webpage (math, facts, translations, general knowledge). DO NOT use for page tasks like adding to cart, clicking, searching, filling forms. DO NOT use to ask clarifying questions about page tasks - analyze the page with parsePage instead.',
    inputSchema: z.object({
        question: z.string().describe('The user\'s question or request to respond to')
    }),
    async execute({ question }): Promise<ToolOutput> {
        try {
            console.log('[Chat Tool] Generating streaming response for:', question.substring(0, 50));

            const response = await context.aiService.streamText({
                messages: [
                    { role: 'user', content: question }
                ],
                onTextChunk: (chunk) => {
                    streamChunk(chunk, false);
                }
            });

            // Signal streaming done
            streamChunk('', true);

            console.log('[Chat Tool] Response generated, length:', response.length);

            return { success: true, answer: response };
        } catch (error) {
            console.error('[Chat Tool] Error:', error);

            return { success: false, error: String(error) };
        }
    }
});
