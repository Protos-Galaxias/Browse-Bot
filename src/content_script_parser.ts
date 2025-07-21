console.log('Web Walker: Content script parser injected.');

/**
 * Converts a DOM element into a simplified markdown-like string.
 * This function attempts to capture text content and attributes that might be useful,
 * especially for interactive elements.
 */
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

/**
 * Iterates through the DOM, converts relevant parts to markdown, and filters based on query.
 */
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PARSE_PAGE') {
        console.log('Web Walker Parser: Received PARSE_PAGE message with query:', message.query);
        const parsedContent = parseAndFilterPageContent(message.query);
        sendResponse({ type: 'PARSE_RESULT', data: parsedContent });
    }
    return true;
});
