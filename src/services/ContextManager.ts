// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import type { ModelMessage } from 'ai';

// Rough estimate: ~4 characters per token for English/mixed content
const CHARS_PER_TOKEN = 4;

// Default max tokens for local models (conservative)
const DEFAULT_MAX_CONTEXT_TOKENS = 4096;

// Reserve tokens for response
const RESPONSE_RESERVE = 1024;

export interface ContextManagerOptions {
    maxContextTokens?: number;
    responseReserve?: number;
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function messageToText(msg: ModelMessage): string {
    if (typeof msg.content === 'string') {
        return msg.content;
    }

    if (Array.isArray(msg.content)) {
        return msg.content.map(part => {
            if (typeof part === 'string') {
                return part;
            }

            if (part && typeof part === 'object') {
                if ('text' in part && typeof part.text === 'string') {
                    return part.text;
                }

                if ('input' in part) {
                    return JSON.stringify(part.input);
                }

                if ('output' in part) {
                    return JSON.stringify(part.output);
                }
            }

            return JSON.stringify(part);
        }).join(' ');
    }

    return JSON.stringify(msg.content);
}

function estimateMessageTokens(msg: ModelMessage): number {
    // Add overhead for role and structure
    const overhead = 10;

    return estimateTokens(messageToText(msg)) + overhead;
}

function createSummaryMessage(messages: ModelMessage[]): ModelMessage {
    const summary = messages.map((msg, i) => {
        const role = msg.role;
        const preview = messageToText(msg).slice(0, 100);

        return `[${i + 1}] ${role}: ${preview}${preview.length >= 100 ? '...' : ''}`;
    }).join('\n');

    return {
        role: 'system',
        content: `[Earlier conversation summary - ${messages.length} messages truncated for context limit]\n${summary}`
    };
}

export function truncateContext(
    messages: ModelMessage[],
    options: ContextManagerOptions = {}
): ModelMessage[] {
    const maxTokens = options.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
    const reserve = options.responseReserve ?? RESPONSE_RESERVE;
    const availableTokens = maxTokens - reserve;

    // Separate system messages from conversation
    const systemMessages: ModelMessage[] = [];
    const conversationMessages: ModelMessage[] = [];

    for (const msg of messages) {
        if (msg.role === 'system') {
            systemMessages.push(msg);
        } else {
            conversationMessages.push(msg);
        }
    }

    // Calculate system messages tokens (always keep)
    let usedTokens = systemMessages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);

    // If system messages alone exceed limit, we have a problem - truncate them
    if (usedTokens > availableTokens * 0.7) {
        console.warn('[ContextManager] System prompts are very large, truncating');
        const truncatedSystem = systemMessages.map(msg => {
            const text = messageToText(msg);
            const maxChars = Math.floor((availableTokens * 0.5 * CHARS_PER_TOKEN) / systemMessages.length);

            if (text.length > maxChars) {
                return {
                    ...msg,
                    content: text.slice(0, maxChars) + '\n[...truncated for context limit]'
                } as ModelMessage;
            }

            return msg;
        });
        usedTokens = truncatedSystem.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
        systemMessages.length = 0;
        systemMessages.push(...truncatedSystem);
    }

    const remainingTokens = availableTokens - usedTokens;

    // Always keep the last user message
    if (conversationMessages.length === 0) {
        return systemMessages;
    }

    // Build from most recent, going backwards
    const keptMessages: ModelMessage[] = [];
    let conversationTokens = 0;

    for (let i = conversationMessages.length - 1; i >= 0; i--) {
        const msg = conversationMessages[i];
        const msgTokens = estimateMessageTokens(msg);

        if (conversationTokens + msgTokens > remainingTokens) {
            // Can't fit more messages
            break;
        }

        keptMessages.unshift(msg);
        conversationTokens += msgTokens;
    }

    // If we truncated messages, add a summary
    const truncatedCount = conversationMessages.length - keptMessages.length;

    if (truncatedCount > 0) {
        const truncatedMessages = conversationMessages.slice(0, truncatedCount);
        const summaryMsg = createSummaryMessage(truncatedMessages);
        const summaryTokens = estimateMessageTokens(summaryMsg);

        // Only add summary if it fits
        if (conversationTokens + summaryTokens <= remainingTokens) {
            console.log(`[ContextManager] Truncated ${truncatedCount} messages, added summary`);

            return [...systemMessages, summaryMsg, ...keptMessages];
        }

        console.log(`[ContextManager] Truncated ${truncatedCount} messages (no summary - not enough space)`);
    }

    return [...systemMessages, ...keptMessages];
}

export function getTotalTokenEstimate(messages: ModelMessage[]): number {
    return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}
