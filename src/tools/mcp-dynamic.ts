// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { tool } from 'ai';
import { z } from 'zod';
// no ToolContext needed here
import { MCPClient, type McpTool } from '../services/MCPClient';
import { ConfigService } from '../services/ConfigService';

const cachedPerEndpoint: Map<string, Record<string, unknown>> = new Map();

export async function createMcpDynamicTools(): Promise<Record<string, unknown>> {
    try {
        // Prefer new multi-MCP config
        const mcps = await ConfigService.getInstance().get<Array<{ id?: string; label?: string; endpoint?: string; enabled?: boolean }>>('mcps', []);
        // Back-compat: fall back to single 'mcp'
        const legacy = await ConfigService.getInstance().get<{ enabled?: boolean; endpoint?: string }>('mcp', { enabled: false });

        const endpoints = Array.isArray(mcps) && mcps.length > 0
            ? mcps.filter(m => m?.enabled && typeof m?.endpoint === 'string' && m.endpoint!.trim().length > 0)
            : (legacy?.enabled && typeof legacy?.endpoint === 'string' && legacy.endpoint.trim().length > 0
                ? [{ label: undefined, endpoint: legacy.endpoint.trim(), enabled: true }]
                : []);

        if (endpoints.length === 0) return {};

        const aggregate: Record<string, unknown> = {};

        for (let idx = 0; idx < endpoints.length; idx++) {
            const ep = endpoints[idx]!;
            const endpoint = String(ep.endpoint).trim();
            const label = typeof ep.label === 'string' && ep.label.trim().length > 0 ? ep.label.trim() : undefined;
            // human-ish key: label or hostname or index
            let key = label;
            if (!key) {
                try { key = new URL(endpoint).hostname.replace(/^www\./, ''); } catch { key = undefined; }
            }
            if (!key) key = `mcp${idx + 1}`;
            const keyNorm = key.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase().slice(0, 24);

            // Cached per-endpoint
            let toolsForEndpoint = cachedPerEndpoint.get(endpoint);
            if (!toolsForEndpoint) {
                const client = new MCPClient(endpoint);
                await client.initialize();
                const tools: McpTool[] = await client.listTools();
                const built: Record<string, unknown> = {};
                for (const t of tools) {
                    const name = String(t?.name || '').trim();
                    if (!name) continue;
                    const normalized = name.replace(/[^a-zA-Z0-9_]/g, '_');
                    const base = `mcp__${keyNorm}__${normalized}`.slice(0, 64);
                    const unique = base in built ? `${base}_1` : base;
                    const schemaSnippet = (() => {
                        try { return t?.inputSchema ? JSON.stringify(t.inputSchema) : undefined; } catch { return undefined; }
                    })();
                    const desc = `MCP tool [${key}]: ${name}${t?.description ? ` — ${t.description}` : ''}${schemaSnippet ? `\nInput schema (JSON Schema): ${schemaSnippet}` : ''}`;
                    built[unique] = tool({
                        description: desc,
                        inputSchema: z.object({}).passthrough(),
                        async execute(args: unknown) {
                            try {
                                const out = await client.callTool(name, args);
                                return { success: true, result: out } as { success: boolean; result: unknown };
                            } catch (e) {
                                const msg = e instanceof Error ? e.message : 'MCP call failed';
                                return { success: false, error: msg } as { success: boolean; error: string };
                            }
                        }
                    });
                }
                cachedPerEndpoint.set(endpoint, built);
                toolsForEndpoint = built;
            }

            Object.assign(aggregate, toolsForEndpoint);
        }

        return aggregate;
    } catch {
        return {};
    }
}


