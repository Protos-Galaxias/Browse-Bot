// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

console.log('Browse Bot: Content script injected and running.');

// DOM marker for eval system to detect content script is loaded
document.documentElement.setAttribute('data-browse-bot-loaded', 'true');

const elementCache = new Map<string, HTMLElement>();

async function runExternalCode(code: string, args: unknown): Promise<unknown> {
    const api = {
        query: (selector: string) => document.querySelector(selector),
        queryAll: (selector: string) => Array.from(document.querySelectorAll(selector)),
        click: (selector: string) => {
            const el = document.querySelector(selector) as HTMLElement | null;
            if (el) { el.click(); return true; }
            return false;
        },
        wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
        log: (...a: unknown[]) => console.log('External tool:', ...a)
    } as const;

    const trimmed = String(code || '').trim();
    if (!trimmed) throw new Error('No code provided');
    // Prefer sandbox first to avoid CSP console errors; then try main-world injection; fallback to eval if both fail
    try {
        return await runExternalCodeInSandbox(trimmed, args);
    } catch {
        try {
            return await runExternalCodeInPageWorld(trimmed, args);
        } catch {
            try {
                const isFunctionLike = /^(async\s*)?function|^\(.*\)\s*=>|^(async\s*)?\(.*\)\s*=>/.test(trimmed);
                if (isFunctionLike) {
                    const fn = (0, eval)(`(${trimmed})`);
                    if (typeof fn !== 'function') throw new Error('Provided code is not a function');
                    return await fn({ args, api, document, window });
                }
                const runner = new Function('args', 'api', 'document', 'window', '"use strict"; return (async () => {\n' + trimmed + '\n})()');
                return await (runner as unknown as (a: unknown, b: typeof api, c: Document, d: Window) => Promise<unknown>)(args, api, document, window);
            } catch (e2) {
                const msg = e2 instanceof Error ? e2.message : String(e2);
                throw new Error(msg);
            }
        }
    }
}

function injectSandboxModule(iframe: HTMLIFrameElement): void {
    try {
        const cw = iframe.contentWindow;
        const doc = cw?.document;
        if (!cw || !doc) return;
        /* eslint-disable quotes */
        const moduleCode = [
            'const pending = new Map();',
            "function uuid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }",
            "function send(msg) { try { parent.postMessage(Object.assign({ source: 'WW_EXT_IFRAME' }, msg), '*'); } catch (e) {} }",
            "window.addEventListener('message', async (ev) => {",
            "  const data = ev && ev.data ? ev.data : {};",
            "  if (!data || data.source !== 'WW_EXT_PARENT') return;",
            "  if (data.type === 'RUN') {",
            "    const { id, code, args } = data;",
            "    const api = {",
            "      click: (selector) => new Promise((resolve) => { const callId = uuid(); pending.set(callId, resolve); send({ type: 'API', callId, method: 'click', params: { selector } }); }),",
            "      query: (selector) => new Promise((resolve) => { const callId = uuid(); pending.set(callId, resolve); send({ type: 'API', callId, method: 'query', params: { selector } }); }),",
            "      queryAllText: (selector) => new Promise((resolve) => { const callId = uuid(); pending.set(callId, resolve); send({ type: 'API', callId, method: 'queryAllText', params: { selector } }); }),",
            "      wait: (ms) => new Promise((r) => setTimeout(r, Number(ms)||0)),",
            "      log: (...a) => send({ type: 'LOG', args: a })",
            "    };",
            "    try {",
            "      const isFunctionLike = /^(async\\s*)?function|^\\(.*\\)\\s*=>|^(async\\s*)?\\(.*\\)\\s*=>/.test(String(code));",
            "      let result;",
            "      if (isFunctionLike) {",
            "        const fn = (0, eval)('(' + String(code) + ')');",
            "        if (typeof fn !== 'function') throw new Error('Provided code is not a function');",
            "        result = await fn({ args, api });",
            "      } else {",
            "        const body = '\\\"use strict\\\"; return (async (ctx) => {\\n' + String(code) + '\\n})(ctx)';",
            "        const runner = new Function('ctx', body);",
            "        result = await runner({ args, api });",
            "      }",
            "      send({ type: 'RESULT', id, ok: true, result });",
            "    } catch (err) {",
            "      const msg = err && err.message ? err.message : String(err);",
            "      send({ type: 'RESULT', id, ok: false, error: msg });",
            "    }",
            "  } else if (data.type === 'API_RESULT') {",
            "    const { callId, ok, result, error } = data;",
            "    const resolve = pending.get(callId);",
            "    if (resolve) { pending.delete(callId); resolve({ ok, result, error }); }",
            "  }",
            "}, false);"
        ].join('\n');
        /* eslint-enable quotes */
        const moduleBlob = new Blob([moduleCode], { type: 'text/javascript' });
        const moduleUrl = URL.createObjectURL(moduleBlob);
        const scriptEl = doc.createElement('script');
        scriptEl.type = 'module';
        scriptEl.src = moduleUrl;
        doc.body.appendChild(scriptEl);
    } catch { /* noop */ }
}

