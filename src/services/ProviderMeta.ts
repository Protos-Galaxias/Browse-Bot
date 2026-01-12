// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import type { ProviderDescriptor } from './ProviderConfigs';

// UI-only descriptor without client/model factories. Mirrors metadata fields.
export type ProviderMetaDescriptor = Pick<ProviderDescriptor,
    'name' |
    'storageActiveModel' |
    'storageModels' |
    'storageApiKey' |
    'storageBaseURL' |
    'activeModelFallback' |
    'defaultModelName' |
    'defaultModels'
>;

export const ProviderMeta: Record<string, ProviderMetaDescriptor> = {
    openrouter: {
        name: 'openrouter',
        storageActiveModel: 'activeModel_openrouter',
        storageModels: 'models_openrouter',
        storageApiKey: 'apiKey',
        activeModelFallback: 'activeModel',
        defaultModelName: 'openai/gpt-4.1-mini',
        defaultModels: ['openai/gpt-4.1-mini']
    },
    openai: {
        name: 'openai',
        storageActiveModel: 'activeModel_openai',
        storageModels: 'models_openai',
        storageApiKey: 'openaiApiKey',
        activeModelFallback: 'activeModel',
        defaultModelName: 'gpt-4.1-mini',
        defaultModels: ['gpt-4.1-mini']
    },
    xai: {
        name: 'xai',
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
        storageActiveModel: 'activeModel_ollama',
        storageModels: 'models_ollama',
        storageBaseURL: 'ollamaBaseURL',
        activeModelFallback: 'activeModel',
        defaultModelName: 'phi3',
        defaultModels: ['phi3']
    },
    lmstudio: {
        name: 'lmstudio',
        storageActiveModel: 'activeModel_lmstudio',
        storageModels: 'models_lmstudio',
        storageBaseURL: 'lmstudioBaseURL',
        activeModelFallback: 'activeModel',
        defaultModelName: 'qwen3-4b',
        defaultModels: ['qwen3-4b']
    }
};


