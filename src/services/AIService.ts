import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { ConfigService } from './ConfigService';
import { generateObject, generateText } from 'ai';
import type { GenerateTextResult, LanguageModel, CoreMessage, ToolSet } from 'ai';

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
    messages: CoreMessage[],
    tools: ToolSet,
    maxToolRoundtrips?: number
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
        const modelName = await this.configService.get<string>('model') || 'google/gemini-2.5-pro';
        return this.getClient().chat(modelName);
    }

    async generateTextByPrompt(prompt: string, options: AIGenerateOptions = {}): Promise<GenerateTextResult<any, any>> {
        const model = options.model || await this.configService.get<string>('model') || 'google/gemini-2.5-pro';

        return generateText({
            model: this.getClient().chat(model),
            prompt
        });
    }

    async generate<T>(schema: any, systemPrompt: string, prompt: string, options: AIGenerateOptions = {}): Promise<T> {
        try {
            const model = options.model || await this.configService.get<string>('model') || 'google/gemini-2.5-pro';
            const client = this.getClient();
            const result = await generateObject({
                model: client.chat(model),
                schema,
                system: systemPrompt,
                prompt
            });

            return result.object as T;
        } catch (error) {
            console.error('Error in generate:', error);
            throw new Error('Invalid JSON response from AI');
        }
    }

    async generateWithTools(params: {
        messages: CoreMessage[];
        tools: ToolSet;
        maxToolRoundtrips?: number;
    }): Promise<GenerateTextResult<any, any>> {
        const model = await this.getChatModel();
        return generateText({
            model,
            ...params
        });
    }
}
