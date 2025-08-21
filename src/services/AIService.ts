import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { ConfigService } from './ConfigService';
import { generateObject, generateText, stepCountIs } from 'ai';
import type { GenerateTextResult, LanguageModel, ModelMessage, ToolSet } from 'ai';

export interface AIGenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: any;
}

export interface AIService {
  generateTextByPrompt(prompt: string, options?: AIGenerateOptions): Promise<GenerateTextResult<any, any>>;
  generate<T>(schema: any, systemPrompt: string, prompt: string, options?: AIGenerateOptions): Promise<T>;
  isConfigured(): Promise<boolean>;
  getChatModel(): Promise<LanguageModel>;
  generateWithTools(params: {
    messages: ModelMessage[],
    tools: ToolSet,
    maxToolRoundtrips?: number,
    abortSignal?: AbortSignal
  }): Promise<GenerateTextResult<any, any>>;
}

export class OpenRouterAIService implements AIService {
    private static instance: OpenRouterAIService;
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

    async isConfigured(): Promise<boolean> {
        try {
            const apiKey = await this.configService.get<string>('apiKey');
            return !!apiKey;
        } catch {
            return false;
        }
    }

    private getClient() {
        if (!this.client) {
            throw new Error('AI Service not initialized. Call initialize() first.');
        }
        return this.client;
    }

    async getChatModel(): Promise<LanguageModel> {
        const modelName = await this.configService.get<string>('activeModel') || 'openai/gpt-4.1-mini';
        return this.getClient().chat(modelName);
    }

    async generateTextByPrompt(prompt: string, options: AIGenerateOptions = {}): Promise<GenerateTextResult<any, any>> {
        const model = options.model || await this.configService.get<string>('activeModel') || 'openai/gpt-4.1-mini';
        const globalPrompt = await this.configService.get<string>('globalPrompt', '');

        const finalPrompt = globalPrompt ? `${globalPrompt}\n\n${prompt}` : prompt;

        return generateText({
            model: this.getClient().chat(model),
            prompt: finalPrompt
        });
    }

    async generateTextBySmallModel(prompt: string): Promise<GenerateTextResult<any, any>> {
        return generateText({
            model: this.getClient().chat('openai/gpt-4.1-mini'),
            prompt
        });
    }

    async generate<T>(schema: any, systemPrompt: string, prompt: string, options: AIGenerateOptions = {}): Promise<T> {
        try {
            const model = options.model || await this.configService.get<string>('activeModel') || 'openai/gpt-4.1-mini';
            const client = this.getClient();
            const globalPrompt = await this.configService.get<string>('globalPrompt', '');
            const finalSystem = globalPrompt ? `${globalPrompt}\n\n${systemPrompt}` : systemPrompt;
            const result = await generateObject({
                model: client.chat(model),
                schema,
                system: finalSystem,
                prompt
            });

            return result.object as T;
        } catch (error) {
            console.error('Error in generate:', error);
            throw new Error('Invalid JSON response from AI');
        }
    }

    async generateWithTools(params: {
        messages: ModelMessage[];
        tools: ToolSet;
        maxRetries?: number;
        abortSignal?: AbortSignal;
    }): Promise<GenerateTextResult<any, any>> {
        const model = await this.getChatModel();
        const globalPrompt = await this.configService.get<string>('globalPrompt', '');

        const messagesWithGlobal: ModelMessage[] = globalPrompt
            ? [{ role: 'system', content: globalPrompt }, ...params.messages]
            : params.messages;

        return generateText({
            model,
            messages: messagesWithGlobal,
            tools: params.tools,
            maxRetries: 5,
            stopWhen: stepCountIs(10),
            abortSignal: params.abortSignal
        });
    }
}
