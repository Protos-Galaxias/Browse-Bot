import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { ConfigService } from './ConfigService';
import { generateObject, generateText, stepCountIs } from 'ai';
import type { GenerateTextResult, LanguageModel, ModelMessage, ToolSet } from 'ai';

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

export class OpenRouterAIService implements AIService {
    private static instance: OpenRouterAIService;
    public static readonly DEFAULT_MODEL: string = 'openai/gpt-4.1-mini';
    private client: ReturnType<typeof createOpenRouter> | null = null;
    private configService = ConfigService.getInstance();

    private constructor() {}

    static getInstance(): OpenRouterAIService {
        if (!OpenRouterAIService.instance) {
            OpenRouterAIService.instance = new OpenRouterAIService();
        }
        return OpenRouterAIService.instance;
    }

    async initialize(): Promise<void> {
        const apiKey = await this.configService.get<string>('apiKey');
        if (!apiKey) {
            throw new Error('API key not configured');
        }
        this.client = createOpenRouter({ apiKey });
    }

    private getClient() {
        if (!this.client) {
            throw new Error('AI Service not initialized. Call initialize() first.');
        }
        return this.client;
    }

    async getChatModel(): Promise<LanguageModel> {
        const modelName = await this.configService.get<string>('activeModel') || OpenRouterAIService.DEFAULT_MODEL;
        return this.getClient().chat(modelName);
    }

    async generate<T>(schema: unknown, systemPrompt: string, prompt: string, options: AIGenerateOptions = {}): Promise<T> {
        try {
            const model = options.model || await this.configService.get<string>('activeModel') || OpenRouterAIService.DEFAULT_MODEL;
            const client = this.getClient();
            const result = await generateObject({
                model: client.chat(model),
                schema: schema as any,
                system: systemPrompt,
                prompt
            });

            return result.object as T;
        } catch (error) {
            console.error('Error in generate:', error);
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
