export function getHost(url?: string): string {
    if (!url) return 'tab';
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}
