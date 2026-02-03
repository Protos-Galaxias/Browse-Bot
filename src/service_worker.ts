// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { reportError, updateLogI18n, logResult } from './logger';
import { AiService } from './services/AIService';
import { agentTools } from './tools/agent-tools';
import type { ToolContext } from './tools/types';
import type { ToolSet, ModelMessage } from 'ai';
import { ConfigService } from './services/ConfigService';
import type { AIService } from './services/AIService';
import systemPromptRaw from './prompts/system.md?raw';
import { isChrome } from './browser';
import { StateService } from './services/StateService';
import { truncateContext, getTotalTokenEstimate } from './services/ContextManager';
import { ProviderConfigs } from './services/ProviderConfigs';

console.log('[SW] booting service worker');

class UserAbortedError extends Error {
    constructor() {
        super('User aborted');
        this.name = 'UserAbortedError';
    }
}

if (isChrome() && chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

if (isChrome()) {
    injectIntoAllOpenTabs();
}

// AI service is selected per task based on user config (chrome.storage.local)

let agentHistory: any[] = [];
let currentController: AbortController | null = null;
let currentTaskTabs: Array<{ id: number; title?: string; url?: string }> = [];

async function ensureHostPermissionForTab(tabId: number): Promise<boolean> {
    try {
        const tab = await chrome.tabs.get(tabId);
        const url = tab?.url || '';
        if (!url || !/^https?:\/\//i.test(url)) return false;
        const origin = new URL(url).origin + '/*';
        const has = await chrome.permissions.contains({ origins: [origin] });
        if (has) return true;
        try {
            const granted = await chrome.permissions.request({ origins: [origin] });
            return Boolean(granted);
        } catch (e) {
            console.warn('Permission request failed for origin', origin, e);
            return false;
        }
    } catch (e) {
        console.warn('Failed to check/request permission for tab', tabId, e);
        return false;
    }
}

async function injectContentIntoTab(tabId: number): Promise<void> {
    try {
        if (!chrome?.scripting?.executeScript) return;
        const allowed = await ensureHostPermissionForTab(tabId);
        if (!allowed) {
            console.warn('Skipping injection; host permission not granted for tab', tabId);
            return;
        }
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {

                const w = window as any;
                const already = Boolean(w.__webWalkerInjected);
                w.__webWalkerInjected = true;
                return already;
            }
        });

        const alreadyInjected = Array.isArray(results) && results.length > 0 ? Boolean((results[0] as any)?.result) : false;
        if (!alreadyInjected) {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['src/content.js']
            });
        }
    } catch (e) {
        console.warn('Content injection failed for tab', tabId, e);
    }
}

function injectIntoAllOpenTabs(): void {
    try {
        chrome.tabs.query({}, (tabs) => {
            for (const t of tabs) {
                const id = t && typeof t.id === 'number' ? t.id : undefined;
                if (id) {
                    injectContentIntoTab(id).catch(() => {});
                }
            }
        });
    } catch {
        // ignore
    }
}


export interface AgentTaskResult {
    text: string;
    metrics: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        llmCalls: number;
    };
    streamed?: boolean;
}

