import type { AIService as AIServiceType } from '../services/AIService';

export async function summarizationTool(textToSummarize: string, aiService: AIServiceType): Promise<string> {
    console.log('Summarizing text...');
    const { text: summary } = await aiService.generateTextByPrompt(
        `Please provide a concise summary of the following text:
      ${textToSummarize}
      Summary:`);

    return summary;
}
