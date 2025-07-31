import { z } from 'zod';

export const planActionSchema = z.object({
    type: z.enum([
        'parse_current_page',
        'find_and_click',
        'summarize_text', // Keeping for potential future use
        'navigate_to_url', // Keeping for potential future use
        'return_result',
    ]),
    description: z.string().describe('A clear and concise description of the action in Russian.'),
    query: z.string().optional().describe('The search query for the search_website action.'),
    url: z.string().optional().describe('The URL for the navigate_to_url action.'),
    element_description: z.string().optional().describe('Text description of the element to find for find_and_click action.'),
    data: z.string().optional().describe('The final data or answer for the return_result action.'),
});