function ensureSandboxIframe(): HTMLIFrameElement {
    const existing = document.getElementById('__ww_ext_sandbox') as HTMLIFrameElement | null;
    if (existing && existing.contentWindow) return existing;
    const iframe = document.createElement('iframe');
    iframe.id = '__ww_ext_sandbox';
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.position = 'fixed';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    const html = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';
    try {
        const docBlob = new Blob([html], { type: 'text/html' });
        const docUrl = URL.createObjectURL(docBlob);
        iframe.src = docUrl;
        // We intentionally do not revoke immediately; revocation would unload the iframe.
    } catch {
        // Fallback to srcdoc if Blob URL creation fails
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        iframe.srcdoc = html;
    }
    document.documentElement.appendChild(iframe);
    const attach = () => { try { injectSandboxModule(iframe); } catch { /* noop */ } };
    iframe.addEventListener('load', attach, { once: true });
    try {
        if (iframe.contentDocument && (iframe.contentDocument.readyState === 'interactive' || iframe.contentDocument.readyState === 'complete')) {
            attach();
        }
    } catch { /* noop */ }
    return iframe;
}

async function runExternalCodeInSandbox(code: string, args: unknown, timeoutMs: number = 10000): Promise<unknown> {
    const iframe = ensureSandboxIframe();
    const cw = iframe.contentWindow;
    if (!cw) throw new Error('Sandbox not available');
    const runId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    return await new Promise((resolve, reject) => {
        const onMessage = (ev: MessageEvent) => {
            const data = ev && ev.data ? ev.data : {};
            if (!data || data.source !== 'WW_EXT_IFRAME') return;
            if (data.type === 'RESULT' && data.id === runId) {
                window.removeEventListener('message', onMessage, false);
                clearTimeout(timer);
                if (data.ok) resolve(data.result);
                else reject(new Error(String(data.error || 'External sandbox error')));
            } else if (data.type === 'API') {
                const { callId, method, params } = data;
                let ok = true; let result: unknown = undefined; let error: string | undefined;
                try {
                    if (method === 'click') {
                        const el = document.querySelector(String(params.selector)) as HTMLElement | null;
                        if (el) { el.click(); result = true; } else { result = false; }
                    } else if (method === 'query') {
                        const el = document.querySelector(String(params.selector)) as HTMLElement | null;
                        result = Boolean(el);
                    } else if (method === 'queryAllText') {
                        const els = Array.from(document.querySelectorAll(String(params.selector))) as HTMLElement[];
                        result = els.map(n => (n.innerText || n.textContent || '').trim()).filter(Boolean);
                    } else {
                        ok = false; error = 'Unknown API method';
                    }
                } catch (e) {
                    ok = false; error = e instanceof Error ? e.message : 'API error';
                }
                cw.postMessage({ source: 'WW_EXT_PARENT', type: 'API_RESULT', callId, ok, result, error }, '*');
            }
        };
        window.addEventListener('message', onMessage, false);
        const timer = setTimeout(() => {
            try { window.removeEventListener('message', onMessage, false); } catch { /* noop */ }
            reject(new Error('Sandbox execution timed out'));
        }, timeoutMs);
        cw.postMessage({ source: 'WW_EXT_PARENT', type: 'RUN', id: runId, code, args }, '*');
    });
}

