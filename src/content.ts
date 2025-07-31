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

function parsePageForInteractiveElements(): { id: string, markdownValue: string }[] {
    elementCache.clear();
    document.querySelectorAll('[data-aid]').forEach(el => el.removeAttribute('data-aid'));

    const interactiveSelector = [
        'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]', '[role="option"]', '[onclick]'
    ].join(', ');

    const elements = Array.from(document.querySelectorAll<HTMLElement>(interactiveSelector));
    const results: { id: string, markdownValue: string }[] = [];
    let aidCounter = 0;

    for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || window.getComputedStyle(el).visibility === 'hidden') {
            continue;
        }

        const aid = String(++aidCounter);
        el.setAttribute('data-aid', aid);
        elementCache.set(aid, el);

        const markdownValue = nodeToMarkdown(el);

        results.push({
            id: aid,
            markdownValue: markdownValue
        });
    }
    return results;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Web Walker: Message received in content script', message);

    switch (message.type) {
        case 'PARSE_CURRENT_PAGE': {
            const parsedElements = parsePageForInteractiveElements();
            console.log(`Web Walker: Parsed ${parsedElements.length} interactive elements.`);
            sendResponse({ type: 'PARSE_RESULT', data: parsedElements });
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
        case 'INSERT_TEXT': {
            const elementToInsert = elementCache.get(String(message.aid));
            if (elementToInsert && (elementToInsert instanceof HTMLInputElement || elementToInsert instanceof HTMLTextAreaElement)) {
                elementToInsert.value = message.text;
                sendResponse({ status: 'ok' });
            } else {
                console.error(`Web Walker: Input element with aid=${message.aid} not found.`);
                sendResponse({ status: 'error', message: `Input element with aid=${message.aid} not found` });
            }
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
