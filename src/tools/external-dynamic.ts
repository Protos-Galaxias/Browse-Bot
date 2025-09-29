// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';
import { ConfigService } from '../services/ConfigService';

type ExternalToolConfig = {
    name: string;
    description?: string;
    code: string;
    enabled?: boolean;
};

const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export async function createDynamicTools(context: ToolContext): Promise<Record<string, unknown>> {
    try {
        const list = await ConfigService.getInstance().get<ExternalToolConfig[]>('externalTools', []);
        if (!Array.isArray(list) || list.length === 0) return {};
        const aggregate: Record<string, unknown> = {};

        for (const ext of list) {
            if (!ext || ext.enabled === false) continue;
            const rawName = typeof ext.name === 'string' ? ext.name.trim() : '';
            const code = typeof ext.code === 'string' ? ext.code : '';
            if (!rawName || !NAME_RE.test(rawName) || !code) continue;

            const key = `ext__${rawName}`.slice(0, 64);
            const description = (typeof ext.description === 'string' && ext.description.trim()) || `External tool '${rawName}'`;

            aggregate[key] = tool({
                description,
                inputSchema: z.object({}).passthrough(),
                async execute(args: unknown): Promise<{ success: boolean; [k: string]: unknown }> {
                    try {
                        const defaultTabId = Array.isArray(context.tabs) && context.tabs.length > 0 ? context.tabs[0]!.id : undefined;
                        if (!defaultTabId) {
                            return { success: false, error: 'No active tab available' };
                        }
                        const timeoutMs = 15000;
                        const response: any = await Promise.race([
                            context.sendMessageToTab({ type: 'EXTERNAL', tid: defaultTabId, code, args }, defaultTabId),
                            new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), timeoutMs))
                        ]);
                        if (response && (response as any).__timeout) {
                            return { success: false, error: 'External tool timeout' };
                        }
                        if (response && response.status === 'ok') {
                            return { success: true, result: response.result };
                        }
                        const msg = response && typeof response.message === 'string' ? response.message : 'External code failed';
                        return { success: false, error: msg };
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : 'External tool execution failed';
                        return { success: false, error: msg };
                    }
                }
            });
        }

        return aggregate;
    } catch {
        return {};
    }
}


