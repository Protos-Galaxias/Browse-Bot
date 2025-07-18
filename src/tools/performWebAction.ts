import { z } from 'zod';
import { planActionSchema, type TabChangeInfoMinimal } from './types';

// 2) Tул, который получает URLs и парсит (URL Fetcher and Orchestrator Tool) - Now repurposed for search/navigation
// This function will be called by webWalker based on the plan.
export async function performWebAction(action: z.infer<typeof planActionSchema>, currentTabId: number, userQuery: string): Promise<string | null> {
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