async function runAgentTask(
    messages: ModelMessage[],
    tools: ToolSet,
    aiService: AIService,
    maxContextTokens?: number
): Promise<AgentTaskResult> {
    // Truncate context if needed to prevent overflow errors
    const truncatedMessages = truncateContext(messages, { maxContextTokens });
    const originalTokens = getTotalTokenEstimate(messages);
    const truncatedTokens = getTotalTokenEstimate(truncatedMessages);

    if (originalTokens !== truncatedTokens) {
        console.log(`[SW] Context truncated: ${originalTokens} -> ${truncatedTokens} tokens (est.)`);
    }

    const history: ModelMessage[] = truncatedMessages;

    agentHistory = [...history];

    currentController = new AbortController();
    const signal = currentController.signal;

    const hasTools = tools && Object.keys(tools).length > 0;
    console.log('[SW] Running with', hasTools ? Object.keys(tools).length : 0, 'tools');

    type ToolResultOutput = { answer?: string; [key: string]: unknown };
    type ToolResult = { toolCallId: string; toolName: string; output: ToolResultOutput };

    try {
        const res: unknown = await aiService.generateWithTools({
            messages: history,
            tools,
            abortSignal: signal
        });

        const raw: any = res as any;
        const steps: Array<any> | undefined = Array.isArray(raw?.steps) ? raw.steps : undefined;
        const flattenContent: Array<any> = Array.isArray(steps)
            ? steps.flatMap((s: any) => (Array.isArray(s?.content) ? s.content : []))
            : [];

        // Extract usage/metrics from result
        const usage = raw?.usage || {};
        const metrics = {
            promptTokens: usage.promptTokens || 0,
            completionTokens: usage.completionTokens || 0,
            totalTokens: usage.totalTokens || 0,
            llmCalls: steps?.length || 1
        };
        console.log('[SW] LLM metrics:', metrics);
        console.log('[SW] Steps:', steps?.length, 'flattenContent:', flattenContent.length);

        const toolCalls = flattenContent.filter((c: any) => c?.type === 'tool-call');
        const sdkToolResults = flattenContent.filter((c: any) => c?.type === 'tool-result');
        const text = (() => {
            const texts = flattenContent.filter((c: any) => c?.type === 'text' && typeof c.text === 'string');

            return texts.length > 0 ? texts[texts.length - 1].text : undefined;
        })();
        console.log('[SW] Derived:', { toolCalls: toolCalls.length, toolResults: sdkToolResults.length, hasText: Boolean(text) });

        // Update history with tool calls
        if (Array.isArray(toolCalls)) {
            for (const call of toolCalls) {
                agentHistory.push({
                    role: 'assistant',
                    content: [{
                        type: 'tool-call',
                        toolCallId: call.toolCallId,
                        toolName: call.toolName,
                        input: call.input
                    }]
                });
            }
        }
        if (Array.isArray(sdkToolResults) && sdkToolResults.length > 0) {
            const toolResultsMsgs = sdkToolResults.map((tr: ToolResult) => ({
                role: 'tool',
                content: [{
                    type: 'tool-result',
                    toolCallId: tr.toolCallId,
                    toolName: tr.toolName,
                    output: { type: 'json', value: tr.output }
                }]
            }));
            agentHistory.push(...toolResultsMsgs);
        }

        // Check for chat tool (simple conversational response)
        const chatResult = (sdkToolResults || []).find((tr: ToolResult) => tr.toolName === 'chat');
        if (chatResult && chatResult.output && typeof chatResult.output.answer === 'string') {
            console.log('[SW] Chat tool detected, answer:', chatResult.output.answer.substring(0, 50));

            return { text: chatResult.output.answer, metrics, streamed: true };
        }

        // Check for finishTask tool (task completion)
        const finish = (sdkToolResults || []).find((tr: ToolResult) => tr.toolName === 'finishTask');
        if (finish && finish.output && typeof finish.output.answer === 'string') {
            console.log('[SW] FinishTask tool detected');

            return { text: finish.output.answer, metrics };
        }

        // Fallback to text
        if (Array.isArray(steps)) agentHistory.push(...steps);
        if (typeof text === 'string' && text.length > 0) {
            agentHistory.push({ role: 'assistant', content: text });
        }

        return { text: text || 'Task completed without a final text answer.', metrics };
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new UserAbortedError();
        }
        reportError(error, 'Agent finished with error');
        throw error;
    }
}

function formatWorkHistoryForContext(): string | null {
    if (!Array.isArray(agentHistory) || agentHistory.length === 0) return null;
    try {
        const lines: string[] = agentHistory.map((msg: any, index: number) => {
            if (msg.role === 'user' && typeof msg.content === 'string') {
                return `Step ${index}: User: ${msg.content}`;
            }
            if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                const item = msg.content[0];
                if (item?.type === 'tool-call') {
                    return `Step ${index}: Agent called tool '${item.toolName}'`;
                }
            }
            if (msg.role === 'tool' && Array.isArray(msg.content)) {
                const item = msg.content[0];
                if (item?.type === 'tool-result') {
                    return `Step ${index}: Result of '${item.toolName}': ${JSON.stringify(item.output)}`;
                }
            }
            if (typeof msg.content === 'string') {
                return `Step ${index}: ${msg.role}: ${msg.content}`;
            }
            return `Step ${index}: ${msg.role}`;
        });
        return `Context (agent's previous work history):\n${lines.join('\n')}`;
    } catch {
        return null;
    }
}

