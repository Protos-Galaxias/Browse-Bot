<!--
Copyright (c) 2025 PROTOS GALAXIAS LIMITED
SPDX-License-Identifier: BSL-1.1
-->

<script lang="ts">
    import {renderMarkdownSafe} from '../lib/markdown';
    import {renderUserMessage} from '../lib/renderUser';
    import { format} from 'svelte-i18n';
    import {get} from 'svelte/store';
    import cursorIcon from '../icons/cursor.svg';
    import searchIcon from '../icons/search.svg';
    import documentIcon from '../icons/document.svg';
    import keyboardIcon from '../icons/keyboard.png';
    import expandArrow from '../icons/expand-arrow.png';

    type UiLog = {
        type: 'ui';
        kind: 'click' | 'form' | 'parse' | 'find';
        title?: string;
        titleKey?: string;
        text: string;
        textKey?: string;
        params?: Record<string, unknown>;
    };
    
    type ErrorLog = {
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
    
    export let entry: string | {
        type: 'i18n';
        key: string;
        params?: Record<string, unknown>;
        prefix?: 'error' | 'result' | 'system' | 'agent' | 'user'
    } | UiLog | ErrorLog;

    function isI18nLog(x: unknown): x is {
        type: 'i18n';
        key: string;
        params?: Record<string, unknown>;
        prefix?: 'error' | 'result' | 'system' | 'agent' | 'user'
    } {
        return Boolean(x && typeof x === 'object' && (x as any).type === 'i18n' && typeof (x as any).key === 'string');
    }

    function isUiLog(x: unknown): x is UiLog {
        return Boolean(x && typeof x === 'object' && (x as any).type === 'ui' && typeof (x as any).text === 'string');
    }
    
    function isErrorLog(x: unknown): x is ErrorLog {
        return Boolean(x && typeof x === 'object' && (x as any).type === 'error' && typeof (x as any).message === 'string');
    }

    $: isI18n = isI18nLog(entry);
    $: isUi = isUiLog(entry);
    $: isError = isErrorLog(entry);
    $: errorDetails = isError ? (entry as ErrorLog).details : null;
    $: hasErrorDetails = errorDetails && Object.keys(errorDetails).length > 0;
    $: isUser = !isI18n && typeof entry === 'string' ? entry.startsWith('[User]') : (isI18n && (entry as any).prefix === 'user');
    $: uiIcon = (() => {
        if (!isUi) return null;
        const kind = (entry as UiLog).kind;
        if (kind === 'click') return cursorIcon;
        if (kind === 'find') return searchIcon;
        if (kind === 'parse') return documentIcon;
        return keyboardIcon; // form
    })();
    $: html = (() => {
        if (isError && isErrorLog(entry)) {
            return renderMarkdownSafe(`[Error]: ${entry.message}`);
        }
        if (isI18n && isI18nLog(entry)) {
            const prefix = entry.prefix === 'error' ? '[Ошибка]' : entry.prefix === 'result' ? '[Результат]' : entry.prefix === 'system' ? '[Система]' : entry.prefix === 'agent' ? '[Агент]' : '';
            const fmt = get(format) as (key: string, values?: Record<string, unknown>) => string;
            const text = fmt(entry.key, entry.params ?? {});
            return renderMarkdownSafe(`${prefix ? prefix + ': ' : ''}${text}`);
        }
        const val = String(entry);
        return isUser ? renderUserMessage(val.replace('[User]: ', '')) : renderMarkdownSafe(val);
    })();
    
    function formatHeaders(headers: Record<string, string> | undefined): string {
        if (!headers) return '';
        return Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n');
    }

    $: uiTitle = (() => {
        if (!isUi) return '';
        const e = entry as UiLog;
        const fmt = get(format) as (key: string, values?: Record<string, unknown>) => string;
        if (e.titleKey) return fmt(e.titleKey, e.params ?? {});
        if (e.title) return e.title;
        return fmt('ui.titles.clicked');
    })();

    $: uiText = (() => {
        if (!isUi) return '';
        const e = entry as UiLog;
        const fmt = get(format) as (key: string, values?: Record<string, unknown>) => string;
        if (e.textKey) return fmt(e.textKey, e.params ?? {});
        return e.text;
    })();
</script>

<div class="message {isUser ? 'user' : 'assistant'}">
    {#if isUser}
        <div class="message-bubble user-bubble">
            {@html html}
        </div>
    {:else}
        {#if isError}
            <div class="error-card">
                <div class="error-header">
                    <span class="error-icon">⚠️</span>
                    <span class="error-message">{@html html}</span>
                    {#if hasErrorDetails}
                        <details class="error-details-toggle">
                            <summary class="error-expand-btn">
                                <span class="plus-icon">+</span>
                            </summary>
                            <div class="error-details">
                                {#if errorDetails?.requestUrl}
                                    <div class="detail-section">
                                        <div class="detail-label">Request URL</div>
                                        <pre class="detail-value">{errorDetails.requestUrl}</pre>
                                    </div>
                                {/if}
                                {#if errorDetails?.requestHeaders && Object.keys(errorDetails.requestHeaders).length > 0}
                                    <div class="detail-section">
                                        <div class="detail-label">Request Headers</div>
                                        <pre class="detail-value">{formatHeaders(errorDetails.requestHeaders)}</pre>
                                    </div>
                                {/if}
                                {#if errorDetails?.requestBody}
                                    <div class="detail-section">
                                        <div class="detail-label">Request Body</div>
                                        <pre class="detail-value">{errorDetails.requestBody}</pre>
                                    </div>
                                {/if}
                                {#if errorDetails?.responseStatus}
                                    <div class="detail-section">
                                        <div class="detail-label">Response Status</div>
                                        <pre class="detail-value">{errorDetails.responseStatus} {errorDetails.responseStatusText || ''}</pre>
                                    </div>
                                {/if}
                                {#if errorDetails?.responseHeaders && Object.keys(errorDetails.responseHeaders).length > 0}
                                    <div class="detail-section">
                                        <div class="detail-label">Response Headers</div>
                                        <pre class="detail-value">{formatHeaders(errorDetails.responseHeaders)}</pre>
                                    </div>
                                {/if}
                                {#if errorDetails?.responseBody}
                                    <div class="detail-section">
                                        <div class="detail-label">Response Body</div>
                                        <pre class="detail-value">{errorDetails.responseBody}</pre>
                                    </div>
                                {/if}
                                {#if errorDetails?.stack}
                                    <div class="detail-section">
                                        <div class="detail-label">Stack Trace</div>
                                        <pre class="detail-value stack">{errorDetails.stack}</pre>
                                    </div>
                                {/if}
                            </div>
                        </details>
                    {/if}
                </div>
            </div>
        {:else if isUi}
            <div class="ui-card {'kind-' + (entry as UiLog).kind}">
                <details>
                    <summary>
                        {#if uiIcon}
                            <img class="ui-icon" src={uiIcon} alt=""/>
                        {/if}
                        {uiTitle}
                        <span class="ui-spacer"></span>
                        <img class="expand-icon" src={expandArrow} alt=""/>
                    </summary>
                    <div class="ui-content">
                        {@html renderMarkdownSafe(uiText)}
                    </div>
                </details>
            </div>
        {:else}
            <div class="message-content">
                {@html html}
            </div>
        {/if}
    {/if}
</div>

<style>
    .message {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
    }

    .message.user {
        flex-direction: row-reverse;
        align-self: flex-end;
    }

    .message.assistant {
        flex-direction: column;
    }

    .message-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--accent-color);
        color: #000000;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 0.9rem;
        flex-shrink: 0;
    }

    .message-bubble {
        background: var(--bg-primary);
        padding: 0.2rem 0.5rem;
        border-radius: 12px;
        max-width: 80%;
        word-wrap: break-word;
        text-align: left;
    }

    .user-bubble {
        background: var(--accent-color);
        color: #000000;
    }

    .message-content {
        color: var(--text-primary);
        line-height: 1.5;
        white-space: normal;
        text-align: left;
    }

    .message-content p {
        margin: 0.35rem 0;
    }

    .message-content ul {
        margin: 0.35rem 0 0.35rem 1rem;
        padding-left: 1rem;
    }

    .message-content ol {
        margin: 0.35rem 0 0.35rem 1rem;
        padding-left: 1rem;
    }

    .message-content li {
        margin: 0.2rem 0;
    }

    .message-content h1, .message-content h2, .message-content h3, .message-content h4, .message-content h5, .message-content h6 {
        margin: 0.5rem 0 0.25rem 0;
        font-weight: 600;
        line-height: 1.25;
    }

    .message-content h1 {
        font-size: 1.25rem;
    }

    .message-content h2 {
        font-size: 1.15rem;
    }

    .message-content h3 {
        font-size: 1.05rem;
    }

    .message-content code {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        padding: 0.05rem 0.3rem;
        border-radius: 4px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 0.85em;
    }

    .message-content a {
        color: var(--accent-color);
        text-decoration: underline;
    }

    .ui-card details {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 0.4rem 0.6rem;
        text-align: left;
    }

    .ui-card summary {
        cursor: pointer;
        list-style: none;
        display: flex;
        align-items: center;
        gap: 0.35rem;
    }

    .ui-card summary::-webkit-details-marker {
        display: none;
    }

    .ui-card .ui-content {
        margin-top: 0.4rem;
        color: var(--text-primary);
        text-align: left;
    }

    .ui-card .ui-icon {
        width: 14px;
        height: 14px;
        display: inline-block;
        filter: invert(1) brightness(1.2);
    }

    :global(:root[data-theme="light"]) .ui-card .ui-icon {
        filter: none;
    }

    .ui-card .ui-spacer {
        flex: 1;
    }

    .ui-card .expand-icon {
        width: 12px;
        height: 12px;
        opacity: 0.8;
        transition: transform 0.2s ease;
        transform: rotate(0deg);
    }

    .ui-card details[open] .expand-icon {
        transform: rotate(180deg);
    }

    /* Error card styles */
    .error-card {
        background: rgba(220, 53, 69, 0.1);
        border: 1px solid rgba(220, 53, 69, 0.3);
        border-radius: 8px;
        padding: 0.5rem 0.75rem;
        text-align: left;
    }

    .error-header {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .error-icon {
        flex-shrink: 0;
    }

    .error-message {
        color: #dc3545;
        flex: 1;
        min-width: 0;
        word-break: break-word;
    }

    .error-details-toggle {
        width: 100%;
        margin-top: 0.5rem;
    }

    .error-expand-btn {
        cursor: pointer;
        list-style: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: rgba(220, 53, 69, 0.2);
        border-radius: 4px;
        transition: background 0.2s;
    }

    .error-expand-btn:hover {
        background: rgba(220, 53, 69, 0.3);
    }

    .error-expand-btn::-webkit-details-marker {
        display: none;
    }

    .plus-icon {
        font-size: 1rem;
        font-weight: bold;
        color: #dc3545;
        line-height: 1;
    }

    .error-details-toggle[open] .plus-icon {
        content: '−';
    }

    .error-details-toggle[open] .plus-icon::after {
        content: '−';
    }

    .error-details-toggle:not([open]) .plus-icon::after {
        content: '+';
    }

    .plus-icon::after {
        content: '+';
    }

    .plus-icon {
        font-size: 0;
    }

    .error-details {
        margin-top: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .detail-section {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        overflow: hidden;
    }

    .detail-label {
        background: var(--bg-primary);
        padding: 0.25rem 0.5rem;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--border-color);
    }

    .detail-value {
        padding: 0.5rem;
        margin: 0;
        font-size: 0.8rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        white-space: pre-wrap;
        word-break: break-all;
        max-height: 200px;
        overflow-y: auto;
        color: var(--text-primary);
        background: transparent;
    }

    .detail-value.stack {
        font-size: 0.7rem;
        color: var(--text-secondary);
        max-height: 150px;
    }
</style>
