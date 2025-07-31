import { z } from 'zod';

export const planActionSchema = z.object({
    type: z.enum([
        'parse_current_page',
        'find_and_click',
        'find_and_insert_text', // New type for inserting text
        'summarize_text',
        'navigate_to_url',
        'return_result',
    ]),
    description: z.string().describe('A clear and concise description of the action in Russian.'),
    query: z.string().optional().describe('The search query for the search_website action.'),
    url: z.string().optional().describe('The URL for the navigate_to_url action.'),
    element_description: z.string().optional().describe('Text description of the element to find.'),
    data: z.string().optional().describe('The final data or answer for the return_result action.'),
    text: z.string().optional().describe('The text to insert for the find_and_insert_text action.'),
});
