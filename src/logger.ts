export type I18nLog = { type: 'i18n'; key: string; params?: Record<string, unknown>; prefix?: 'error' | 'result' | 'system' | 'agent' | 'user' };

export function updateLog(data: string | I18nLog) {
    console.log(data);
    chrome.runtime.sendMessage({ type: 'UPDATE_LOG', data }).catch(e => console.error('Failed to send log to UI:', e));
}

export function formatError(error: unknown, context?: string): string {
    try {
        const base = (() => {
            if (error instanceof Error) return error.message || 'Неизвестная ошибка';
            if (typeof error === 'string') return error;
            try { return JSON.stringify(error); } catch { return String(error); }
        })();
        const prefix = context && context.trim().length > 0 ? `${context}: ` : '';
        return `[Ошибка]: ${prefix}${base}`;
    } catch {
        return '[Ошибка]: Непредвиденная ошибка';
    }
}

export function reportError(error: unknown, context?: string): void {
    try {
        const message = formatError(error, context);
        console.error(message, error);
        updateLog(message);
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
    } catch (e) {
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
