import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext, ToolOutput } from './types';
import { MCPClient, type McpTool } from '../services/MCPClient';
import { ConfigService } from '../services/ConfigService';

export type McpToolsConfig = {
    enabled: boolean;
    endpoint?: string;
};

async function getMcpClient(): Promise<MCPClient | null> {
    const config = await ConfigService.getInstance().get<McpToolsConfig>('mcp', { enabled: false });
    if (!config || !config.enabled) return null;
    const endpoint = typeof config.endpoint === 'string' ? config.endpoint.trim() : '';
    if (!endpoint) return null;
    return new MCPClient(endpoint);
}

export const mcpListToolsTool = (_context: ToolContext) => tool({
    description: 'Lists tools exposed by the configured MCP server.',
    inputSchema: z.object({}),
    async execute(): Promise<ToolOutput> {
        const client = await getMcpClient();
        if (!client) return { success: false, error: 'MCP is not configured' };
        try {
            const tools: McpTool[] = await client.listTools();
            return { success: true, tools } as unknown as ToolOutput;
        } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : 'MCP listTools failed' };
        }
    }
});

export const mcpCallTool = (_context: ToolContext) => tool({
    description: 'Calls an MCP tool by name with JSON arguments.',
    inputSchema: z.object({
        name: z.string().min(1),
        // Accept any object-like args. Ensure a valid object schema for provider.
        args: z.object({}).passthrough().optional()
    }),
    async execute({ name, args }: { name: string; args?: unknown }): Promise<ToolOutput> {
        const client = await getMcpClient();
        if (!client) return { success: false, error: 'MCP is not configured' };
        try {
            const result = await client.callTool(name, args ?? {});
            return { success: true, result } as unknown as ToolOutput;
        } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : 'MCP call failed' };
        }
    }
});


