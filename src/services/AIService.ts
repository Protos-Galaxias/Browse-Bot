import { ConfigService } from './ConfigService';
import { generateObject, generateText, stepCountIs } from 'ai';
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

export interface AIService {
  generate<T>(schema: unknown, systemPrompt: string, prompt: string, options?: AIGenerateOptions): Promise<T>;
  getChatModel(): Promise<LanguageModel>;
  generateWithTools(params: GenerateWithToolsParams): Promise<GenerateTextResult<any, any>>;
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
            const result = await generateObject({
                model: this.provider.getModel(this.ensureClient(), modelName) as LanguageModel,
                schema: schema as any,
                system: systemPrompt,
                prompt
            });
            return result.object as T;
        } catch (error) {
            reportErrorKey('errors.aiInvalidJson', error);
            throw new Error('Invalid JSON response from AI');
        }
    }

    async generateWithTools(params: GenerateWithToolsParams): Promise<GenerateTextResult<any, any>> {
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
    }
}
