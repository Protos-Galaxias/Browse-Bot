console.log('Web Walker: Content script injected.');

const interactiveElements = new Map<string, HTMLElement>();
let elementIdCounter = 0;

/**
 * Рекурсивно обходит DOM-дерево и создает его упрощенное текстовое представление,
 * помечая интерактивные элементы специальными тегами.
 * @returns {string} Упрощенный DOM в виде строки.
 */
function getSimplifiedDom(): string {
    interactiveElements.clear();
    elementIdCounter = 0;

    function isVisible(el: HTMLElement): boolean {
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    function traverse(node: Node): string {
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
            return node.textContent.trim().replace(/\s+/g, ' ');
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }

        const element = node as HTMLElement;

        if (
            !isVisible(element) ||
      ['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'META', 'LINK'].includes(element.tagName)
        ) {
            return '';
        }

        let childrenContent = Array.from(element.childNodes).map(traverse).join(' ');

        const isClickable = window.getComputedStyle(element).cursor === 'pointer';
        const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);

        if ((isClickable || isInput) && (element?.innerText.trim() || element.getAttribute('aria-label') || element.getAttribute('placeholder'))) {
            const id = element.id || `ai-element-${elementIdCounter++}`;
            interactiveElements.set(id, element);

            let type = 'element';
            if (isInput) type = element.tagName.toLowerCase();
            else if (isClickable) type = 'button';

            const textContent = element?.innerText.trim() || element.getAttribute('aria-label') || element.getAttribute('placeholder');

            return `<interactive id="${id}" type="${type}">${textContent}</interactive>`;
        }

        return childrenContent;
    }

    const result = traverse(document.body);
    console.log('Web Walker: Simplified DOM created, elements tracked:', interactiveElements.size);
    return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Web Walker: Message received in content script', message);

    switch (message.type) {
    case 'GET_CONTEXT':
        const simplifiedDom = getSimplifiedDom();

        sendResponse({ dom: simplifiedDom });
        break;

    case 'EXECUTE_CLICK':
        const elementToClick = interactiveElements.get(message.elementId);
        if (elementToClick) {
            elementToClick.click();
            console.log(`Web Walker: Clicked element ${message.elementId}`);
            sendResponse({ status: 'ok' });
        } else {
            console.error(`Web Walker: Element with id ${message.elementId} not found for CLICK.`);
            sendResponse({ status: 'error', reason: 'Element not found' });
        }
        break;

    case 'PARSE_PAGE':
        console.log('Web Walker Parser: Received PARSE_PAGE message with query:', message.query);
        const parsedContent = parseAndFilterPageContent(message.query);
        console.log('Web Walker Parser: Parsed content:111', parsedContent);
        sendResponse({ type: 'PARSE_RESULT', data: parsedContent });
        break;

    case 'EXECUTE_TYPE':
        const elementToType = interactiveElements.get(message.elementId) as HTMLInputElement | HTMLTextAreaElement;
        if (elementToType) {
            elementToType.value = message.text;
            console.log(`Web Walker: Typed into element ${message.elementId}`);
            sendResponse({ status: 'ok' });
        } else {
            console.error(`Web Walker: Element with id ${message.elementId} not found for TYPE.`);
            sendResponse({ status: 'error', reason: 'Element not found' });
        }
        break;

    default:
        console.warn('Web Walker: Unknown message type received', message.type);
        break;
    }

    return true;
});

function parseAndFilterPageContent(query: string): string {
    const relevantContent: string[] = [];

    // Simple approach: Iterate through all elements that might contain relevant text.
    // A more advanced approach would involve semantic understanding or element ranking.
    const elements = document.body.querySelectorAll('p, h1, h2, h3, a, button, input, textarea, li');

    elements.forEach(element => {
        const markdown = domToMarkdown(element, query);
        // Simple keyword matching for demonstration. Replace with more robust NLP if needed.
        if (markdown && new RegExp(query.split(' ').join('|\s*'), 'i').test(markdown)) {
            relevantContent.push(markdown);
        }
    });

    // If no specific elements match, fall back to a simplified version of the whole body
    if (relevantContent.length === 0) {
        const bodyMarkdown = domToMarkdown(document.body, query);
        if (bodyMarkdown) {
            return `Full page context (no specific matches for "${query}"):\n${bodyMarkdown.substring(0, 5000)}...`;
        }
    }

    return relevantContent.join('\n\n');
}

function domToMarkdown(element: Element, query: string): string {
    let markdown = '';

    if (!element || !element.tagName) {
        return '';
    }

    const tagName = element.tagName.toLowerCase();
    const textContent = element.textContent?.trim().replace(/\s+/g, ' ') || '';
    const ariaLabel = element.getAttribute('aria-label');
    const placeholder = element.getAttribute('placeholder');
    const href = element.getAttribute('href');
    const value = (element as HTMLInputElement).value;

    // Prioritize meaningful text content
    let mainContent = textContent;
    if (ariaLabel) mainContent = ariaLabel + (mainContent ? ` (${mainContent})` : '');
    if (placeholder) mainContent = placeholder + (mainContent ? ` (${mainContent})` : '');
    if (value && ['input', 'textarea'].includes(tagName)) mainContent = value + (mainContent ? ` (${mainContent})` : '');

    const isInteractive = ['a', 'button', 'input', 'textarea', 'select'].includes(tagName) || element.hasAttribute('onclick') || element.hasAttribute('role') && ['button', 'link', 'checkbox', 'radio'].includes(element.getAttribute('role') || '');

    if (isInteractive) {
        markdown += `<${tagName}`; // Use HTML-like tags for interactive elements
        if (element.id) markdown += ` id="${element.id}"`;
        if (href) markdown += ` href="${href}"`;
        markdown += `>${mainContent}</${tagName}>`;
    } else if (mainContent) {
    // For non-interactive elements, just include their text content, maybe with a tag if significant
        if (['h1', 'h2', 'h3', 'p', 'li'].includes(tagName)) {
            markdown += `<${tagName}>${mainContent}</${tagName}>`;
        } else {
            markdown += mainContent;
        }
    }

    // Recursively process children
    Array.from(element.children).forEach(child => {
        markdown += domToMarkdown(child as HTMLElement, query);
    });

    return markdown;
}

chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' }).catch(e => console.error('Web Walker: Failed to send CONTENT_SCRIPT_READY message:', e));

