import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

DOMPurify.addHook('afterSanitizeAttributes', (node: any) => {
    if (node && (node as any).tagName === 'A') {
        (node as any).setAttribute('target', '_blank');
        (node as any).setAttribute('rel', 'noopener noreferrer');
    }
});

export function renderMarkdownSafe(input: string): string {
    const rawHtml = marked.parse(input) as string;
    return DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
}
