import { createOllama, ollama as defaultOllama } from 'ollama-ai-provider-v2';
import { ConfigService } from './ConfigService';
import { generateObject, generateText, stepCountIs } from 'ai';
import type { GenerateTextResult } from 'ai';
import type { AIService, AIGenerateOptions, GenerateWithToolsParams } from './AIService';

export class OllamaService implements AIService {
    private static instance: OllamaService;
    public static readonly DEFAULT_MODEL: string = 'phi3';
    private client: ReturnType<typeof createOllama> | ((modelId: string) => any) | null = null;
    private configService = ConfigService.getInstance();

    private constructor() {}

    static getInstance(): OllamaService {
        if (!OllamaService.instance) {
            OllamaService.instance = new OllamaService();
        }
        return OllamaService.instance;
    }

    async initialize(): Promise<void> {
        const baseURL = await this.configService.get<string>('ollamaBaseURL');
        // If baseURL is provided, create a custom instance; otherwise use default
        this.client = baseURL && typeof baseURL === 'string' && baseURL.trim().length > 0
            ? createOllama({ baseURL })
            : defaultOllama;
    }

    private getClient() {
        if (!this.client) {
            throw new Error('AI Service not initialized. Call initialize() first.');
        }
        return this.client;
    }

    async getChatModel(): Promise<any> {
        const modelName = (await this.configService.get<string>('activeModel_ollama'))
            || (await this.configService.get<string>('activeModel'))
            || OllamaService.DEFAULT_MODEL;
        const client = this.getClient();
        // ollama provider instance is callable: ollama('model-id') → chat model
        return (client as (modelId: string) => any)(modelName);
    }

    async generate<T>(schema: unknown, systemPrompt: string, prompt: string, options: AIGenerateOptions = {}): Promise<T> {
        try {
            const model = options.model
                || (await this.configService.get<string>('activeModel_ollama'))
                || (await this.configService.get<string>('activeModel'))
                || OllamaService.DEFAULT_MODEL;
            const client = this.getClient();
            const result = await generateObject({
                model: (client as (m: string) => any)(model) as any,
                schema: schema as any,
                system: systemPrompt,
                prompt
            });

            return result.object as T;
        } catch (error) {
            console.error('Error in generate (Ollama):', error);
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




