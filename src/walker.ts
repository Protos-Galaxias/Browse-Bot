import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const openrouter = createOpenRouter({
  apiKey: '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', // Replace with your actual key or use environment variables
});

// Define the schemas for different action types
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
  data: z.string().optional().describe('The final data or message to return to the user.'), // Made optional
  description: z.string().describe('A brief description of why this action is needed.'),
});

const planActionSchema = z.discriminatedUnion('type', [
  parsePageActionSchema,
  searchWebsiteActionSchema,
  summarizeTextActionSchema,
  navigateToUrlActionSchema,
  returnResultActionSchema,
]);

const plannerSystemPrompt = "You are an intelligent web browsing agent. Your goal is to create a step-by-step plan to fulfill the user's request.\nYou have the following action types available:\n- parse_current_page: To extract content from the currently open page. Requires no additional parameters.\n- search_website: To search for a specific item or information on the current website. REQUIRED PARAMETER: 'query' (string).\n- summarize_text: To summarize a given text. Requires no additional parameters. This action will be followed by a return_result action.\n- navigate_to_url: To go to a specific URL. REQUIRED PARAMETER: 'url' (string).\n- return_result: To return the final answer or data to the user. OPTIONAL PARAMETER: 'data' (string). This should always be the last step in your plan.\n\nYour response MUST be a JSON object with a single 'plan' array containing these actions. Each action must have a 'type' and a 'description'. Additional parameters are required based on the action type as specified above.\n\nExample for \"краткую выжимку статьи\":\n[\n  { \"type\": \"parse_current_page\", \"description\": \"Extract the main content of the current article.\" },\n  { \"type\": \"summarize_text\", \"description\": \"Summarize the extracted content to provide an overview of the article\'s topic.\" },\n  { \"type\": \"return_result\", \"data\": \"[SUMMARY_PLACEHOLDER]\", \"description\": \"Return the summary of the article\'s topic to the user.\" }\n]\n\nExample for \"найти безлактозное молоко на сайте\":\n[\n  { \"type\": \"parse_current_page\", \"description\": \"Parse the current page to locate the search bar or find relevant links.\" },\n  { \"type\": \"search_website\", \"query\": \"безлактозное молоко\", \"description\": \"Search for \'безлактозное молоко\' on the website\'s search functionality.\" },\n  { \"type\": \"parse_current_page\", \"description\": \"Parse the search results page to identify relevant product listings or information.\" },\n  { \"type\": \"summarize_text\", \"description\": \"Summarize the findings from the search results.\" },\n  { \"type\": \"return_result\", \"data\": \"[SEARCH_RESULT_SUMMARY_PLACEHOLDER]\", \"description\": \"Return the summarized search results to the user.\" }\n]\n\nIf the user asks for something that requires browsing multiple pages, use `navigate_to_url` to go to likely relevant pages, then `parse_current_page`, and then `summarize_text` or `return_result`.\nAlways end with a `return_result` action.\nPlaceholders like `[SUMMARY_PLACEHOLDER]` will be replaced during execution.";

// 1) Планировщик (Planner Tool)
async function plannerTool(userQuery: string): Promise<z.infer<typeof planActionSchema>[]> {
  const { object: plan } = await generateObject({
    model: openrouter.chat('openai/gpt-4o-mini'), // Using a smaller, faster model for planning
    schema: z.object({
      plan: z.array(planActionSchema).describe('An ordered list of actions to fulfill the user\'s request.'),
    }),
    system: plannerSystemPrompt,
    prompt: `Create a plan to fulfill the following request: "${userQuery}"`,
  });
  console.log('plan666', plan);
  return plan.plan;
}

// Minimal interface for TabChangeInfo to avoid dependency issues
interface TabChangeInfoMinimal {
  status?: string;
}

