import type { ToolContext } from './types';

export const resolveTabId = (context: ToolContext, tabId?: number): number => {
    const available = Array.isArray(context.tabs) && context.tabs.length > 0 ? context.tabs.map(t => t.id) : [];
    if (available.length === 0) throw new Error('No tabs available in ToolContext');
    if (typeof tabId === 'number' && available.includes(tabId)) return tabId;
    return available[0];
};