async function runExternalCodeInPageWorld(code: string, args: unknown, timeoutMs: number = 6000): Promise<unknown> {
    return await new Promise((resolve, reject) => {
        try {
            const eventId = 'ww_ext_result_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
            const onResult = (ev: Event) => {
                try {
                    const ce = ev as CustomEvent;
                    const data = ce?.detail;
                    if (!data || data.eventId !== eventId) return;
                    document.removeEventListener('ww_ext_result', onResult as never);
                    clearTimeout(timer);
                    if (data && data.ok) resolve(data.result);
                    else reject(new Error(String(data?.error || 'Main world execution failed')));
                } catch (e) {
                    document.removeEventListener('ww_ext_result', onResult as never);
                    clearTimeout(timer);
                    reject(e);
                }
            };
            document.addEventListener('ww_ext_result', onResult as never, { once: true });

            const script = document.createElement('script');
            const argsJson = (() => { try { return JSON.stringify(args ?? null); } catch { return 'null'; } })();
            const isFunctionLike = /^(async\s*)?function|^\(.*\)\s*=>|^(async\s*)?\(.*\)\s*=>/.test(code);
            const payload = isFunctionLike
                ? [
                    '(function(){',
                    '  const __WW_ARGS__ = ' + argsJson + ';',
                    '  try {',
                    '    const __WW_FN__ = ' + code + ';',
                    '    Promise.resolve(__WW_FN__(__WW_ARGS__))',
                    '      .then(function(__res){ document.dispatchEvent(new CustomEvent("ww_ext_result", { detail: { eventId: "' + eventId + '", ok: true, result: __res } })); })',
                    '      .catch(function(e){ document.dispatchEvent(new CustomEvent("ww_ext_result", { detail: { eventId: "' + eventId + '", ok: false, error: (e && e.message) ? e.message : String(e) } })); });',
                    '  } catch (e) {',
                    '    document.dispatchEvent(new CustomEvent("ww_ext_result", { detail: { eventId: "' + eventId + '", ok: false, error: (e && e.message) ? e.message : String(e) } }));',
                    '  }',
                    '})();'
                ].join('\n')
                : [
                    '(function(){',
                    '  const __WW_ARGS__ = ' + argsJson + ';',
                    '  (async function(){',
                    '    try {',
                    '      const __res = await (async function(ctx){',
                    code,
                    '      })(__WW_ARGS__);',
                    '      document.dispatchEvent(new CustomEvent("ww_ext_result", { detail: { eventId: "' + eventId + '", ok: true, result: __res } }));',
                    '    } catch (e) {',
                    '      document.dispatchEvent(new CustomEvent("ww_ext_result", { detail: { eventId: "' + eventId + '", ok: false, error: (e && e.message) ? e.message : String(e) } }));',
                    '    }',
                    '  })();',
                    '})();'
                ].join('\n');
            script.textContent = payload;
            (document.head || document.documentElement).appendChild(script);
            script.remove();
            const timer = setTimeout(() => {
                try { document.removeEventListener('ww_ext_result', onResult as never); } catch { /* noop */ }
                reject(new Error('Page-world execution timed out'));
            }, timeoutMs);
        } catch (e) {
            reject(e);
        }
    });
}

function nodeToMarkdown(node: HTMLElement): string {
    const tagName = node.tagName.toLowerCase();
    let content = node.textContent?.trim().replace(/\s+/g, ' ') || '';
    const ariaLabel = node.getAttribute('aria-label');

    if (ariaLabel) {
        content = ariaLabel;
    }

    const id = node.id;
    const className = node.className;
    let attributes = '';
    if (id) {
        attributes += ` id="${id}"`;
    }
    if (typeof className === 'string' && className) {
        attributes += ` class="${className}"`;
    }

    switch (tagName) {
    case 'a': {
        const href = node.getAttribute('href') || '#';
        return `[${content}](${href})${attributes}`;
    }
    case 'button': {
        return `[button: ${content}${attributes}]`;
    }
    case 'input':
    case 'textarea': {
        const placeholder = node.getAttribute('placeholder') || '';
        const value = (node as HTMLInputElement).value || '';
        return `[input: ${placeholder || content}, current value: "${value}"${attributes}]`;
    }
    case 'h1':
    case 'h2':
    case 'h3': {
        return `### ${content}`;
    }
    default: {
        if (node.getAttribute('role')?.match(/button|link/)) {
            return `[interactive: ${content}${attributes}]`;
        }
        return content.length > 2 ? content : '';
    }
    }
}

