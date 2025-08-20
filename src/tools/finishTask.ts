import { tool } from 'ai';
import { z } from 'zod';
import type { ToolOutput } from './types';

export const finishTaskTool = () => tool({
    description: 'Call this tool ONLY when all sub-tasks of the user\'s request have been fully completed.',
    inputSchema: z.object({
        final_answer: z.string().describe("A summary of the task's completion.")
    }),
    async execute({ final_answer }): Promise<ToolOutput> {
        return { success: true, answer: final_answer };
    }
});


