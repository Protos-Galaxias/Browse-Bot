import type { EvalConfig, ModelConfig } from './types.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DEFAULT_MODELS: ModelConfig[] = [
  {
    provider: 'openrouter',
    model: 'openai/gpt-4.1-mini',
  },
  {
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4-20250514',
  },
  {
    provider: 'openrouter',
    model: 'google/gemini-2.0-flash-001',
  },
];

export const DEFAULT_CONFIG: EvalConfig = {
  extensionPath: resolve(__dirname, '../../dist-firefox'),
  fixturesBaseUrl: 'http://localhost:3001',
  defaultTimeout: 60000,
  models: DEFAULT_MODELS,
  scenarios: ['scenarios/*.yaml'],
  outputDir: resolve(__dirname, '../results'),
  headless: false,  // Firefox with extensions requires headed mode
  parallel: 1,  // Sequential by default, can increase for independent scenarios
};

export function loadConfig(overrides: Partial<EvalConfig> = {}): EvalConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    models: overrides.models ?? DEFAULT_CONFIG.models,
  };
}

export function getStorageKeysForModel(config: ModelConfig): Record<string, string> {
  const keys: Record<string, string> = {
    provider: config.provider,
  };

  switch (config.provider) {
    case 'openrouter':
      keys['activeModel_openrouter'] = config.model;
      if (config.apiKey) {
        keys['apiKey'] = config.apiKey;
      }
      break;
    case 'openai':
      keys['activeModel_openai'] = config.model;
      if (config.apiKey) {
        keys['openaiApiKey'] = config.apiKey;
      }
      break;
    case 'xai':
      keys['activeModel_xai'] = config.model;
      if (config.apiKey) {
        keys['xaiApiKey'] = config.apiKey;
      }
      if (config.baseURL) {
        keys['xaiBaseURL'] = config.baseURL;
      }
      break;
    case 'ollama':
      keys['activeModel_ollama'] = config.model;
      if (config.baseURL) {
        keys['ollamaBaseURL'] = config.baseURL;
      }
      break;
    case 'lmstudio':
      keys['activeModel_lmstudio'] = config.model;
      if (config.baseURL) {
        keys['lmstudioBaseURL'] = config.baseURL;
      }
      break;
  }

  return keys;
}