function parsePageForInteractiveElements(tid: number): { id: string, tid: number, markdownValue: string }[] {
    elementCache.clear();
    document.querySelectorAll('[data-aid]').forEach(el => el.removeAttribute('data-aid'));

    const interactiveSelector = [
        'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]', '[role="option"]', '[onclick]'
    ].join(', ');

    const elements = Array.from(document.querySelectorAll<HTMLElement>(interactiveSelector));
    const results: { id: string, tid: number, markdownValue: string }[] = [];
    let aidCounter = 0;

    for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || window.getComputedStyle(el).visibility === 'hidden') {
            continue;
        }

        const aid = String(++aidCounter);
        const id = `${tid}:${aid}`;
        el.setAttribute('data-aid', id);
        elementCache.set(id, el);

        const markdownValue = nodeToMarkdown(el);

        results.push({
            id,
            tid,
            markdownValue
        });
    }
    return results;
}

function parsePageForMeaningfulText(): string[] {
    const excludeContainers = new Set(['SCRIPT', 'STYLE']);
    const selector = [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'li', 'dt', 'dd', 'figcaption', 'blockquote',
        'article', 'section', 'main',
        'span', 'strong', 'em',
        '[itemprop="name"]', '[itemprop="description"]'
    ].join(', ');

    const isVisible = (el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const style = window.getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        let node: HTMLElement | null = el;
        while (node) {
            if (excludeContainers.has(node.tagName)) return false;
            node = node.parentElement;
        }
        return true;
    };

    const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
    const blocks: string[] = [];
    const seen = new Set<string>();

    // Include document.title as the first block when meaningful
    const title = collapse(document.title || '');
    if (title && !seen.has(title)) { seen.add(title); blocks.push(title); }

    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
    for (const el of nodes) {
        if (!isVisible(el)) continue;
        const text = collapse(el.innerText || el.textContent || '');
        if (text.length < 3) continue;

        // Skip if this exact text already captured (avoid duplicates from nested elements)
        if (seen.has(text)) continue;

        // Heuristic: prefer higher-level blocks; if parent has same text, skip child
        const parent = el.parentElement;
        if (parent) {
            const parentText = collapse(parent.innerText || '');
            if (parentText === text) continue;
        }

        seen.add(text);
        blocks.push(text);
    }

    return blocks;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Browse Bot: Message received in content script', message);

    switch (message.type) {
    case 'PARSE_PAGE_ALL': {
        const parsedElements = parsePageForInteractiveElements(message.tid);
        const blocks = parsePageForMeaningfulText();
        console.log(`Browse Bot: Parsed ${parsedElements.length} interactive elements and ${blocks.length} text blocks.`);
        sendResponse({ type: 'PARSE_ALL_RESULT', data: { interactive: parsedElements, text: blocks } });
        break;
    }
    case 'PARSE_CURRENT_PAGE': {
        const parsedElements = parsePageForInteractiveElements(message.tid);
        console.log(`Browse Bot: Parsed ${parsedElements.length} interactive elements.`);
        sendResponse({ type: 'PARSE_RESULT', data: parsedElements });
        break;
    }
    case 'PARSE_PAGE_TEXT': {
        const blocks = parsePageForMeaningfulText();
        console.log(`Browse Bot: Parsed ${blocks.length} text blocks.`);
        sendResponse({ type: 'TEXT_PARSE_RESULT', data: blocks });
        break;
    }
    case 'CLICK_ON_ELEMENT': {
        const elementToClick = elementCache.get(String(message.aid));
        if (elementToClick) {
            elementToClick.click();
            sendResponse({ status: 'ok' });
        } else {
            console.error(`Browse Bot: Element with aid=${message.aid} not found.`);
            sendResponse({ status: 'error', message: `Element with aid=${message.aid} not found` });
        }
        break;
    }
    case 'OPEN_LINK': {
        const el = elementCache.get(String(message.aid));
        if (!el) {
            sendResponse({ status: 'error', message: `Element with aid=${message.aid} not found` });
            break;
        }
        let href: string | null = null;
        let targetBlank = false;
        if (el instanceof HTMLAnchorElement) {
            href = el.getAttribute('href');
            targetBlank = (el.getAttribute('target') || '').toLowerCase() === '_blank';
        } else {
            // Try to find ancestor anchor
            const a = el.closest('a') as HTMLAnchorElement | null;
            if (a) {
                href = a.getAttribute('href');
                targetBlank = (a.getAttribute('target') || '').toLowerCase() === '_blank';
            }
        }
        if (!href) {
            sendResponse({ status: 'error', message: 'No href found for target element' });
            break;
        }
        try {
            const absolute = new URL(href, document.baseURI).href;
            // Request background to open to avoid popup blockers
            chrome.runtime.sendMessage({ type: 'OPEN_LINK_IN_BG', url: absolute });
            sendResponse({ status: 'ok', url: absolute, targetBlank });
        } catch {
            sendResponse({ status: 'error', message: 'Failed to resolve URL' });
        }
        break;
    }
    case 'GET_LINK_INFO': {
        const el = elementCache.get(String(message.aid));
        if (!el) { sendResponse({ status: 'error', message: `Element with aid=${message.aid} not found` }); break; }
        let href: string | null = null;
        let targetBlank = false;
        if (el instanceof HTMLAnchorElement) {
            href = el.getAttribute('href');
            targetBlank = (el.getAttribute('target') || '').toLowerCase() === '_blank';
        } else {
            const a = el.closest('a') as HTMLAnchorElement | null;
            if (a) {
                href = a.getAttribute('href');
                targetBlank = (a.getAttribute('target') || '').toLowerCase() === '_blank';
            }
        }
        if (!href) { sendResponse({ status: 'ok', href: null, targetBlank: false }); break; }
        try { const absolute = new URL(href, document.baseURI).href; sendResponse({ status: 'ok', href: absolute, targetBlank }); }
        catch { sendResponse({ status: 'ok', href: null, targetBlank }); }
        break;
    }
    case 'INSERT_TEXT': {
        const elementToInsert = elementCache.get(String(message.aid));
        if (elementToInsert && (elementToInsert instanceof HTMLInputElement || elementToInsert instanceof HTMLTextAreaElement)) {
            elementToInsert.value = message.text;
            elementToInsert.dispatchEvent(new Event('input', { bubbles: true }));
            sendResponse({ status: 'ok' });
        } else {
            console.error(`Browse Bot: Input element with aid=${message.aid} not found.`);
            sendResponse({ status: 'error', message: `Input element with aid=${message.aid} not found` });
        }
        break;
    }
    case 'PRESS_ENTER': {
        const el = elementCache.get(String(message.aid));
        const target: HTMLElement | null = (el as HTMLElement) || null;
        type EnterEventInit = { key: string; code: string; keyCode: number; which: number; bubbles: boolean };
        const eventInit: EnterEventInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
        const dispatchOn = (n: Element | Document | Window) => {
            n.dispatchEvent(new KeyboardEvent('keydown', eventInit));
            n.dispatchEvent(new KeyboardEvent('keypress', eventInit));
            n.dispatchEvent(new KeyboardEvent('keyup', eventInit));
        };
        if (target instanceof HTMLElement) {
            dispatchOn(target);
            const form = (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement || target instanceof HTMLSelectElement)
                ? (target.form as HTMLFormElement | null)
                : null;
            try {
                dispatchOn(form || document);
            } catch { void 0; }
        } else {
            dispatchOn(document);
        }
        sendResponse({ status: 'ok' });
        break;
    }
    case 'SELECT_OPTION': {
        const el = elementCache.get(String(message.aid));
        if (el && el instanceof HTMLSelectElement) {
            const matchBy: 'label' | 'value' | undefined = message.matchBy;
            const target = String(message.option ?? '');
            let matched: HTMLOptionElement | undefined;
            for (const opt of Array.from(el.options)) {
                if ((matchBy === 'value' && opt.value === target) ||
                    (matchBy === 'label' && opt.text.trim() === target) ||
                    (!matchBy && (opt.text.trim() === target || opt.value === target))) {
                    matched = opt; break;
                }
            }
            if (matched) {
                el.value = matched.value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                sendResponse({ status: 'ok' });
            } else {
                sendResponse({ status: 'error', message: `Option not found: ${target}` });
            }
        } else {
            sendResponse({ status: 'error', message: `Select with aid=${message.aid} not found` });
        }
        break;
    }
    case 'SET_CHECKBOX': {
        const el = elementCache.get(String(message.aid));
        if (el && el instanceof HTMLInputElement && el.type === 'checkbox') {
            el.checked = Boolean(message.checked);
            el.dispatchEvent(new Event('change', { bubbles: true }));
            sendResponse({ status: 'ok' });
        } else {
            sendResponse({ status: 'error', message: `Checkbox with aid=${message.aid} not found` });
        }
        break;
    }
    case 'SET_RADIO': {
        const el = elementCache.get(String(message.aid));
        if (el && el instanceof HTMLInputElement && el.type === 'radio') {
            if (el.name) {
                const group = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`);
                group.forEach((n) => {
                    if (n instanceof HTMLInputElement) n.checked = (n === el);
                });
            } else {
                el.checked = true;
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            sendResponse({ status: 'ok' });
        } else {
            sendResponse({ status: 'error', message: `Radio with aid=${message.aid} not found` });
        }
        break;
    }
    case 'GET_YT_SUBTITLES': {
        (async () => {
            const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
            const openTranscriptPanel = async () => {
                const moreBtn = document.querySelector('#expand') as HTMLElement | null;
                if (moreBtn) {
                    moreBtn.click();
                } else {
                    console.warn('YouTube: "More" button not found');
                    return;
                }
                await sleep(1000);
                const transcriptBtn = document.querySelector(
                    'ytd-video-description-transcript-section-renderer.style-scope:nth-child(2) > div:nth-child(3) > div:nth-child(1) > ytd-button-renderer:nth-child(1) > yt-button-shape:nth-child(1) > button:nth-child(1)'
                ) as HTMLElement | null;
                if (transcriptBtn) {
                    transcriptBtn.click();
                } else {
                    console.warn('YouTube: "Show transcript" button not found');
                }
            };

            const waitForSegments = async (timeoutMs: number = 12000): Promise<HTMLElement[]> => {
                const start = Date.now();
                let lastCount = 0;
                while (Date.now() - start < timeoutMs) {
                    const segs = Array.from(document.querySelectorAll('ytd-transcript-segment-renderer')) as HTMLElement[];
                    if (segs.length > 0 && segs.length === lastCount) {
                        // stable count across iterations implies loaded
                        return segs;
                    }
                    if (segs.length > 0) lastCount = segs.length;
                    await sleep(300);
                }
                return Array.from(document.querySelectorAll('ytd-transcript-segment-renderer')) as HTMLElement[];
            };

            try {
                await openTranscriptPanel();
                const segments = await waitForSegments(12000);
                const cleaned = segments
                    .map(seg => seg.innerText.trim())
                    .map(text => text
                        .replace(/^\d{1,2}:\d{2}\s*/g, '')
                        .replace(/\[.*?\]/g, '')
                        .trim()
                    )
                    .filter(Boolean)
                    .join('\n');
                console.log('YouTube: Cleaned subtitles', cleaned);
                sendResponse({ status: 'ok', subtitles: cleaned });
            } catch (e) {
                console.error('Failed to extract YouTube subtitles', e);
                sendResponse({ status: 'error', message: 'Failed to extract YouTube subtitles' });
            }
        })();
        break;
    }
    case 'EXTERNAL': {
        (async () => {
            try {
                const result = await runExternalCode(String(message.code || ''), message.args);
                sendResponse({ status: 'ok', result });
            } catch (e) {
                const err = e instanceof Error ? e.message : String(e);
                sendResponse({ status: 'error', message: err });
            }
        })();
        break;
    }
    default: {
        console.warn('Browse Bot: Unknown message type received', message.type);
        sendResponse({ status: 'error', message: 'Unknown message type' });
        break;
    }
    }
    return true;
});

// ============ EVAL INTEGRATION ============
// Listen for config updates from eval system via polling (more reliable than MutationObserver)
function checkForEvalConfig() {
    const configJson = document.documentElement.getAttribute('data-browse-bot-config');
    if (!configJson) {
        return;
    }
    
    // Clear the attribute immediately
    document.documentElement.removeAttribute('data-browse-bot-config');
    
    try {
        const config = JSON.parse(configJson);
        console.log('Browse Bot: Found eval config via polling:', Object.keys(config));
        
        // Forward to service worker to store in extension's IndexedDB
        chrome.runtime.sendMessage({ type: 'SET_CONFIG', config }, (response) => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
                console.error('Browse Bot: SET_CONFIG runtime error:', lastError.message);
                document.documentElement.setAttribute('data-browse-bot-config-result', 'error');
                return;
            }
            console.log('Browse Bot: SET_CONFIG response:', response);
            // Signal completion via DOM attribute
            document.documentElement.setAttribute(
                'data-browse-bot-config-result', 
                response?.ok ? 'ok' : 'error'
            );
        });
    } catch (err) {
        console.error('Browse Bot: Failed to parse config:', err);
        document.documentElement.setAttribute('data-browse-bot-config-result', 'error');
    }
}

// Poll every 200ms for eval config
setInterval(checkForEvalConfig, 200);

// Also check immediately
checkForEvalConfig();

// Listen for eval tasks from the testing system via polling (more reliable than MutationObserver)
function checkForEvalTask() {
    const task = document.documentElement.getAttribute('data-browse-bot-task');
    if (!task) {
        return;
    }
    
    console.log('Browse Bot: Found eval task via polling:', task);
    
    // Clear the attribute immediately
    document.documentElement.removeAttribute('data-browse-bot-task');
    
    // Forward to service worker
    chrome.runtime.sendMessage({ type: 'EVAL_TASK', task }, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
            console.error('Browse Bot: EVAL_TASK runtime error:', lastError.message);
            return;
        }
        console.log('Browse Bot: EVAL_TASK response:', response);
    });
}

// Poll every 200ms for eval task
setInterval(checkForEvalTask, 200);

// Also check immediately
checkForEvalTask();

// Expose function to track tool calls, task completion, and debug info (for eval system)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EVAL_DEBUG') {
        // Append debug message to DOM for selenium to read
        const existing = document.documentElement.getAttribute('data-browse-bot-debug') || '';
        const newMsg = existing ? existing + '\n' + message.message : message.message;
        document.documentElement.setAttribute('data-browse-bot-debug', newMsg);
        console.log('Browse Bot Debug:', message.message);
        sendResponse({ status: 'ok' });
        return true;
    }
    if (message.type === 'EVAL_TOOL_CALLED') {
        // Store tool call in DOM for selenium to read
        const toolCall = {
            name: message.toolName,
            args: message.args,
            timestamp: Date.now()
        };
        try {
            const existing = document.documentElement.getAttribute('data-browse-bot-tools') || '[]';
            const tools = JSON.parse(existing);
            tools.push(toolCall);
            document.documentElement.setAttribute('data-browse-bot-tools', JSON.stringify(tools));
        } catch {
            document.documentElement.setAttribute('data-browse-bot-tools', JSON.stringify([toolCall]));
        }
        sendResponse({ status: 'ok' });
        return true;
    }
    if (message.type === 'EVAL_TASK_COMPLETE') {
        document.documentElement.setAttribute('data-browse-bot-complete', 'true');
        // Store LLM metrics if provided
        if (message.metrics) {
            document.documentElement.setAttribute('data-browse-bot-metrics', JSON.stringify(message.metrics));
        }
        sendResponse({ status: 'ok' });
        return true;
    }
    return false;
});

console.log('Browse Bot: Content script setup complete (with eval support).');
