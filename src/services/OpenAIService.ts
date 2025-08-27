import { createOpenAI } from '@ai-sdk/openai';
import { ConfigService } from './ConfigService';
import { generateObject, generateText, stepCountIs } from 'ai';
import type { GenerateTextResult } from 'ai';
import type { AIService, AIGenerateOptions, GenerateWithToolsParams } from './AIService';

export class OpenAIService implements AIService {
    private static instance: OpenAIService;
    public static readonly DEFAULT_MODEL: string = 'gpt-4.1-mini';
    private client: ReturnType<typeof createOpenAI> | null = null;
    private configService = ConfigService.getInstance();

    private constructor() {}

    static getInstance(): OpenAIService {
        if (!OpenAIService.instance) {
            OpenAIService.instance = new OpenAIService();
        }
        return OpenAIService.instance;
    }

    async initialize(): Promise<void> {
        const apiKey = await this.configService.get<string>('openaiApiKey');
        if (!apiKey) {
            throw new Error('OpenAI API key not configured');
        }
        this.client = createOpenAI({ apiKey });
    }

    private getClient() {
        if (!this.client) {
            throw new Error('AI Service not initialized. Call initialize() first.');
        }
        return this.client;
    }

    async getChatModel(): Promise<any> {
        const modelName = (await this.configService.get<string>('activeModel_openai'))
            || (await this.configService.get<string>('activeModel'))
            || OpenAIService.DEFAULT_MODEL;
        return this.getClient().chat(modelName);
    }

    async generate<T>(schema: unknown, systemPrompt: string, prompt: string, options: AIGenerateOptions = {}): Promise<T> {
        try {
            const model = options.model
                || (await this.configService.get<string>('activeModel_openai'))
                || (await this.configService.get<string>('activeModel'))
                || OpenAIService.DEFAULT_MODEL;
            const client = this.getClient();
            const result = await generateObject({
                model: client.chat(model) as any,
                schema: schema as any,
                system: systemPrompt,
                prompt
            });

            return result.object as T;
        } catch (error) {
            console.error('Error in generate (OpenAI):', error);
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


