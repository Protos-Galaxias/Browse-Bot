import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import Table from 'cli-table3';
import type { EvalResult, EvalSummary, ModelSummary } from './types.js';

export function generateSummary(results: EvalResult[]): EvalSummary {
  const modelResults = new Map<string, EvalResult[]>();
  
  for (const result of results) {
    const key = `${result.model.provider}/${result.model.model}`;
    const existing = modelResults.get(key) || [];
    existing.push(result);
    modelResults.set(key, existing);
  }
  
  const summaries: ModelSummary[] = [];
  
  for (const [key, modelRuns] of modelResults) {
    const [provider, ...modelParts] = key.split('/');
    const model = modelParts.join('/');
    
    const passed = modelRuns.filter(r => r.success).length;
    const failed = modelRuns.length - passed;
    const avgDuration = modelRuns.reduce((sum, r) => sum + r.duration, 0) / modelRuns.length;
    
    summaries.push({
      model,
      provider,
      passed,
      failed,
      successRate: (passed / modelRuns.length) * 100,
      avgDuration,
    });
  }
  
  // Sort by success rate descending
  summaries.sort((a, b) => b.successRate - a.successRate);
  
  return {
    totalScenarios: new Set(results.map(r => r.scenario)).size,
    totalRuns: results.length,
    results: summaries,
    timestamp: new Date().toISOString(),
  };
}

export function printSummary(summary: EvalSummary): void {
  console.log(chalk.bold('\n📊 Eval Summary\n'));
  console.log(chalk.gray(`Total scenarios: ${summary.totalScenarios}`));
  console.log(chalk.gray(`Total runs: ${summary.totalRuns}`));
  console.log(chalk.gray(`Timestamp: ${summary.timestamp}\n`));
  
  const table = new Table({
    head: [
      chalk.white('Model'),
      chalk.white('Provider'),
      chalk.green('Passed'),
      chalk.red('Failed'),
      chalk.yellow('Success %'),
      chalk.blue('Avg Time'),
    ],
    style: {
      head: [],
      border: [],
    },
  });
  
  for (const result of summary.results) {
    const successColor = result.successRate >= 80 
      ? chalk.green 
      : result.successRate >= 50 
        ? chalk.yellow 
        : chalk.red;
    
    table.push([
      result.model,
      result.provider,
      chalk.green(result.passed.toString()),
      chalk.red(result.failed.toString()),
      successColor(`${result.successRate.toFixed(1)}%`),
      chalk.blue(`${(result.avgDuration / 1000).toFixed(1)}s`),
    ]);
  }
  
  console.log(table.toString());
  
  // Winner announcement
  if (summary.results.length > 0) {
    const winner = summary.results[0];
    console.log(chalk.bold.green(`\n🏆 Best performer: ${winner.provider}/${winner.model}`));
    console.log(chalk.gray(`   ${winner.successRate.toFixed(1)}% success rate, ${(winner.avgDuration / 1000).toFixed(1)}s avg\n`));
  }
}

export function printDetailedResults(results: EvalResult[]): void {
  console.log(chalk.bold('\n📋 Detailed Results\n'));
  
  const byScenario = new Map<string, EvalResult[]>();
  
  for (const result of results) {
    const existing = byScenario.get(result.scenario) || [];
    existing.push(result);
    byScenario.set(result.scenario, existing);
  }
  
  for (const [scenario, scenarioResults] of byScenario) {
    console.log(chalk.bold(`\n${scenario}`));
    console.log(chalk.gray('─'.repeat(60)));
    
    for (const result of scenarioResults) {
      const status = result.success ? chalk.green('✓') : chalk.red('✗');
      const model = `${result.model.provider}/${result.model.model}`;
      const duration = `${(result.duration / 1000).toFixed(1)}s`;
      
      console.log(`  ${status} ${model} (${duration})`);
      
      if (!result.success) {
        if (result.error) {
          console.log(chalk.red(`    Error: ${result.error}`));
        }
        
        for (const assertion of result.assertions.filter(a => !a.passed)) {
          console.log(chalk.red(`    - ${assertion.assertion.type}: ${assertion.error || assertion.actual}`));
        }
      }
      
      if (result.toolsCalled.length > 0) {
        console.log(chalk.gray(`    Tools: ${result.toolsCalled.map(t => t.name).join(' → ')}`));
      }
    }
  }
}

export function loadResultsFromDir(outputDir: string): EvalResult[] {
  const files = readdirSync(outputDir)
    .filter(f => f.endsWith('.json') && f.startsWith('eval-'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    return [];
  }
  
  // Load the most recent file
  const latestFile = join(outputDir, files[0]);
  const content = readFileSync(latestFile, 'utf-8');
  
  return JSON.parse(content) as EvalResult[];
}

export function compareRuns(dir: string, limit = 5): void {
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.json') && f.startsWith('eval-'))
    .sort()
    .reverse()
    .slice(0, limit);
  
  if (files.length < 2) {
    console.log(chalk.yellow('Need at least 2 runs to compare'));
    return;
  }
  
  console.log(chalk.bold('\n📈 Run Comparison\n'));
  
  const runs: Array<{ file: string; summary: EvalSummary }> = [];
  
  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf-8');
    const results = JSON.parse(content) as EvalResult[];
    const summary = generateSummary(results);
    runs.push({ file, summary });
  }
  
  const table = new Table({
    head: [chalk.white('Run'), ...runs[0].summary.results.map(r => chalk.white(r.model))],
    style: { head: [], border: [] },
  });
  
  for (const run of runs) {
    const date = run.file.match(/eval-(\d{4}-\d{2}-\d{2})/)?.[1] || run.file;
    const row = [date];
    
    for (const modelSummary of run.summary.results) {
      const pct = `${modelSummary.successRate.toFixed(0)}%`;
      row.push(modelSummary.successRate >= 80 ? chalk.green(pct) : chalk.red(pct));
    }
    
    table.push(row);
  }
  
  console.log(table.toString());
}


