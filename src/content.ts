console.log('Web Walker: Content script injected and running.');

const elementCache = new Map<string, HTMLElement>();

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
    console.log('Web Walker: Message received in content script', message);

    switch (message.type) {
    case 'PARSE_PAGE_ALL': {
        const parsedElements = parsePageForInteractiveElements(message.tid);
        const blocks = parsePageForMeaningfulText();
        console.log(`Web Walker: Parsed ${parsedElements.length} interactive elements and ${blocks.length} text blocks.`);
        sendResponse({ type: 'PARSE_ALL_RESULT', data: { interactive: parsedElements, text: blocks } });
        break;
    }
    case 'PARSE_CURRENT_PAGE': {
        const parsedElements = parsePageForInteractiveElements(message.tid);
        console.log(`Web Walker: Parsed ${parsedElements.length} interactive elements.`);
        sendResponse({ type: 'PARSE_RESULT', data: parsedElements });
        break;
    }
    case 'PARSE_PAGE_TEXT': {
        const blocks = parsePageForMeaningfulText();
        console.log(`Web Walker: Parsed ${blocks.length} text blocks.`);
        sendResponse({ type: 'TEXT_PARSE_RESULT', data: blocks });
        break;
    }
    case 'CLICK_ON_ELEMENT': {
        const elementToClick = elementCache.get(String(message.aid));
        if (elementToClick) {
            elementToClick.click();
            sendResponse({ status: 'ok' });
        } else {
            console.error(`Web Walker: Element with aid=${message.aid} not found.`);
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
            console.error(`Web Walker: Input element with aid=${message.aid} not found.`);
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
                    console.warn('YouTube: Кнопка "Ещё" не найдена');
                    return;
                }
                await sleep(1000);
                const transcriptBtn = document.querySelector(
                    'ytd-video-description-transcript-section-renderer.style-scope:nth-child(2) > div:nth-child(3) > div:nth-child(1) > ytd-button-renderer:nth-child(1) > yt-button-shape:nth-child(1) > button:nth-child(1)'
                ) as HTMLElement | null;
                if (transcriptBtn) {
                    transcriptBtn.click();
                } else {
                    console.warn('YouTube: Кнопка "Показать стенограмму" не найдена');
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
                console.log('YouTube: Очищенные субтитры', cleaned);
                sendResponse({ status: 'ok', subtitles: cleaned });
            } catch (e) {
                console.error('Failed to extract YouTube subtitles', e);
                sendResponse({ status: 'error', message: 'Failed to extract YouTube subtitles' });
            }
        })();
        break;
    }
    default: {
        console.warn('Web Walker: Unknown message type received', message.type);
        sendResponse({ status: 'error', message: 'Unknown message type' });
        break;
    }
    }
    return true;
});

console.log('Web Walker: Content script setup complete.');
