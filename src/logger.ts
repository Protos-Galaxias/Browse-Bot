// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

export type I18nLog = { type: 'i18n'; key: string; params?: Record<string, unknown>; prefix?: 'error' | 'result' | 'system' | 'agent' | 'user' };
export type ResultLog = { type: 'result'; text: string };
export type UiLog = {
    type: 'ui';
    kind: 'click' | 'form' | 'parse' | 'find';
    title?: string;
    titleKey?: string;
    text: string;
    textKey?: string;
    params?: Record<string, unknown>;
};

export type ErrorLog = {
    type: 'error';
    message: string;
    details?: {
        requestUrl?: string;
        requestMethod?: string;
        requestHeaders?: Record<string, string>;
        requestBody?: string;
        responseStatus?: number;
        responseStatusText?: string;
        responseHeaders?: Record<string, string>;
        responseBody?: string;
        stack?: string;
    };
};

// Patterns to mask sensitive data
const SENSITIVE_PATTERNS = [
    /sk-[a-zA-Z0-9_-]{20,}/g,           // OpenAI/OpenRouter keys
    /sk-or-v1-[a-zA-Z0-9_-]{20,}/g,     // OpenRouter v1 keys
    /xai-[a-zA-Z0-9_-]{20,}/g,          // xAI keys
    /Bearer\s+[a-zA-Z0-9_.-]+/gi,       // Bearer tokens
    /api[_-]?key["\s:=]+["']?[a-zA-Z0-9_-]{10,}["']?/gi,  // Generic API keys
    /authorization["\s:=]+["']?[a-zA-Z0-9_.-]+["']?/gi   // Authorization headers
];

export function maskSensitiveData(text: string): string {
    if (!text) {
        return text;
    }
    let masked = text;
    for (const pattern of SENSITIVE_PATTERNS) {
        masked = masked.replace(pattern, '[MASKED]');
    }

    return masked;
}

function headersToRecord(headers: Headers | Record<string, string> | undefined): Record<string, string> | undefined {
    if (!headers) {
        return undefined;
    }
    if (headers instanceof Headers) {
        const result: Record<string, string> = {};
        headers.forEach((value, key) => {
            result[key] = maskSensitiveData(value);
        });

        return result;
    }
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        result[key] = maskSensitiveData(String(value));
    }

    return result;
}

function extractErrorDetails(error: unknown): ErrorLog['details'] | undefined {
    if (!error || typeof error !== 'object') {
        return undefined;
    }

    const details: ErrorLog['details'] = {};
    const e = error as Record<string, unknown>;

    // Stack trace
    if (e.stack && typeof e.stack === 'string') {
        details.stack = maskSensitiveData(e.stack);
    }

    // Request details (from AI SDK errors)
    if (e.url && typeof e.url === 'string') {
        details.requestUrl = maskSensitiveData(e.url);
    }
    if (e.requestBodyValues && typeof e.requestBodyValues === 'object') {
        try {
            details.requestBody = maskSensitiveData(JSON.stringify(e.requestBodyValues, null, 2));
        } catch { /* ignore */ }
    }

    // Response details
    if (typeof e.statusCode === 'number') {
        details.responseStatus = e.statusCode;
    }
    if (e.responseBody && typeof e.responseBody === 'string') {
        details.responseBody = maskSensitiveData(e.responseBody);
    }
    if (e.responseHeaders) {
        details.responseHeaders = headersToRecord(e.responseHeaders as Headers | Record<string, string>);
    }

    // Check cause for nested error details
    if (e.cause && typeof e.cause === 'object') {
        const causeDetails = extractErrorDetails(e.cause);
        if (causeDetails) {
            Object.assign(details, causeDetails);
        }
    }

    // Check data field (some errors put details here)
    if (e.data && typeof e.data === 'object') {
        const dataObj = e.data as Record<string, unknown>;
        if (dataObj.responseBody) {
            details.responseBody = maskSensitiveData(String(dataObj.responseBody));
        }
    }

    return Object.keys(details).length > 0 ? details : undefined;
}

export function updateLog(data: string | I18nLog | UiLog | ErrorLog | ResultLog) {
    console.log(data);
    chrome.runtime.sendMessage({ type: 'UPDATE_LOG', data }).catch(e => console.error('Failed to send log to UI:', e));
}

export function logResult(text: string): void {
    const payload: ResultLog = { type: 'result', text };
    updateLog(payload);
}

export function streamChunk(text: string, done: boolean = false): void {
    console.log('[Logger] streamChunk:', done ? 'DONE' : text.substring(0, 20));
    chrome.runtime.sendMessage({ type: 'STREAM_CHUNK', text, done }).catch((e) => {
        console.warn('[Logger] streamChunk failed:', e?.message);
    });
}

export function formatError(error: unknown, context?: string): string {
    try {
        const base = (() => {
            if (error instanceof Error) {
                return error.message || 'Unknown error';
            }
            if (typeof error === 'string') {
                return error;
            }
            try {
                return JSON.stringify(error);
            } catch {
                return String(error);
            }
        })();
        const prefix = context && context.trim().length > 0 ? `${context}: ` : '';

        return `[Error]: ${prefix}${base}`;
    } catch {
        return '[Error]: Unexpected error';
    }
}

export function reportError(error: unknown, context?: string): void {
    try {
        const baseMessage = (() => {
            if (error instanceof Error) {
                return error.message || 'Unknown error';
            }
            if (typeof error === 'string') {
                return error;
            }
            try {
                return JSON.stringify(error);
            } catch {
                return String(error);
            }
        })();

        const prefix = context && context.trim().length > 0 ? `${context}: ` : '';
        const message = maskSensitiveData(`${prefix}${baseMessage}`);
        const details = extractErrorDetails(error);

        console.error(`[Error]: ${message}`, error);

        const errorLog: ErrorLog = {
            type: 'error',
            message,
            details
        };

        updateLog(errorLog);
    } catch (e) {
        try {
            console.error('Failed to report error', e);
        } catch {
            // noop
        }
    }
}

export function updateLogI18n(key: string, params?: Record<string, unknown>, prefix?: 'error' | 'result' | 'system' | 'agent' | 'user'): void {
    try {
        const payload: I18nLog = { type: 'i18n', key, params, prefix };
        updateLog(payload);
    } catch {
        // fallback to plain log if something goes wrong
        updateLog(`[i18n:${key}]`);
    }
}

export function reportErrorKey(key: string, error: unknown, params?: Record<string, unknown>): void {
    try {
        console.error(`[${key}]`, error);
        updateLogI18n(key, params, 'error');
    } catch (e) {
        try { console.error('Failed to report error key', key, e); } catch { /* noop */ }
    }
}