// 2) Tул, который получает URLs и парсит (URL Fetcher and Orchestrator Tool) - Now repurposed for search/navigation
// This function will be called by webWalker based on the plan.
async function performWebAction(action: z.infer<typeof planActionSchema>, currentTabId: number, userQuery: string): Promise<string | null> {
  switch (action.type) {
    case 'navigate_to_url':
      console.log(`Navigating to URL: ${action.url}`);
      await chrome.tabs.update(currentTabId, { url: action.url });
      // Wait for the page to load
      await new Promise(resolve => {
        const listener = (tabId: number, changeInfo: TabChangeInfoMinimal) => {
          if (tabId === currentTabId && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve(null);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
      return null; // Navigation doesn't return content directly

    case 'parse_current_page':
      console.log('Parsing current page content...');
      const contextResponse = await chrome.tabs.sendMessage(currentTabId, { type: 'PARSE_PAGE', query: userQuery });
      return contextResponse.data; // content_script_parser.ts sends PARSE_RESULT with data

    case 'search_website':
      console.log(`Searching website for: ${action.query}`);
      // This is a simplified search action. In a real scenario, this would involve:
      // 1. Parsing the current page to find the search input field.
      // 2. Using chrome.tabs.sendMessage to inject TYPE action into the content script to type the query.
      // 3. Using chrome.tabs.sendMessage to inject CLICK action on the search button.
      // For now, let's assume the search happens via navigating to a search URL or a more complex interaction handled by the content script.
      // For demonstration, let's just log and return a placeholder.

      // To actually perform a search, we'd need to adapt src/content.ts to identify and interact with search elements.
      // For now, it's just a placeholder demonstrating the action type.
      const searchPageContext = await chrome.tabs.sendMessage(currentTabId, { type: 'GET_CONTEXT' });
      const searchPageDom = searchPageContext.dom;

      // This is where you would use an LLM or logic to identify search bar/button and interact.
      // For simplicity, let's assume content script can handle it with a new message type.
      // This is a *simplification* and needs proper implementation in content.ts or a new helper.
      await chrome.tabs.sendMessage(currentTabId, { type: 'PERFORM_SEARCH', query: action.query });

      await new Promise(resolve => {
        const listener = (tabId: number, changeInfo: TabChangeInfoMinimal) => {
          if (tabId === currentTabId && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve(null);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });

      const searchResultsContext = await chrome.tabs.sendMessage(currentTabId, { type: 'PARSE_PAGE', query: userQuery });
      return searchResultsContext.data;

    case 'summarize_text':
      // This action should be handled by the summarizationTool after getting content.
      // This case should ideally not be reached directly by performWebAction.
      console.warn('summarize_text action called directly by performWebAction. This is likely an error in planning.');
      return null;
    case 'return_result':
      // This action should be handled by webWalker directly to return the final result.
      console.warn('return_result action called directly by performWebAction. This is likely an error in planning.');
      return null;
    default:
      console.warn(`Unknown action type: ${(action as any).type}`);
      return null;
  }
}

// New Summarization Tool
async function summarizationTool(textToSummarize: string): Promise<string> {
  console.log('Summarizing text...');
  const { text: summary } = await generateText({
    model: openrouter.chat('openai/gpt-4.1-mini'), // Using a model for summarization
    prompt: `Please provide a concise summary of the following text:

${textToSummarize}

Summary:`, // Simple prompt for summarization
  });
  return summary;
}

// 4) Агрегация и очистка (Aggregation and Cleaning Tool) - Still used for final result preparation
async function aggregationAndCleaningTool(data: string[] | string): Promise<string> {
  console.log('Aggregating and cleaning data...');
  // If data is an array, join it. If it's already a string, just use it.
  const aggregatedResult = Array.isArray(data) ? data.flat().join('\n\n---\n') : data;

  // Potentially send to Sidebar or other UI component
  chrome.runtime.sendMessage({ type: 'FINAL_RESULT', data: aggregatedResult }).catch(e => console.error("Failed to send final result to UI:", e));

  return aggregatedResult;
}

export async function webWalker(userQuery: string) {
  let currentContent: string | null = null;
  let activeTabId: number | null = null;

  try {
    console.log(`Web Walker: Starting for query: "${userQuery}"`);

    // Get active tab ID first
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !tab.url || tab.url.startsWith("chrome://")) {
      throw new Error('Cannot run on the current page. Please use a standard http/https page.');
    }
    activeTabId = tab.id;

    // Inject content script parser once at the start
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTabId, allFrames: true },
        files: ['content_script_parser.js'],
      });
      await new Promise(resolve => setTimeout(resolve, 500)); // Give it a moment to load
    } catch (e) {
      console.error("Failed to inject content script parser:", e);
      throw new Error(`Failed to initialize: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Step 1: Planning - Get relevant actions
    console.log('Web Walker: Step 1 - Planning actions...');
    const plan = await plannerTool(userQuery);
    console.log('Web Walker: Generated Plan:', plan);

    if (plan.length === 0) {
      console.log('Web Walker: No actions generated by the planner.');
      return 'No plan generated. Could not fulfill the request.';
    }

    for (const action of plan) {
      console.log(`Web Walker: Executing action: ${action.type}`);
      switch (action.type) {
        case 'parse_current_page':
          if (activeTabId === null) throw new Error('Active tab ID is null for parse_current_page.');
          currentContent = await performWebAction(action, activeTabId, userQuery);
          break;
        case 'navigate_to_url':
          if (activeTabId === null) throw new Error('Active tab ID is null for navigate_to_url.');
          await performWebAction(action, activeTabId, userQuery);
          currentContent = null; // Content changes after navigation, reset for next parse
          break;
        case 'search_website':
          if (activeTabId === null) throw new Error('Active tab ID is null for search_website.');
          // This action needs to coordinate with content_script_parser to interact with page
          currentContent = await performWebAction(action, activeTabId, userQuery);
          break;
        case 'summarize_text':
          if (currentContent === null) throw new Error('No content available to summarize.');
          currentContent = await summarizationTool(currentContent);
          break;
        case 'return_result':
          // The final aggregation and return happens here.
          const finalResult = await aggregationAndCleaningTool((action.data === '[SUMMARY_PLACEHOLDER]' || action.data === '[SEARCH_RESULT_SUMMARY_PLACEHOLDER]' || action.data === undefined) ? (currentContent || '') : action.data);
          console.log('Web Walker: Task Completed. Final Result:', finalResult);
          chrome.runtime.sendMessage({ type: 'FINAL_RESULT', data: finalResult }).catch(e => console.error("Failed to send final result to UI:", e));
          return finalResult;
        default:
          console.warn(`Web Walker: Unknown action type in plan: ${(action as any).type}`);
          throw new Error(`Unknown action type: ${(action as any).type}`);
      }
    }
    return 'Web Walker: Plan executed without explicit return_result action.';
  } catch (error) {
    console.error('Web Walker: An error occurred during the process:', error);
    chrome.runtime.sendMessage({ type: 'WALKER_ERROR', error: error instanceof Error ? error.message : String(error) }).catch(e => console.error("Failed to send error to UI:", e));
    return `An error occurred: ${error instanceof Error ? error.message : String(error)}`;
  }
} 