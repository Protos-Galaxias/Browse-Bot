import { z } from 'zod';

const parsePageActionSchema = z.object({
    type: z.literal('parse_current_page'),
    description: z.string().describe('A brief description of why this action is needed.'),
  });
  
  const searchWebsiteActionSchema = z.object({
    type: z.literal('search_website'),
    query: z.string().describe('The search term to use for finding a product or information on the current website.'),
    description: z.string().describe('A brief description of why this action is needed.'),
  });
  
  const summarizeTextActionSchema = z.object({
    type: z.literal('summarize_text'),
    description: z.string().describe('A brief description of why this action is needed. This action will be followed by a return_result action.'),
  });
  
  const navigateToUrlActionSchema = z.object({
    type: z.literal('navigate_to_url'),
    url: z.string().url().describe('The URL to navigate to.'),
    description: z.string().describe('A brief description of why this action is needed.'),
  });
  
  const returnResultActionSchema = z.object({
    type: z.literal('return_result'),
    data: z.string().optional().describe('The final data or message to return to the user.'),
    description: z.string().describe('A brief description of why this action is needed.'),
  });

export interface TabChangeInfoMinimal {
    status?: string;
  }

export const planActionSchema = z.discriminatedUnion('type', [
    parsePageActionSchema,
    searchWebsiteActionSchema,
    summarizeTextActionSchema,
    navigateToUrlActionSchema,
    returnResultActionSchema,
  ]);