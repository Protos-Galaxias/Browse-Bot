// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import type { ToolContext } from './types';
import { reportError } from '../logger';

export const resolveTabId = (context: ToolContext, tabId?: number): number => {
    const available = Array.isArray(context.tabs) && context.tabs.length > 0 ? context.tabs.map(t => t.id) : [];
    if (available.length === 0) {
        const error = new Error('No tabs available in ToolContext');
        reportError(error, 'Нет доступных вкладок для выполнения операции');
        throw error;
    }
    if (typeof tabId === 'number' && available.includes(tabId)) return tabId;
    return available[0];
};

export const sendToTabOrThrow = async (context: ToolContext, message: any, tabId?: number): Promise<any> => {
    const response = await context.sendMessageToTab(message, tabId);
    if (response && typeof response === 'object' && 'status' in response) {
        if ((response as any).status === 'error') {
            const msg = typeof (response as any).message === 'string' ? (response as any).message : 'Operation failed in content script';
            throw new Error(msg);
        }
    }
    return response;
};



