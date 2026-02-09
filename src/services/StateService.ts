// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { ConfigService } from './ConfigService';

export interface ActionHistory {
  type: string;
  timestamp: number;
  data?: any;
  error?: string;
}

export interface WalkerState {
  currentContent: any | null;
  activeTabId: number | null;
  history: ActionHistory[];
  currentPlan: any[] | null;
  lastError: string | null;
}

export interface WalkerMemory {
  lastEntities?: unknown;
  lastSelection?: unknown;
  pageContext?: {
    url?: string;
    title?: string;
    cartCount?: number;
  };
}

export class StateService {
    private static instance: StateService;
    private state: WalkerState = {
        currentContent: null,
        activeTabId: null,
        history: [],
        currentPlan: null,
        lastError: null
    };
    private memory: WalkerMemory = {};

    private constructor() {}

    static getInstance(): StateService {
        if (!StateService.instance) {
            StateService.instance = new StateService();
        }
        return StateService.instance;
    }

    getState(): WalkerState {
        return { ...this.state };
    }

    getMemory(): WalkerMemory {
        return { ...this.memory };
    }

    setMemory(update: Partial<WalkerMemory>): void {
        this.memory = { ...this.memory, ...update };
    }

    clearMemory(): void {
        this.memory = {};
    }

    async initialize(): Promise<void> {
        try {
            await ConfigService.getInstance().getAll();
            // Load any persisted state if needed
        } catch (error) {
            console.error('Failed to initialize StateService:', error);
            throw error;
        }
    }

    setActiveTab(tabId: number): void {
        this.state.activeTabId = tabId;
    }

    setCurrentContent(content: any | null): void {
        this.state.currentContent = content;
    }

    setCurrentPlan(plan: any[] | null): void {
        this.state.currentPlan = plan;
    }

    addToHistory(action: Omit<ActionHistory, 'timestamp'>): void {
        this.state.history.push({
            ...action,
            timestamp: Date.now()
        });
        // Keep history size manageable
        if (this.state.history.length > 100) {
            this.state.history.shift();
        }
    }

    setError(error: string | Error): void {
        const errorMessage = error instanceof Error ? error.message : error;
        this.state.lastError = errorMessage;
        this.addToHistory({
            type: 'ERROR',
            data: { error: errorMessage }
        });
    }

    clearError(): void {
        this.state.lastError = null;
    }

    reset(): void {
        this.state = {
            currentContent: null,
            activeTabId: this.state.activeTabId, // Keep the active tab
            history: [...this.state.history],
            currentPlan: null,
            lastError: null
        };
    }
}
