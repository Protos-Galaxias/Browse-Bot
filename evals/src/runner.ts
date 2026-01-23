import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, join, basename } from 'path';
import { parse as parseYaml } from 'yaml';
import chalk from 'chalk';
import type { EvalConfig, EvalResult, ModelConfig, Scenario, ToolCall } from './types.js';
import { createFirefoxDriver, configureExtension, sendTaskToExtension, waitForTaskCompletion, cleanupDriver } from './firefox-driver.js';
import { runAllAssertions } from './assertions.js';

export async function loadScenarios(patterns: string[], basePath: string): Promise<Scenario[]> {
    const scenarios: Scenario[] = [];
    const scenariosDir = resolve(basePath, 'scenarios');

    try {
        const files = readdirSync(scenariosDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

        for (const file of files) {
            const filePath = join(scenariosDir, file);
            const content = readFileSync(filePath, 'utf-8');
            const scenario = parseYaml(content) as Scenario;

            // Use filename as default name if not specified
            if (!scenario.name) {
                scenario.name = basename(file, '.yaml').replace(/-/g, ' ');
            }

            scenarios.push(scenario);
        }
    } catch (e) {
        console.warn('Failed to load scenarios:', e);
    }

    return scenarios;
}

export async function runScenario(
    scenario: Scenario,
    model: ModelConfig,
    config: EvalConfig,
    apiKeys: Record<string, string>
): Promise<EvalResult> {
    const startTime = Date.now();
    const toolsCalled: ToolCall[] = [];

    console.log(chalk.blue(`\n▶ Running: ${scenario.name}`));
    console.log(chalk.gray(`  Model: ${model.provider}/${model.model}`));
    console.log(chalk.gray(`  URL: ${scenario.url}`));

    let driver;

    try {
    // Create browser with extension
        driver = await createFirefoxDriver({
            extensionPath: config.extensionPath,
            model,
            timeout: scenario.timeout ?? config.defaultTimeout
        });

        // Navigate to target URL and configure extension
        const targetUrl = scenario.url.startsWith('http')
            ? scenario.url
            : `${config.fixturesBaseUrl}${scenario.url}`;

        // Configure extension (this also navigates to the page)
        await configureExtension(driver, model, apiKeys, targetUrl);
        console.log(chalk.gray(`  Navigated to: ${targetUrl}`));

        // Wait for content script injection
        await driver.sleep(2000);

        // Send task to extension
        console.log(chalk.gray(`  Task: ${scenario.task}`));
        await sendTaskToExtension(driver, scenario.task);

        // Wait for completion
        const completionResult = await waitForTaskCompletion(
            driver,
            scenario.timeout ?? config.defaultTimeout
        );

        // Collect tool calls
        for (const call of completionResult.toolsCalled) {
            toolsCalled.push({
                name: call.name,
                args: call.args as Record<string, unknown>,
                timestamp: call.timestamp
            });
        }

        // Run assertions
        const assertionResults = await runAllAssertions(driver, scenario.assertions, toolsCalled);

        const allPassed = assertionResults.every(r => r.passed);
        const duration = Date.now() - startTime;

        if (allPassed) {
            console.log(chalk.green(`  ✓ PASSED (${duration}ms)`));
        } else {
            console.log(chalk.red(`  ✗ FAILED (${duration}ms)`));
            for (const result of assertionResults.filter(r => !r.passed)) {
                console.log(chalk.red(`    - ${result.assertion.type}: ${result.error || result.actual}`));
            }
        }

        if (toolsCalled.length > 0) {
            console.log(chalk.gray(`  Tools: ${toolsCalled.map(t => t.name).join(' → ')}`));
        }

        // Convert metrics to LLMMetrics format
        const llmMetrics = completionResult.metrics ? {
            totalLLMTime: 0, // Not available yet - would need timing from service worker
            promptTokens: completionResult.metrics.promptTokens,
            completionTokens: completionResult.metrics.completionTokens,
            totalTokens: completionResult.metrics.totalTokens,
            llmCalls: completionResult.metrics.llmCalls,
            avgResponseTime: 0
        } : undefined;

        if (llmMetrics && llmMetrics.totalTokens > 0) {
            console.log(chalk.gray(`  Tokens: ${llmMetrics.totalTokens} (${llmMetrics.promptTokens} in / ${llmMetrics.completionTokens} out)`));
        }

        return {
            scenario: scenario.name,
            model,
            success: allPassed,
            duration,
            assertions: assertionResults,
            toolsCalled,
            llmMetrics,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        console.log(chalk.red(`  ✗ ERROR: ${errorMessage}`));

        return {
            scenario: scenario.name,
            model,
            success: false,
            duration,
            assertions: [],
            toolsCalled,
            error: errorMessage,
            timestamp: new Date().toISOString()
        };

    } finally {
        if (driver) {
            await cleanupDriver(driver);
        }
    }
}

export async function runAllScenarios(
    config: EvalConfig,
    apiKeys: Record<string, string>
): Promise<EvalResult[]> {
    const scenarios = await loadScenarios(config.scenarios, resolve(process.cwd()));
    const results: EvalResult[] = [];

    console.log(chalk.bold('\n🧪 Browse-Bot Eval Suite'));
    console.log(chalk.gray(`Found ${scenarios.length} scenarios`));
    console.log(chalk.gray(`Testing ${config.models.length} models\n`));

    for (const scenario of scenarios) {
    // Use scenario-specific models or default
        const modelsToTest = scenario.models
            ? config.models.filter(m => scenario.models!.includes(`${m.provider}/${m.model}`))
            : config.models;

        for (const model of modelsToTest) {
            const result = await runScenario(scenario, model, config, apiKeys);
            results.push(result);
        }
    }

    return results;
}

export function saveResults(results: EvalResult[], outputDir: string): string {
    mkdirSync(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `eval-${timestamp}-${Date.now()}.json`;
    const filepath = join(outputDir, filename);

    writeFileSync(filepath, JSON.stringify(results, null, 2));

    return filepath;
}
