export interface ModelConfig {
  provider: 'openrouter' | 'openai' | 'xai' | 'ollama' | 'lmstudio';
  model: string;
  apiKey?: string;
  baseURL?: string;
}

export interface Assertion {
  type: 'selector' | 'selector_exists' | 'selector_not_exists' | 'url_contains' | 'url_equals' | 'text_contains' | 'tool_called' | 'localStorage' | 'cookie';
  selector?: string;
  expected?: string;
  tool?: string;
  key?: string;
  contains?: string;
}

export interface Scenario {
  name: string;
  description?: string;
  url: string;
  task: string;
  timeout?: number;
  assertions: Assertion[];
  models?: string[];  // override default models for this scenario
}

export interface EvalResult {
  scenario: string;
  model: ModelConfig;
  success: boolean;
  duration: number;
  assertions: AssertionResult[];
  toolsCalled: ToolCall[];
  error?: string;
  timestamp: string;
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  actual?: string;
  error?: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  timestamp: number;
}

export interface EvalConfig {
  extensionPath: string;
  fixturesBaseUrl: string;
  defaultTimeout: number;
  models: ModelConfig[];
  scenarios: string[];  // glob patterns or file paths
  outputDir: string;
  headless: boolean;  // Firefox doesn't support headless with extensions, but keep for future
  parallel: number;
}

export interface EvalSummary {
  totalScenarios: number;
  totalRuns: number;
  results: ModelSummary[];
  timestamp: string;
}

export interface ModelSummary {
  model: string;
  provider: string;
  passed: number;
  failed: number;
  successRate: number;
  avgDuration: number;
  totalTokens?: number;
  estimatedCost?: number;
}