function convertChatHistoryToMessages(chatHistory: Array<string | { type: string; [key: string]: unknown }>): ModelMessage[] {
    const messages: ModelMessage[] = [];
    for (const entry of chatHistory) {
        if (typeof entry === 'string') {
            // Parse string format: "[User]: message" or "[Result]: message" etc.
            if (entry.startsWith('[User]:')) {
                messages.push({ role: 'user', content: entry.replace(/^\[User\]:\s*/, '') });
            } else {
                // Assistant messages (results, agent responses, etc.)
                messages.push({ role: 'assistant', content: entry });
            }
        } else if (entry && typeof entry === 'object') {
            // Handle object log entries
            const obj = entry as { type: string; text?: string; message?: string; prefix?: string };

            if (obj.type === 'result' && typeof obj.text === 'string') {
                // ResultLog: { type: 'result', text: '...' }
                messages.push({ role: 'assistant', content: obj.text });
            } else if (obj.type === 'i18n' && typeof obj.text === 'string') {
                // Localized i18n message with rendered text
                if (obj.prefix === 'user') {
                    messages.push({ role: 'user', content: obj.text });
                } else {
                    messages.push({ role: 'assistant', content: obj.text });
                }
            } else if (obj.type === 'error' && typeof obj.message === 'string') {
                // ErrorLog: { type: 'error', message: '...' }
                messages.push({ role: 'assistant', content: `[Error]: ${obj.message}` });
            }
            // Skip 'ui' type objects (clicks, form, parse indicators) - they're UI-only hints
        }
    }
    return messages;
}

type TabMeta = { id: number; title?: string; url?: string };

