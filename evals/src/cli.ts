#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, DEFAULT_MODELS } from './config.js';
import { runAllScenarios, runScenario, loadScenarios, saveResults } from './runner.js';
import { generateSummary, printSummary, printDetailedResults, loadResultsFromDir, compareRuns } from './reporter.js';
import { resolve } from 'path';
import type { ModelConfig } from './types.js';

const program = new Command();

program
  .name('browse-bot-eval')
  .description('Evaluation suite for Browse-Bot system prompts')
  .version('1.0.0');

program
  .command('run')
  .description('Run evaluation scenarios')
  .option('-s, --scenario <name>', 'Run specific scenario by name')
  .option('-m, --model <model>', 'Test specific model (provider/model format)')
  .option('-a, --all', 'Run all scenarios with all models')
  .option('-t, --timeout <ms>', 'Override default timeout', '60000')
  .option('-o, --output <dir>', 'Output directory for results', 'results')
  .option('--extension <path>', 'Path to built extension', '../dist-firefox')
  .option('--fixtures-url <url>', 'Base URL for fixture pages', 'http://localhost:3001')
  .action(async (options) => {
    try {
      // Load API keys from environment
      const apiKeys: Record<string, string> = {};

      if (process.env.OPENROUTER_API_KEY) {
        apiKeys.apiKey = process.env.OPENROUTER_API_KEY;
      }
      if (process.env.OPENAI_API_KEY) {
        apiKeys.openaiApiKey = process.env.OPENAI_API_KEY;
      }
      if (process.env.XAI_API_KEY) {
        apiKeys.xaiApiKey = process.env.XAI_API_KEY;
      }

      // Determine models to test
      let models: ModelConfig[] = DEFAULT_MODELS;

      if (options.model) {
        const [provider, ...modelParts] = options.model.split('/');
        const modelName = modelParts.join('/');

        models = [{
          provider: provider as ModelConfig['provider'],
          model: modelName,
        }];
      }

      const config = loadConfig({
        extensionPath: resolve(process.cwd(), options.extension),
        fixturesBaseUrl: options.fixturesUrl,
        defaultTimeout: parseInt(options.timeout, 10),
        models,
        outputDir: resolve(process.cwd(), options.output),
      });

      let results;

      if (options.scenario) {
        // Run specific scenario
        const scenarios = await loadScenarios(['scenarios/*.yaml'], process.cwd());
        const scenario = scenarios.find(s =>
          s.name.toLowerCase().includes(options.scenario.toLowerCase())
        );

        if (!scenario) {
          console.log(chalk.red(`Scenario not found: ${options.scenario}`));
          console.log(chalk.gray(`Available: ${scenarios.map(s => s.name).join(', ')}`));
          process.exit(1);
        }

        results = [];
        for (const model of models) {
          const result = await runScenario(scenario, model, config, apiKeys);
          results.push(result);
        }
      } else {
        // Run all scenarios
        results = await runAllScenarios(config, apiKeys);
      }

      // Save results
      const filepath = saveResults(results, config.outputDir);
      console.log(chalk.gray(`\nResults saved to: ${filepath}`));

      // Print summary
      const summary = generateSummary(results);
      printSummary(summary);

      // Exit with error code if any failures
      const hasFailures = results.some(r => !r.success);
      process.exit(hasFailures ? 1 : 0);

    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

program
  .command('report')
  .description('Show results from previous runs')
  .option('-d, --detailed', 'Show detailed results')
  .option('-c, --compare', 'Compare recent runs')
  .option('-n, --limit <n>', 'Number of runs to compare', '5')
  .option('-o, --output <dir>', 'Results directory', 'results')
  .action((options) => {
    const outputDir = resolve(process.cwd(), options.output);

    if (options.compare) {
      compareRuns(outputDir, parseInt(options.limit, 10));
      return;
    }

    const results = loadResultsFromDir(outputDir);

    if (results.length === 0) {
      console.log(chalk.yellow('No results found. Run evaluations first.'));
      return;
    }

    const summary = generateSummary(results);
    printSummary(summary);

    if (options.detailed) {
      printDetailedResults(results);
    }
  });

program
  .command('list')
  .description('List available scenarios')
  .action(async () => {
    const scenarios = await loadScenarios(['scenarios/*.yaml'], process.cwd());

    console.log(chalk.bold('\n📝 Available Scenarios\n'));

    for (const scenario of scenarios) {
      console.log(chalk.blue(`• ${scenario.name}`));
      if (scenario.description) {
        console.log(chalk.gray(`  ${scenario.description}`));
      }
      console.log(chalk.gray(`  URL: ${scenario.url}`));
      console.log(chalk.gray(`  Assertions: ${scenario.assertions.length}`));
      console.log();
    }
  });

program.parse();




