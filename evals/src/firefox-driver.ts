import { Builder, Browser, WebDriver } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { existsSync, statSync, readFileSync } from 'fs';
import { resolve } from 'path';
import type { ModelConfig } from './types.js';
import { getStorageKeysForModel } from './config.js';
import { packExtension, getXpiPath } from './pack-extension.js';

export interface DriverOptions {
  extensionPath: string;
  model: ModelConfig;
  timeout: number;
}

let cachedXpiPath: string | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function createFirefoxDriver(options: DriverOptions): Promise<WebDriver> {
  let { extensionPath } = options;

  if (!existsSync(extensionPath)) {
    throw new Error(`Extension not found at: ${extensionPath}. Run 'npm run build:firefox' first.`);
  }

  // Pack extension to .xpi if it's a directory
  const stat = statSync(extensionPath);
  if (stat.isDirectory()) {
    if (!cachedXpiPath) {
      const xpiPath = getXpiPath(extensionPath);
      console.log(`Packing extension: ${extensionPath} -> ${xpiPath}`);
      cachedXpiPath = packExtension(extensionPath, xpiPath);
      console.log(`Extension packed: ${cachedXpiPath}`);
    }
    extensionPath = cachedXpiPath;
  }

  const firefoxOptions = new firefox.Options();
  
  // Disable signature requirement for unsigned extensions
  firefoxOptions.setPreference('xpinstall.signatures.required', false);
  firefoxOptions.setPreference('extensions.autoDisableScopes', 0);
  firefoxOptions.setPreference('extensions.enabledScopes', 15);
  firefoxOptions.setPreference('devtools.console.stdout.content', true);
  firefoxOptions.setPreference('browser.tabs.warnOnClose', false);
  firefoxOptions.setPreference('browser.shell.checkDefaultBrowser', false);
  // Allow unsigned add-ons
  firefoxOptions.setPreference('xpinstall.whitelist.required', false);

  console.log('Starting Firefox...');
  
  const driver = await new Builder()
    .forBrowser(Browser.FIREFOX)
    .setFirefoxOptions(firefoxOptions)
    .build();

  await driver.manage().setTimeouts({ implicit: 10000 });
  
  // Install extension using Firefox's installAddon command
  console.log('Installing extension via installAddon...');
  try {
    const xpiContent = readFileSync(extensionPath);
    const base64Xpi = xpiContent.toString('base64');
    
    // Use Firefox-specific command to install addon
    await (driver as any).installAddon(base64Xpi, true); // true = temporary
    console.log('Extension installed successfully');
  } catch (e) {
    console.error('Failed to install extension:', e);
    // Try alternative method
    try {
      await (driver as any).installAddon(extensionPath, true);
      console.log('Extension installed via path');
    } catch (e2) {
      console.error('Alternative install also failed:', e2);
    }
  }
  
  // Wait for extension to initialize
  await sleep(3000);

  return driver;
}

export async function configureExtension(
  driver: WebDriver,
  model: ModelConfig,
  apiKeys: Record<string, string> = {},
  targetUrl: string
): Promise<void> {
  const storageData = getStorageKeysForModel(model);
  
  const mergedData = {
    ...storageData,
    ...apiKeys,
  };

  // Navigate to target page first
  await driver.get(targetUrl);
  await sleep(3000);
  
  // Check if content script is loaded by looking for extension markers
  try {
    const pageSource = await driver.getPageSource();
    console.log('Page loaded, checking for content script...');
  } catch (e) {
    console.warn('Could not get page source');
  }
  
  // Set config in IndexedDB
  try {
    await driver.executeScript(`
      return new Promise((resolve, reject) => {
        const IDB_DB_NAME = 'web-walker-ext-storage';
        const IDB_STORE = 'kv';
        const IDB_VER = 1;

        const req = indexedDB.open(IDB_DB_NAME, IDB_VER);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(IDB_STORE, 'readwrite');
          const store = tx.objectStore(IDB_STORE);
          
          const data = ${JSON.stringify(mergedData)};
          for (const [key, value] of Object.entries(data)) {
            store.put(value, key);
          }
          
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    `);
    console.log('Extension config set via IndexedDB');
  } catch (e) {
    console.warn('Failed to set IndexedDB config:', e);
  }
  
  // Reload page to pick up new config
  await driver.navigate().refresh();
  await sleep(2000);
}

export async function sendTaskToExtension(
  driver: WebDriver,
  task: string
): Promise<void> {
  // Setup listeners
  await driver.executeScript(`
    window.__browseBotEvalToolsCalled = [];
    window.__browseBotEvalCompleted = false;
    
    window.addEventListener('browse-bot-tool-call', (e) => {
      console.log('Tool called:', e.detail);
      window.__browseBotEvalToolsCalled.push(e.detail);
    });
    
    window.addEventListener('browse-bot-task-complete', () => {
      console.log('Task complete');
      window.__browseBotEvalCompleted = true;
    });
    
    console.log('Eval listeners set up');
  `);
  
  // Dispatch task event
  await driver.executeScript(`
    console.log('Dispatching eval task:', ${JSON.stringify(task)});
    window.dispatchEvent(new CustomEvent('browse-bot-eval-task', {
      detail: { task: ${JSON.stringify(task)} }
    }));
  `);
  
  console.log('Task dispatched to extension');
}

export async function waitForTaskCompletion(
  driver: WebDriver,
  timeout: number
): Promise<{ success: boolean; toolsCalled: Array<{ name: string; args: unknown; timestamp: number }> }> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const result = await driver.executeScript<{ completed: boolean; toolsCalled: Array<{ name: string; args: unknown; timestamp: number }> }>(`
        return {
          completed: window.__browseBotEvalCompleted || false,
          toolsCalled: window.__browseBotEvalToolsCalled || []
        };
      `);
      
      if (result?.completed) {
        return {
          success: true,
          toolsCalled: result.toolsCalled || [],
        };
      }
    } catch (e) {
      // Page might have navigated, ignore
    }
    
    await sleep(1000);
  }
  
  // Timeout
  try {
    const finalResult = await driver.executeScript<Array<{ name: string; args: unknown; timestamp: number }>>(`
      return window.__browseBotEvalToolsCalled || [];
    `);
    
    return { 
      success: false, 
      toolsCalled: finalResult || [] 
    };
  } catch {
    return { success: false, toolsCalled: [] };
  }
}

export async function cleanupDriver(driver: WebDriver): Promise<void> {
  try {
    await driver.quit();
  } catch {
    // Ignore cleanup errors
  }
}
