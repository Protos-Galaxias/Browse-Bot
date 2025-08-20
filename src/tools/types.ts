import type { AIService as AIServiceType } from '../services/AIService';

export interface ToolContext {
    aiService: AIServiceType;
    tabs: Array<{ id: number; title?: string; url?: string }>;
    getInteractiveElements: () => any[];
    setInteractiveElements: (elements: any[]) => void;
    sendMessageToTab: (message: any, tabId?: number) => Promise<any>;
}

export type ToolOutput = {
    success: boolean;
    error?: string;
    [key: string]: any;
};
