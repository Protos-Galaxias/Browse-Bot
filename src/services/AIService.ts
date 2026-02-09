// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { ConfigService } from './ConfigService';
import { generateText, streamText, stepCountIs, Output } from 'ai';
import type { GenerateTextResult, ModelMessage, ToolSet, LanguageModel } from 'ai';
import { ProviderConfigs, type ProviderDescriptor } from './ProviderConfigs';
import { reportErrorKey } from '../logger';

export interface AIGenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export type GenerateWithToolsParams = {
  messages: ModelMessage[];
  tools: ToolSet;
  maxRetries?: number;
  maxToolRoundtrips?: number;
  abortSignal?: AbortSignal;
};

export type StreamTextParams = {
  messages: ModelMessage[];
  onTextChunk: (chunk: string) => void;
  abortSignal?: AbortSignal;
};

export type StreamWithToolsParams = {
  messages: ModelMessage[];
  tools: ToolSet;
  onTextChunk: (chunk: string) => void;
  onChatResponse?: (response: string) => void;
  maxRetries?: number;
  maxToolRoundtrips?: number;
  abortSignal?: AbortSignal;
};

export type StreamWithToolsResult = {
  chatResponse?: string;
  text: string;
  steps: any[];
  usage: any;
};

export interface AIService {
  generate<T>(schema: unknown, systemPrompt: string, prompt: string, options?: AIGenerateOptions): Promise<T>;
  generateSimpleText(systemPrompt: string, prompt: string, options?: AIGenerateOptions): Promise<string>;
  getChatModel(): Promise<LanguageModel>;
  generateWithTools(params: GenerateWithToolsParams): Promise<GenerateTextResult<any, any>>;
  streamText(params: StreamTextParams): Promise<string>;
  streamWithTools(params: StreamWithToolsParams): Promise<StreamWithToolsResult>;
}

export class AiService implements AIService {
    private client: unknown | null = null;
    private readonly configService = ConfigService.getInstance();
    private readonly provider: ProviderDescriptor;

    constructor(provider: ProviderDescriptor) {
        this.provider = provider;
    }

    static fromProviderName(name: string): AiService {
        const key = (name || '').toLowerCase();
        const descriptor = ProviderConfigs[key] || ProviderConfigs['openrouter'];
        return new AiService(descriptor);
    }

    async initialize(): Promise<void> {
        this.client = await this.provider.getClient(this.configService);
    }

    private ensureClient(): unknown {
        if (!this.client) throw new Error('AI Service not initialized. Call initialize() first.');
        return this.client;
    }

    private async resolveModelName(explicit?: string): Promise<string> {
        if (explicit && explicit.trim().length > 0) return explicit;
        const active = await this.configService.get<string>(this.provider.storageActiveModel);
        if (active && active.trim().length > 0) return active;
        if (this.provider.activeModelFallback) {
            const fallback = await this.configService.get<string>(this.provider.activeModelFallback);
            if (fallback && fallback.trim().length > 0) return fallback;
        }
        return this.provider.defaultModelName;
    }

    async getChatModel(): Promise<LanguageModel> {
        const modelName = await this.resolveModelName();
        const client = this.ensureClient();
        return this.provider.getModel(client, modelName);
    }

    async generate<T>(schema: unknown, systemPrompt: string, prompt: string, options: AIGenerateOptions = {}): Promise<T> {
        try {
            const modelName = await this.resolveModelName(options.model);
            const result = await generateText({
                model: this.provider.getModel(this.ensureClient(), modelName) as LanguageModel,
                output: Output.object({ schema: schema as any }),
                system: systemPrompt,
                prompt
            });

            return result.output as T;
        } catch (error) {
            reportErrorKey('errors.aiInvalidJson', error);
            throw error;
        }
    }

    async generateSimpleText(systemPrompt: string, prompt: string, options: AIGenerateOptions = {}): Promise<string> {
        try {
            const modelName = await this.resolveModelName(options.model);
            const result = await generateText({
                model: this.provider.getModel(this.ensureClient(), modelName) as LanguageModel,
                system: systemPrompt,
                prompt,
                temperature: options.temperature || 0.7
            });
            return result.text.trim();
        } catch (error) {
            reportErrorKey('errors.aiGenerateText', error);
            throw error;
        }
    }

    async generateWithTools(params: GenerateWithToolsParams): Promise<GenerateTextResult<any, any>> {
        try {
            const model = await this.getChatModel();
            const maxRetries = typeof params.maxRetries === 'number' ? params.maxRetries : 5;
            const maxToolRoundtrips = typeof params.maxToolRoundtrips === 'number' ? params.maxToolRoundtrips : 10;

            return generateText({
                model,
                messages: params.messages,
                tools: params.tools,
                maxRetries,
                stopWhen: stepCountIs(maxToolRoundtrips),
                abortSignal: params.abortSignal
            }) as unknown as GenerateTextResult<any, any>;
        } catch (error) {
            reportErrorKey('errors.aiGenerateWithTools', error);
            throw error;
        }
    }

    async streamText(params: StreamTextParams): Promise<string> {
        try {
            const model = await this.getChatModel();
            console.log('[AI] streamText starting...');

            const result = streamText({
                model,
                messages: params.messages,
                abortSignal: params.abortSignal
            });

            let chunkCount = 0;
            // Stream text chunks
            for await (const chunk of result.textStream) {
                if (chunk) {
                    chunkCount++;
                    console.log('[AI] Chunk', chunkCount, ':', chunk.substring(0, 30));
                    params.onTextChunk(chunk);
                }
            }

            const finalText = await result.text;
            console.log('[AI] streamText completed. Chunks:', chunkCount, 'Total length:', finalText?.length);

            // Return final text
            return finalText;
        } catch (error) {
            console.error('[AI] streamText error:', error);
            reportErrorKey('errors.aiStreamText', error);
            throw error;
        }
    }

    async streamWithTools(params: StreamWithToolsParams): Promise<StreamWithToolsResult> {
        try {
            const model = await this.getChatModel();
            const maxRetries = typeof params.maxRetries === 'number' ? params.maxRetries : 5;
            const maxToolRoundtrips = typeof params.maxToolRoundtrips === 'number' ? params.maxToolRoundtrips : 10;

            console.log('[AI] streamWithTools starting...');

            const result = streamText({
                model,
                messages: params.messages,
                tools: params.tools,
                maxRetries,
                stopWhen: stepCountIs(maxToolRoundtrips),
                abortSignal: params.abortSignal
            });

            let chatResponse: string | undefined;

            // Consume fullStream to get all events
            for await (const part of result.fullStream) {
                if (part.type === 'text-delta' && part.textDelta) {
                    params.onTextChunk(part.textDelta);
                }
                // Detect chat tool call and extract response immediately
                if (part.type === 'tool-call' && part.toolName === 'chat') {
                    const args = part.args as { response?: string };
                    if (args?.response) {
                        chatResponse = args.response;
                        console.log('[AI] Chat tool called, response length:', chatResponse.length);
                        if (params.onChatResponse) {
                            params.onChatResponse(chatResponse);
                        }
                    }
                }
            }

            const finalText = await result.text;
            const steps = await result.steps;
            const usage = await result.usage;

            console.log('[AI] streamWithTools completed. Steps:', steps?.length, 'ChatResponse:', Boolean(chatResponse));

            return {
                chatResponse,
                text: finalText,
                steps: steps || [],
                usage
            };
        } catch (error) {
            console.error('[AI] streamWithTools error:', error);
            reportErrorKey('errors.aiStreamWithTools', error);
            throw error;
        }
    }
}
