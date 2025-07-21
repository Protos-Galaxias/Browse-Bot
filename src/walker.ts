import { plannerTool, summarizationTool, performWebAction, aggregationAndCleaningTool } from './tools';
import { ConfigService } from './services/ConfigService';
import { StateService } from './services/StateService';
import { MessageQueue } from './services/MessageQueue';
import { OpenRouterAIService } from './services/AIService';

const configService = ConfigService.getInstance();
const stateService = StateService.getInstance();
const messageQueue = MessageQueue.getInstance();
const aiService = OpenRouterAIService.getInstance();

function initializeMessageHandlers() {
    messageQueue.subscribe('WALKER_START', handleWalkerStart);
    messageQueue.subscribe('WALKER_STOP', handleWalkerStop);
    messageQueue.subscribe('CONFIG_UPDATED', handleConfigUpdate);
}

async function initializeServices() {
    try {
        await configService.initialize();
        await stateService.initialize();
        await aiService.initialize();
        initializeMessageHandlers();
        return true;
    } catch (error) {
        console.error('Failed to initialize services:', error);
        await messageQueue.enqueue('WALKER_ERROR', {
            error: 'Failed to initialize services',
            details: error instanceof Error ? error.message : String(error)
        });
        return false;
    }
}

async function handleWalkerStart({ query }: { query: string }) {
    try {
        if (!(await initializeServices())) {
            return;
        }

        stateService.reset();
        await webWalker(query);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error in handleWalkerStart:', error);
        await messageQueue.enqueue('WALKER_ERROR', { error: errorMessage });
    }
}

async function handleWalkerStop() {
    console.log('Web Walker: Stopping...');
    await messageQueue.enqueue('WALKER_STOPPED', { timestamp: Date.now() });
}

async function handleConfigUpdate(config: Record<string, any>) {
    try {
        for (const [key, value] of Object.entries(config)) {
            await configService.set(key, value);
        }
        await messageQueue.enqueue('CONFIG_UPDATED_SUCCESS', { updatedKeys: Object.keys(config) });
    } catch (error) {
        console.error('Failed to update config:', error);
        await messageQueue.enqueue('CONFIG_UPDATE_ERROR', {
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

export async function webWalker(userQuery: string) {
    try {
        console.log(`Web Walker: Starting for query: "${userQuery}"`);

        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab?.id || !tab.url || tab.url.startsWith('chrome://')) {
            throw new Error('Cannot run on the current page. Please use a standard http/https page.');
        }

        stateService.setActiveTab(tab.id);
        stateService.addToHistory({ type: 'WALKER_START', data: { query: userQuery } });

        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                files: ['content_script_parser.js']
            });
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
            console.error('Failed to inject content script parser:', e);
            throw new Error(`Failed to initialize: ${e instanceof Error ? e.message : String(e)}`);
        }

        console.log('Web Walker: Step 1 - Planning actions...');
        const plan = await plannerTool(userQuery, aiService);
        console.log('Web Walker: Generated Plan:', plan);

        stateService.setCurrentPlan(plan);
        stateService.addToHistory({ type: 'PLAN_GENERATED', data: { plan } });

        if (plan.length === 0) {
            const message = 'No plan generated. Could not fulfill the request.';
            console.log('Web Walker:', message);
            await messageQueue.enqueue('WALKER_COMPLETED', { result: message });
            return message;
        }

        let currentContent: string | null = null;

        for (const action of plan) {
            try {
                console.log(`Web Walker: Executing action: ${action.type}`);
                stateService.addToHistory({ type: 'ACTION_START', data: { action } });

                switch (action.type) {
                case 'parse_current_page':
                    if (!tab.id) throw new Error('Active tab ID is null for parse_current_page.');
                    currentContent = await performWebAction(action, tab.id, userQuery);
                    stateService.setCurrentContent(currentContent);
                    break;

                case 'navigate_to_url':
                    if (!tab.id) throw new Error('Active tab ID is null for navigate_to_url.');
                    await performWebAction(action, tab.id, userQuery);
                    currentContent = null;
                    stateService.setCurrentContent(null);
                    break;

                case 'search_website':
                    if (!tab.id) throw new Error('Active tab ID is null for search_website.');
                    currentContent = await performWebAction(action, tab.id, userQuery);
                    stateService.setCurrentContent(currentContent);
                    break;

                case 'summarize_text':
                    if (currentContent === null) throw new Error('No content available to summarize.');
                    currentContent = await summarizationTool(currentContent, aiService);
                    stateService.setCurrentContent(currentContent);
                    break;

                case 'return_result':
                    const finalResult = await aggregationAndCleaningTool(
                        (action.data === '[SUMMARY_PLACEHOLDER]' ||
                            action.data === '[SEARCH_RESULT_SUMMARY_PLACEHOLDER]' ||
                            action.data === undefined) ?
                            (currentContent || '') :
                            action.data
                    );

                    console.log('Web Walker: Task Completed. Final Result:', finalResult);
                    await messageQueue.enqueue('FINAL_RESULT', { result: finalResult });
                    stateService.addToHistory({ type: 'WALKER_COMPLETED', data: { result: finalResult } });
                    return finalResult;

                default:
                    console.warn(`Web Walker: Unknown action type in plan: ${(action as any).type}`);
                    throw new Error(`Unknown action type: ${(action as any).type}`);
                }

                stateService.addToHistory({ type: 'ACTION_COMPLETE', data: { action } });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Error executing action ${action?.type}:`, error);
                stateService.addToHistory({
                    type: 'ACTION_ERROR',
                    data: {
                        action,
                        error: errorMessage,
                        stack: error instanceof Error ? error.stack : undefined
                    }
                });

                await messageQueue.enqueue('WALKER_ERROR', {
                    action: action?.type,
                    error: errorMessage
                });

                throw error;
            }
        }

        const message = 'Web Walker: Plan executed without explicit return_result action.';
        await messageQueue.enqueue('WALKER_COMPLETED', { result: message });
        return message;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Web Walker: An error occurred during the process:', error);

        stateService.addToHistory({
            type: 'WALKER_ERROR',
            data: {
                error: errorMessage,
                stack: error instanceof Error ? error.stack : undefined
            }
        });

        await messageQueue.enqueue('WALKER_ERROR', {
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined
        });

        return `An error occurred: ${errorMessage}`;
    }
}

initializeServices().catch(error => {
    console.error('Failed to initialize services:', error);
});
