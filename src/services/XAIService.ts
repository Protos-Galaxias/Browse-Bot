import { createXai, xai as defaultXai } from '@ai-sdk/xai';
import { ConfigService } from './ConfigService';
import { generateObject, generateText, stepCountIs } from 'ai';
import type { GenerateTextResult } from 'ai';
import type { AIService, AIGenerateOptions, GenerateWithToolsParams } from './AIService';

export class XAIService implements AIService {
    private static instance: XAIService;
    public static readonly DEFAULT_MODEL: string = 'grok-3';
    private client: ReturnType<typeof createXai> | ((modelId: string) => any) | null = null;
    private configService = ConfigService.getInstance();

    private constructor() {}

    static getInstance(): XAIService {
        if (!XAIService.instance) {
            XAIService.instance = new XAIService();
        }
        return XAIService.instance;
    }

    async initialize(): Promise<void> {
        const apiKey = await this.configService.get<string>('xaiApiKey');
        if (!apiKey) {
            throw new Error('xAI API key not configured');
        }
        const baseURL = await this.configService.get<string>('xaiBaseURL');
        this.client = baseURL && typeof baseURL === 'string' && baseURL.trim().length > 0
            ? createXai({ apiKey, baseURL })
            : createXai({ apiKey });
    }

    private getClient() {
        if (!this.client) {
            throw new Error('AI Service not initialized. Call initialize() first.');
        }
        return this.client;
    }

    async getChatModel(): Promise<any> {
        const modelName = (await this.configService.get<string>('activeModel_xai'))
            || (await this.configService.get<string>('activeModel'))
            || XAIService.DEFAULT_MODEL;
        const client = this.getClient();
        // xai provider instance is callable: xai('model-id') → chat model
        return (client as (modelId: string) => any)(modelName);
    }

    async generate<T>(schema: unknown, systemPrompt: string, prompt: string, options: AIGenerateOptions = {}): Promise<T> {
        try {
            const model = options.model
                || (await this.configService.get<string>('activeModel_xai'))
                || (await this.configService.get<string>('activeModel'))
                || XAIService.DEFAULT_MODEL;
            const client = this.getClient();
            const result = await generateObject({
                model: (client as (m: string) => any)(model) as any,
                schema: schema as any,
                system: systemPrompt,
                prompt
            });

            return result.object as T;
        } catch (error) {
            console.error('Error in generate (xAI):', error);
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
        });
    }
}




