// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

/*
 Minimal MCP client for Streamable HTTP transport (2025-03-26).
 Supports: initialize, tools/list, tools/call. Handles JSON and SSE responses.
 Reference: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http
*/

type JsonRpcId = number | string;

type JsonRpcRequest = {
    jsonrpc: '2.0';
    id: JsonRpcId;
    method: string;
    params?: unknown;
};

type JsonRpcResponse = {
    jsonrpc: '2.0';
    id: JsonRpcId | null;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
};

export type McpTool = {
    name: string;
    description?: string;
    inputSchema?: unknown;
};

export class MCPClient {
    private readonly endpoint: string;
    private sessionId?: string;
    private nextId = 1;
    private initialized = false;
    private cachedTools: McpTool[] | null = null;

    constructor(endpoint: string) {
        this.endpoint = endpoint.trim();
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;
        const id = this.allocateId();
        const req: JsonRpcRequest = {
            jsonrpc: '2.0',
            id,
            method: 'initialize',
            params: {
                protocolVersion: '2025-03-26',
                clientInfo: { name: 'web-walker-extension', version: '0.0.0' },
                capabilities: {
                    // minimal capabilities set; expand as needed
                    tools: {},
                    prompts: {},
                    resources: {},
                    sampling: {}
                }
            }
        };
        const { response, headers } = await this.postForSingleResponse(req);
        if (response.error) throw new Error(`MCP initialize failed: ${response.error.message}`);
        const sid = headers.get('Mcp-Session-Id');
        if (sid && typeof sid === 'string' && sid.trim().length > 0) this.sessionId = sid;
        this.initialized = true;
    }

    async listTools(forceRefresh = false): Promise<McpTool[]> {
        if (!this.initialized) await this.initialize();
        if (this.cachedTools && !forceRefresh) return this.cachedTools;
        const id = this.allocateId();
        const req: JsonRpcRequest = { jsonrpc: '2.0', id, method: 'tools/list' };
        const { response } = await this.postForSingleResponse(req);
        if (response.error) throw new Error(`MCP tools/list failed: ${response.error.message}`);
        const result = (response.result ?? {}) as { tools?: McpTool[] };
        const tools = Array.isArray(result.tools) ? result.tools : [];
        this.cachedTools = tools;
        return tools;
    }

    async callTool(name: string, args: unknown): Promise<unknown> {
        if (!this.initialized) await this.initialize();
        const id = this.allocateId();
        const req: JsonRpcRequest = {
            jsonrpc: '2.0',
            id,
            method: 'tools/call',
            params: { name, arguments: args }
        };
        const { response } = await this.postForSingleResponse(req);
        if (response.error) throw new Error(`MCP tools/call ${name} failed: ${response.error.message}`);
        return response.result;
    }

    private allocateId(): number {
        const id = this.nextId;
        this.nextId += 1;
        return id;
    }

    private async postForSingleResponse(req: JsonRpcRequest): Promise<{ response: JsonRpcResponse; headers: Headers }> {
        const payload = JSON.stringify(req);
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream'
        };
        if (this.sessionId) {
            headers['Mcp-Session-Id'] = this.sessionId;
        }

        try {
            // Debug outgoing MCP request (safe: no secrets in body by default)
            console.debug('[MCP] POST', { endpoint: this.endpoint, body: req });
        } catch { /* ignore */ }

        const res = await fetch(this.endpoint, {
            method: 'POST',
            headers,
            body: payload
        });

        // Notifications/response-only acceptance path (202 Accepted)
        if (res.status === 202) {
            return { response: { jsonrpc: '2.0', id: req.id, result: null }, headers: res.headers };
        }

        const contentType = String(res.headers.get('Content-Type') || '').toLowerCase();
        try {
            console.debug('[MCP] RESP', { status: res.status, contentType });
        } catch { /* ignore */ }
        if (contentType.includes('application/json')) {
            const body = await res.json();
            // Body can be one object or an array
            const responses: JsonRpcResponse[] = Array.isArray(body) ? body : [body];
            const match = responses.find(r => r && typeof r === 'object' && 'id' in r && r.id === req.id);
            if (!match) throw new Error('MCP: matching JSON-RPC response not found');
            return { response: match, headers: res.headers };
        }

        if (contentType.includes('text/event-stream')) {
            const reader = res.body?.getReader();
            if (!reader) throw new Error('MCP: SSE stream has no reader');
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                // SSE events are separated by double newlines
                let idx: number;
                while ((idx = buffer.indexOf('\n\n')) !== -1) {
                    const rawEvent = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 2);
                    const dataLines = rawEvent
                        .split(/\r?\n/)
                        .filter(l => l.startsWith('data:'))
                        .map(l => l.slice(5).trim())
                        .filter(Boolean);
                    if (dataLines.length === 0) continue;
                    const dataText = dataLines.join('\n');
                    try {
                        const parsed = JSON.parse(dataText);
                        const messages: JsonRpcResponse[] = Array.isArray(parsed) ? parsed : [parsed];
                        const match = messages.find(m => m && typeof m === 'object' && 'id' in m && m.id === req.id);
                        if (match) {
                            return { response: match, headers: res.headers };
                        }
                    } catch {
                        // ignore non-JSON data frames
                    }
                }
            }
            throw new Error('MCP: SSE stream ended without matching response');
        }

        throw new Error(`MCP: Unsupported response Content-Type: ${contentType || 'unknown'}`);
    }
}


