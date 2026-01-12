// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import { ConfigService } from './ConfigService';
import type { LanguageModel } from 'ai';

export type ProviderDescriptor = {
    name: string;
    getClient: (configService: ConfigService) => Promise<unknown>;
    getModel: (client: unknown, modelName: string) => LanguageModel;
    storageActiveModel: string;
    storageModels: string;
    storageApiKey?: string;
    storageBaseURL?: string;
    activeModelFallback?: string;
    defaultModelName: string;
    defaultModels: string[];
    defaultMaxContextTokens?: number;
};

export const ProviderConfigs: Record<string, ProviderDescriptor> = {
    openrouter: {
        name: 'openrouter',
        async getClient(configService: ConfigService) {
            const apiKey = await configService.get<string>('apiKey');
            if (!apiKey) throw new Error('API key not configured');
            return createOpenRouter({ apiKey });
        },
        getModel(client: unknown, modelName: string): LanguageModel {
            return (client as { chat: (m: string) => LanguageModel }).chat(modelName);
        },
        storageActiveModel: 'activeModel_openrouter',
        storageModels: 'models_openrouter',
        storageApiKey: 'apiKey',
        activeModelFallback: 'activeModel',
        defaultModelName: 'openai/gpt-4.1-mini',
        defaultModels: ['openai/gpt-4.1-mini']
    },
    openai: {
        name: 'openai',
        async getClient(configService: ConfigService) {
            const apiKey = await configService.get<string>('openaiApiKey');
            if (!apiKey) throw new Error('OpenAI API key not configured');
            return createOpenAI({ apiKey });
        },
        getModel(client: unknown, modelName: string): LanguageModel {
            return (client as { chat: (m: string) => LanguageModel }).chat(modelName);
        },
        storageActiveModel: 'activeModel_openai',
        storageModels: 'models_openai',
        storageApiKey: 'openaiApiKey',
        activeModelFallback: 'activeModel',
        defaultModelName: 'gpt-4.1-mini',
        defaultModels: ['gpt-4.1-mini']
    },
    xai: {
        name: 'xai',
        async getClient(configService: ConfigService) {
            const apiKey = await configService.get<string>('xaiApiKey');
            if (!apiKey) throw new Error('xAI API key not configured');
            const baseURL = await configService.get<string>('xaiBaseURL');
            return baseURL && typeof baseURL === 'string' && baseURL.trim().length > 0
                ? createXai({ apiKey, baseURL })
                : createXai({ apiKey });
        },
        getModel(client: unknown, modelName: string): LanguageModel {
            return (client as (id: string) => LanguageModel)(modelName);
        },
        storageActiveModel: 'activeModel_xai',
        storageModels: 'models_xai',
        storageApiKey: 'xaiApiKey',
        storageBaseURL: 'xaiBaseURL',
        activeModelFallback: 'activeModel',
        defaultModelName: 'grok-3',
        defaultModels: ['grok-3']
    },
    ollama: {
        name: 'ollama',
        async getClient(configService: ConfigService) {
            const baseURL = await configService.get<string>('ollamaBaseURL');
            const url = baseURL && typeof baseURL === 'string' && baseURL.trim().length > 0
                ? baseURL.replace(/\/api\/?$/, '') + '/v1'
                : 'http://localhost:11434/v1';
            // Use OpenAI-compatible endpoint - same approach as LM Studio which works with CORS
            return createOpenAI({ baseURL: url, apiKey: 'ollama' });
        },
        getModel(client: unknown, modelName: string): LanguageModel {
            return (client as { chat: (m: string) => LanguageModel }).chat(modelName);
        },
        storageActiveModel: 'activeModel_ollama',
        storageModels: 'models_ollama',
        storageBaseURL: 'ollamaBaseURL',
        activeModelFallback: 'activeModel',
        defaultModelName: 'phi3',
        defaultModels: ['phi3'],
        defaultMaxContextTokens: 4096
    },
    lmstudio: {
        name: 'lmstudio',
        async getClient(configService: ConfigService) {
            const baseURL = await configService.get<string>('lmstudioBaseURL');
            const url = baseURL && typeof baseURL === 'string' && baseURL.trim().length > 0
                ? baseURL
                : 'http://localhost:1234/v1';
            return createOpenAI({ baseURL: url, apiKey: 'lm-studio' });
        },
        getModel(client: unknown, modelName: string): LanguageModel {
            return (client as { chat: (m: string) => LanguageModel }).chat(modelName);
        },
        storageActiveModel: 'activeModel_lmstudio',
        storageModels: 'models_lmstudio',
        storageBaseURL: 'lmstudioBaseURL',
        activeModelFallback: 'activeModel',
        defaultModelName: 'qwen3-4b',
        defaultModels: ['qwen3-4b'],
        defaultMaxContextTokens: 4096
    }
};