async function buildSystemPrompt(tabs?: Array<TabMeta>): Promise<string> {
    const globalPrompt = await ConfigService.getInstance().get<string>('globalPrompt', '');
    const domainPrompts = await ConfigService.getInstance().get<Record<string, string>>('domainPrompts', {} as Record<string, string>);
    const trimmed = (globalPrompt ?? '').trim();
    const parts: string[] = [systemPromptRaw];
    if (trimmed) parts.push(`<context_from_user>\n${trimmed}\n</context_from_user>`);

    // Inject short-term agent memory for better follow-ups (e.g., pronoun resolution)
    try {
        const mem = StateService.getInstance().getMemory();
        if (mem && (mem.lastEntities || mem.lastSelection)) {
            parts.push(`<agent_memory>\n${JSON.stringify(mem, null, 2)}\n</agent_memory>`);
        }
    } catch { /* ignore */ }

    const hosts = new Set<string>();
    if (Array.isArray(tabs)) {
        for (const t of tabs) {
            const url = t?.url;
            if (!url) continue;
            try {
                const host = new URL(url).hostname.replace(/^www\./, '');
                if (host) hosts.add(host);
            } catch {
                // ignore invalid URLs
            }
        }
    }

    const domainSections: string[] = [];
    for (const host of hosts) {
        const prompt = (domainPrompts && typeof domainPrompts === 'object') ? domainPrompts[host] || domainPrompts[`www.${host}`] : undefined;
        const trimmedPrompt = (prompt ?? '').trim();
        if (trimmedPrompt) {
            domainSections.push(`<domain_context domain="${host}">\n${trimmedPrompt}\n</domain_context>`);
        }
    }
    if (domainSections.length > 0) parts.push(domainSections.join('\n\n'));
    return parts.join('\n\n');
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    try { console.log('[SW] onMessage', message); } catch (e) { void e; }
    if (message && message.type === 'PING') {
        try { console.log('[SW] PING received'); } catch (e) { void e; }
        try { sendResponse({ ok: true, pong: true }); } catch (e) { void e; }
        return true;
    }
    if (message.type === 'OPEN_LINK_IN_BG') {
        try {
            const url = String(message.url || '');
            if (!url) throw new Error('No URL');
            const created = await chrome.tabs.create({ url, active: false });
            if (created && typeof created.id === 'number') {
                const exists = currentTaskTabs.some(t => t.id === created.id);
                if (!exists) currentTaskTabs.push({ id: created.id, title: created.title, url: created.url });
                // Update title/url when they become available
                const handleUpdated = (tabId: number, changeInfo: any, tab: chrome.tabs.Tab) => {
                    if (tabId !== created.id) return;
                    const idx = currentTaskTabs.findIndex(t => t.id === tabId);
                    if (idx !== -1) {
                        currentTaskTabs[idx] = {
                            id: tabId,
                            title: changeInfo.title ?? tab.title,
                            url: changeInfo.url ?? tab.url
                        };
                    }
                    if (changeInfo.status === 'complete') {
                        // Ensure content script is injected once the tab is ready (Chrome only)
                        if (isChrome()) {
                            injectContentIntoTab(tabId).catch(() => {});
                        }
                        try { chrome.tabs.onUpdated.removeListener(handleUpdated); } catch { /* ignore remove errors */ }
                    }
                };
                try { chrome.tabs.onUpdated.addListener(handleUpdated); } catch { /* ignore add errors */ }
            }
        } catch (e) {
            reportError(e, 'errors.openLinkInBg');
        }
        return;
    }
    if (message.type === 'RESET_CONTEXT') {
        const chatId = message.chatId as string | undefined;
        // Save debug log for the chat before clearing
        if (chatId && agentHistory.length > 0) {
            (async () => {
                try {
                    const configService = ConfigService.getInstance();
                    const provider = await configService.get('provider') || 'unknown';
                    const model = await configService.get('activeModel') || 'unknown';
                    const debugInfo = {
                        timestamp: new Date().toISOString(),
                        provider,
                        model,
                        messages: JSON.parse(JSON.stringify(agentHistory))
                    };
                    await chrome.storage.local.set({ [`_debugLog_${chatId}`]: debugInfo });
                } catch { /* ignore */ }
            })();
        }
        try { StateService.getInstance().clearMemory(); } catch (e) { void e; }
        agentHistory = [];
        currentTaskTabs = [];
        return;
    }
    if (message.type === 'GET_DEBUG_LOG') {
        const chatId = message.chatId as string | undefined;
        console.log('[SW] GET_DEBUG_LOG handler, chatId:', chatId, 'agentHistory:', agentHistory.length);

        (async () => {
            try {
                const configService = ConfigService.getInstance();
                const provider = await configService.get('provider') || 'unknown';
                const model = await configService.get('activeModel') || 'unknown';

                // If current history has data, use it
                if (agentHistory.length > 0) {
                    const debugInfo = {
                        timestamp: new Date().toISOString(),
                        provider,
                        model,
                        messages: JSON.parse(JSON.stringify(agentHistory))
                    };
                    await chrome.storage.local.set({ _debugLog: debugInfo });
                    return;
                }

                // Otherwise, try to load from saved chat debug log
                if (chatId) {
                    const stored = await chrome.storage.local.get([`_debugLog_${chatId}`]);
                    const saved = stored[`_debugLog_${chatId}`];
                    if (saved) {
                        await chrome.storage.local.set({ _debugLog: saved });
                    } else {
                        await chrome.storage.local.set({ _debugLog: { timestamp: new Date().toISOString(), provider, model, messages: [] } });
                    }
                } else {
                    await chrome.storage.local.set({ _debugLog: { timestamp: new Date().toISOString(), provider, model, messages: [] } });
                }
            } catch { /* ignore */ }
        })();
        return;
    }
    if (message.type === 'SET_CONFIG') {
        // Used by eval system to configure extension via content script
        const { config } = message as { config: Record<string, unknown> };
        console.log('[SW] SET_CONFIG received:', Object.keys(config));

        (async () => {
            try {
                const configService = ConfigService.getInstance();
                for (const [key, value] of Object.entries(config)) {
                    await configService.set(key, value);
                }
                sendResponse({ ok: true });
            } catch (e) {
                console.error('[SW] SET_CONFIG error:', e);
                sendResponse({ ok: false, error: String(e) });
            }
        })();

        return true; // Keep message channel open for async response
    }
    if (message.type === 'GENERATE_CHAT_TITLE') {
        const { userMessage, siteUrl, chatId } = message as { userMessage: string; siteUrl?: string; chatId?: string };
        console.log('[SW] Generating chat title for:', userMessage, siteUrl, chatId);

        (async () => {
            try {
                const providerFromConfig = (await ConfigService.getInstance().get<string>('provider')) || 'openrouter';
                const aiService = AiService.fromProviderName(providerFromConfig);
                await aiService.initialize();

                const sitePart = siteUrl ? `Website: ${siteUrl}\n` : '';
                const systemPrompt = 'Generate a short chat title (max 5 words) based on the user query and website. Return ONLY the title, nothing else.';
                const prompt = `${sitePart}User query: ${userMessage}`;

                const title = await aiService.generateSimpleText(systemPrompt, prompt, { temperature: 0.7 });
                console.log('[SW] Generated chat title:', title);

                if (title && title.length > 0 && title.length < 100 && chatId) {
                    console.log('[SW] Sending title back:', title);
                    chrome.runtime.sendMessage({ type: 'CHAT_TITLE_GENERATED', chatId, title }).catch(() => {});
                }
            } catch (error) {
                console.error('[SW] Failed to generate chat title:', error);
            }
        })();

        return;
    }
    if (message.type === 'START_TASK') {
        // Immediately respond to prevent "Receiving end does not exist" error
        try { sendResponse({ ok: true }); } catch (e) { void e; }

        const { prompt, tabs, chatHistory } = message as { prompt: string; tabs?: Array<{ id: number; title?: string; url?: string }>; chatHistory?: Array<string | { type: string; [key: string]: unknown }> };
        if (Array.isArray(tabs)) console.log('tabs meta back', tabs);

        let seedTabs = Array.isArray(tabs) && tabs.length > 0 ? tabs : [];
        currentTaskTabs = seedTabs; // share reference with tool context so new tabs can be appended
        let systemPrompt = await buildSystemPrompt(seedTabs);
        try {
            // Resolve provider from config
            const providerFromConfig = (await ConfigService.getInstance().get<string>('provider')) || 'openrouter';
            const selectedServiceGeneric = AiService.fromProviderName(providerFromConfig);
            await selectedServiceGeneric.initialize();


            const historyText = formatWorkHistoryForContext();
            // Convert persisted chat history to messages for context continuity
            const persistedHistory = Array.isArray(chatHistory) ? convertChatHistoryToMessages(chatHistory) : [];

            if (seedTabs.length === 0) {
                const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (!activeTab?.id) {
                    updateLogI18n('system.noActiveTabNoTools', undefined, 'system');
                    const messages: ModelMessage[] = [
                        { role: 'system', content: systemPrompt },
                        ...(historyText ? [{ role: 'system', content: historyText } as ModelMessage] : []),
                        ...persistedHistory,
                        { role: 'user', content: prompt }
                    ];

                    agentHistory = [...messages];

                    const providerConfig = ProviderConfigs[providerFromConfig] || ProviderConfigs['openrouter'];
                    try {
                        const result = await runAgentTask(messages, {} as ToolSet, selectedServiceGeneric, providerConfig.defaultMaxContextTokens);
                        if (!result.streamed) {
                            logResult(result.text);
                        }
                    } catch (err) {
                        if (err instanceof UserAbortedError) {
                            updateLogI18n('task.aborted', {}, 'result');
                        } else {
                            throw err;
                        }
                    }
                    return;
                } else {
                    seedTabs = [{ id: activeTab.id, title: activeTab.title, url: activeTab.url }];
                    currentTaskTabs = seedTabs;
                    systemPrompt = await buildSystemPrompt(seedTabs);
                }
            }

            const resolvedDefaultTabId = seedTabs[0]!.id;
            let elements: any[] = [];

            // Proactively inject content script into all task tabs (Chrome only)
            if (isChrome()) {
                try { await Promise.all(seedTabs.map(t => injectContentIntoTab(t.id))); } catch { /* ignore */ }
            }

            const toolContext: ToolContext = {
                aiService: selectedServiceGeneric,
                tabs: currentTaskTabs,
                getInteractiveElements: () => elements,
                setInteractiveElements: (e) => { elements = e; },
                sendMessageToTab: (msg, targetTabId?: number) => chrome.tabs.sendMessage(targetTabId ?? resolvedDefaultTabId, msg)
            };

            const tools = await agentTools(toolContext);

            const messages: ModelMessage[] = [
                { role: 'system', content: systemPrompt },
                ...(historyText ? [{ role: 'system', content: historyText } as ModelMessage] : []),
                ...persistedHistory,
                { role: 'user', content: prompt }
            ];

            agentHistory = [...messages];

            const providerConfig = ProviderConfigs[providerFromConfig] || ProviderConfigs['openrouter'];
            const result = await runAgentTask(messages, tools, selectedServiceGeneric, providerConfig.defaultMaxContextTokens);

            if (!result.streamed) {
                logResult(result.text);
            }
        } catch (err) {
            if (err instanceof UserAbortedError) {
                updateLogI18n('task.aborted', {}, 'result');
            } else {
                reportError(err, 'Error during task execution');
            }
        } finally {
            chrome.runtime.sendMessage({ type: 'TASK_COMPLETE' }).catch(console.error);
            currentTaskTabs = [];
        }
    } else if (message.type === 'EVAL_TASK') {
        // Handle eval task from testing system
        const { task } = message as { task: string };
        console.log('[SW] Received EVAL_TASK:', task);

        try { sendResponse({ ok: true, started: true }); } catch (e) { void e; }

        // Helper to send debug info to content script for selenium to read
        const sendDebug = async (tabId: number, msg: string) => {
            console.log('[SW] EVAL:', msg);
            try {
                chrome.tabs.sendMessage(tabId, { type: 'EVAL_DEBUG', message: msg });
            } catch { /* ignore */ }
        };

        (async () => {
            let tabId: number | undefined;
            try {
                const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (!activeTab?.id) {
                    console.warn('[SW] EVAL_TASK: No active tab');
                    return;
                }
                tabId = activeTab.id;
                await sendDebug(tabId, `Active tab: ${activeTab.id} ${activeTab.url}`);

                const tabs = [{ id: activeTab.id, title: activeTab.title, url: activeTab.url }];
                currentTaskTabs = tabs;

                const providerFromConfig = (await ConfigService.getInstance().get<string>('provider')) || 'openrouter';
                await sendDebug(tabId, `Provider: ${providerFromConfig}`);

                const apiKey = await ConfigService.getInstance().get<string>('apiKey');
                await sendDebug(tabId, `API key present: ${!!apiKey} ${apiKey ? apiKey.substring(0, 10) + '...' : 'none'}`);

                await sendDebug(tabId, 'Creating AI service...');
                const selectedServiceGeneric = AiService.fromProviderName(providerFromConfig);

                await sendDebug(tabId, 'Initializing AI service...');
                await selectedServiceGeneric.initialize();
                await sendDebug(tabId, 'AI service initialized');

                const systemPrompt = await buildSystemPrompt(tabs);

                // Inject content script
                if (isChrome()) {
                    await injectContentIntoTab(activeTab.id);
                }

                let elements: any[] = [];
                const toolContext: ToolContext = {
                    aiService: selectedServiceGeneric,
                    tabs: currentTaskTabs,
                    getInteractiveElements: () => elements,
                    setInteractiveElements: (e) => { elements = e; },
                    sendMessageToTab: (msg, targetTabId?: number) => chrome.tabs.sendMessage(targetTabId ?? activeTab.id!, msg)
                };

                const tools = await agentTools(toolContext);

                // Wrap tools to emit events for eval tracking
                const wrappedTools: ToolSet = {};
                for (const [name, tool] of Object.entries(tools)) {
                    wrappedTools[name] = {
                        ...tool,
                        execute: async (args: unknown, options: unknown) => {
                            // Notify content script about tool call
                            try {
                                chrome.tabs.sendMessage(activeTab.id!, {
                                    type: 'EVAL_TOOL_CALLED',
                                    toolName: name,
                                    args
                                });
                            } catch { /* ignore */ }

                            // Execute original tool
                            return (tool as any).execute(args, options);
                        }
                    };
                }

                const messages: ModelMessage[] = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: task }
                ];

                agentHistory = [...messages];

                await sendDebug(tabId, `Starting agent task with ${Object.keys(wrappedTools).length} tools`);
                const providerConfig = ProviderConfigs[providerFromConfig] || ProviderConfigs['openrouter'];

                let taskMetrics = { promptTokens: 0, completionTokens: 0, totalTokens: 0, llmCalls: 0 };
                try {
                    const result = await runAgentTask(messages, wrappedTools, selectedServiceGeneric, providerConfig.defaultMaxContextTokens);
                    taskMetrics = result.metrics;
                    await sendDebug(tabId, `Agent task completed. Tokens: ${taskMetrics.totalTokens}, LLM calls: ${taskMetrics.llmCalls}`);
                } catch (agentError) {
                    await sendDebug(tabId, `Agent task failed: ${agentError}`);
                    throw agentError;
                }

                // Notify completion with metrics
                try {
                    chrome.tabs.sendMessage(activeTab.id!, {
                        type: 'EVAL_TASK_COMPLETE',
                        metrics: taskMetrics
                    });
                } catch { /* ignore */ }

            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error('[SW] EVAL_TASK error:', err);
                if (tabId) {
                    await sendDebug(tabId, `ERROR: ${errMsg}`);
                }
            } finally {
                currentTaskTabs = [];
            }
        })();

        return true;
    } else if (message.type === 'STOP_TASK') {
        if (currentController) {
            currentController.abort();
            currentController = null;
            chrome.runtime.sendMessage({ type: 'TASK_COMPLETE' }).catch(console.error);
        }
        agentHistory = [];
        currentTaskTabs = [];
        try { sendResponse({ ok: true }); } catch (e) { void e; }
    }
    return true; // Keep message channel open for async responses
});
