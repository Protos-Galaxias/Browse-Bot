import { z } from 'zod';
import { planActionSchema } from './types';
import type { AIService as AIServiceType } from '../services/AIService';


const plannerSystemPrompt = "You are an intelligent web browsing agent. Your goal is to create a step-by-step plan to fulfill the user's request.\nYou have the following action types available:\n- parse_current_page: To extract content from the currently open page. Requires no additional parameters.\n- search_website: To search for a specific item or information on the current website. REQUIRED PARAMETER: 'query' (string).\n- summarize_text: To summarize a given text. Requires no additional parameters. This action will be followed by a return_result action.\n- navigate_to_url: To go to a specific URL. REQUIRED PARAMETER: 'url' (string).\n- return_result: To return the final answer or data to the user. OPTIONAL PARAMETER: 'data' (string). This should always be the last step in your plan.\n\nYour response MUST be a JSON object with a single 'plan' array containing these actions. Each action must have a 'type' and a 'description'. Additional parameters are required based on the action type as specified above.\n\nExample for \"краткую выжимку статьи\":\n[\n  { \"type\": \"parse_current_page\", \"description\": \"Extract the main content of the current article.\" },\n  { \"type\": \"summarize_text\", \"description\": \"Summarize the extracted content to provide an overview of the article\'s topic.\" },\n  { \"type\": \"return_result\", \"data\": \"[SUMMARY_PLACEHOLDER]\", \"description\": \"Return the summary of the article\'s topic to the user.\" }\n]\n\nExample for \"найти безлактозное молоко на сайте\":\n[\n  { \"type\": \"parse_current_page\", \"description\": \"Parse the current page to locate the search bar or find relevant links.\" },\n  { \"type\": \"search_website\", \"query\": \"безлактозное молоко\", \"description\": \"Search for \'безлактозное молоко\' on the website\'s search functionality.\" },\n  { \"type\": \"parse_current_page\", \"description\": \"Parse the search results page to identify relevant product listings or information.\" },\n  { \"type\": \"summarize_text\", \"description\": \"Summarize the findings from the search results.\" },\n  { \"type\": \"return_result\", \"data\": \"[SEARCH_RESULT_SUMMARY_PLACEHOLDER]\", \"description\": \"Return the summarized search results to the user.\" }\n]\n\nIf the user asks for something that requires browsing multiple pages, use `navigate_to_url` to go to likely relevant pages, then `parse_current_page`, and then `summarize_text` or `return_result`.\nAlways end with a `return_result` action.\nPlaceholders like `[SUMMARY_PLACEHOLDER]` will be replaced during execution.";

export async function plannerTool(userQuery: string, aiService: AIServiceType): Promise<z.infer<typeof planActionSchema>[]> {
  const plan = await aiService.generate(
    z.object({
      plan: z.array(planActionSchema).describe('An ordered list of actions to fulfill the user\'s request.'),
    }),
    plannerSystemPrompt,
    `Create a plan to fulfill the following request: "${userQuery}"`,
  );
  console.log('plan666rr4', plan);
  // return plan.plan;
}