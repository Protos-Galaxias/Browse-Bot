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

async function getExtensionUUID(driver: WebDriver): Promise<string | null> {
  // Navigate to about:debugging to find extension UUID
  try {
    await driver.get('about:debugging#/runtime/this-firefox');
    await sleep(3000);
    
    // Look for Browse Bot extension and get its internal UUID
    const result = await driver.executeScript(`
      // Debug: log page content
      const pageText = document.body.innerText;
      console.log('about:debugging page loaded');
      
      // Find all links that contain moz-extension
      const allLinks = Array.from(document.querySelectorAll('a[href*="moz-extension://"]'));
      console.log('Found moz-extension links:', allLinks.length);
      
      for (const link of allLinks) {
        const href = link.getAttribute('href') || '';
        console.log('Link href:', href);
        const match = href.match(/moz-extension:\\/\\/([^/]+)/);
        if (match) {
          // Check if this is our extension by looking at nearby text
          const parent = link.closest('.card, .debug-target-item, [class*="extension"]') || link.parentElement?.parentElement;
          const parentText = parent?.textContent || '';
          console.log('Parent text:', parentText.substring(0, 200));
          if (parentText.includes('Browse Bot')) {
            console.log('Found Browse Bot UUID:', match[1]);
            return { uuid: match[1], found: true };
          }
        }
      }
      
      // Fallback: just return the first moz-extension UUID found
      if (allLinks.length > 0) {
        const href = allLinks[0].getAttribute('href') || '';
        const match = href.match(/moz-extension:\\/\\/([^/]+)/);
        if (match) {
          console.log('Using first extension UUID:', match[1]);
          return { uuid: match[1], found: false, fallback: true };
        }
      }
      
      return { uuid: null, found: false, pageText: pageText.substring(0, 500) };
    `);
    
    console.log('Extension UUID search result:', result);
    const res = result as { uuid: string | null; found?: boolean; fallback?: boolean; pageText?: string };
    return res?.uuid || null;
  } catch (e) {
    console.warn('Failed to get extension UUID:', e);
    return null;
  }
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

  // Try to get extension UUID and configure via extension page directly
  console.log('Getting extension UUID...');
  const uuid = await getExtensionUUID(driver);
  
  if (uuid) {
    console.log(`Extension UUID: ${uuid}`);
    const extensionUrl = `moz-extension://${uuid}/index.html`;
    console.log(`Opening extension page: ${extensionUrl}`);
    
    try {
      await driver.get(extensionUrl);
      await sleep(3000);
      
      // Check current URL
      const currentUrl = await driver.getCurrentUrl();
      console.log(`Current URL after navigation: ${currentUrl}`);
      
      // Write config directly to IndexedDB from extension context
      console.log('Writing config to IndexedDB:', Object.keys(mergedData));
      const configSet = await driver.executeScript(`
        return new Promise((resolve, reject) => {
          try {
            const IDB_DB_NAME = 'web-walker-ext-storage';
            const IDB_STORE = 'kv';
            const IDB_VER = 1;
            
            console.log('Opening IndexedDB...');

            const req = indexedDB.open(IDB_DB_NAME, IDB_VER);
            req.onupgradeneeded = () => {
              console.log('IndexedDB upgrade needed');
              const db = req.result;
              if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE);
              }
            };
            req.onsuccess = () => {
              console.log('IndexedDB opened');
              const db = req.result;
              const tx = db.transaction(IDB_STORE, 'readwrite');
              const store = tx.objectStore(IDB_STORE);
              
              const data = ${JSON.stringify(mergedData)};
              console.log('Writing keys:', Object.keys(data));
              for (const [key, value] of Object.entries(data)) {
                console.log('Putting:', key, '=', typeof value === 'string' ? value.substring(0, 20) + '...' : value);
                store.put(value, key);
              }
              
              tx.oncomplete = () => {
                console.log('IndexedDB transaction complete');
                resolve({ success: true, keys: Object.keys(data) });
              };
              tx.onerror = () => {
                console.error('IndexedDB transaction error:', tx.error);
                reject(tx.error);
              };
            };
            req.onerror = () => {
              console.error('IndexedDB open error:', req.error);
              reject(req.error);
            };
          } catch (e) {
            console.error('IndexedDB exception:', e);
            reject(e);
          }
        });
      `);
      
      console.log('Config set via extension page IndexedDB:', configSet);
      
      // Verify by reading back
      const verify = await driver.executeScript(`
        return new Promise((resolve) => {
          const req = indexedDB.open('web-walker-ext-storage', 1);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('kv', 'readonly');
            const store = tx.objectStore('kv');
            const getReq = store.get('provider');
            getReq.onsuccess = () => resolve({ provider: getReq.result });
            getReq.onerror = () => resolve({ error: 'get failed' });
          };
          req.onerror = () => resolve({ error: 'open failed' });
        });
      `);
      console.log('Verification read:', verify);
      
    } catch (e) {
      console.warn('Failed to set config via extension page:', e);
    }
  } else {
    console.warn('Could not get extension UUID, skipping direct config');
  }

  // Navigate to target page
  await driver.get(targetUrl);
  await sleep(2000);
  
  // Clear localStorage to ensure clean state for each test
  await driver.executeScript(`
    localStorage.clear();
    sessionStorage.clear();
    console.log('Storage cleared for clean test state');
  `);
  
  // Wait for content script to load (poll for DOM marker)
  console.log('Waiting for content script to load...');
  for (let i = 0; i < 20; i++) {
    try {
      const ready = await driver.executeScript(`
        return document.documentElement.getAttribute('data-browse-bot-loaded') === 'true';
      `);
      if (ready) {
        console.log('Content script detected via DOM marker');
        break;
      }
    } catch { /* ignore */ }
    await sleep(500);
  }
}

export async function sendTaskToExtension(
  driver: WebDriver,
  task: string
): Promise<void> {
  // Clear any previous state
  await driver.executeScript(`
    document.documentElement.removeAttribute('data-browse-bot-tools');
    document.documentElement.removeAttribute('data-browse-bot-complete');
    console.log('Eval state cleared');
  `);
  
  // Wait a bit for content script to be fully ready
  await sleep(1000);
  
  // Send task via DOM attribute
  console.log('Sending task via DOM attribute...');
  await driver.executeScript(`
    console.log('Setting eval task via DOM:', ${JSON.stringify(task)});
    document.documentElement.setAttribute('data-browse-bot-task', ${JSON.stringify(task)});
  `);
  
  // Wait and verify task was picked up (attribute should be removed by content script)
  for (let i = 0; i < 10; i++) {
    await sleep(300);
    const taskStillPresent = await driver.executeScript(`
      return document.documentElement.getAttribute('data-browse-bot-task');
    `);
    
    if (!taskStillPresent) {
      console.log('Task attribute removed - content script received the task');
      break;
    }
    
    if (i === 9) {
      console.warn('Task attribute still present after 3s - content script may not be working');
    }
  }
  
  console.log('Task dispatched to extension via DOM attribute');
}

export async function waitForTaskCompletion(
  driver: WebDriver,
  timeout: number
): Promise<{ success: boolean; toolsCalled: Array<{ name: string; args: unknown; timestamp: number }> }> {
  const startTime = Date.now();
  let lastDebug = '';
  
  while (Date.now() - startTime < timeout) {
    try {
      const result = await driver.executeScript<{ completed: boolean; toolsCalled: Array<{ name: string; args: unknown; timestamp: number }>; debug: string }>(`
        const completed = document.documentElement.getAttribute('data-browse-bot-complete') === 'true';
        let toolsCalled = [];
        try {
          const toolsJson = document.documentElement.getAttribute('data-browse-bot-tools');
          if (toolsJson) toolsCalled = JSON.parse(toolsJson);
        } catch {}
        const debug = document.documentElement.getAttribute('data-browse-bot-debug') || '';
        return { completed, toolsCalled, debug };
      `);
      
      // Print new debug messages
      if (result?.debug && result.debug !== lastDebug) {
        const newLines = result.debug.replace(lastDebug, '').trim();
        if (newLines) {
          for (const line of newLines.split('\n')) {
            if (line.trim()) console.log('  [SW]', line.trim());
          }
        }
        lastDebug = result.debug;
      }
      
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
  
  // Timeout - print final debug and return whatever tools were called
  try {
    const finalResult = await driver.executeScript<{ toolsCalled: Array<{ name: string; args: unknown; timestamp: number }>; debug: string }>(`
      let toolsCalled = [];
      try {
        const toolsJson = document.documentElement.getAttribute('data-browse-bot-tools');
        if (toolsJson) toolsCalled = JSON.parse(toolsJson);
      } catch {}
      const debug = document.documentElement.getAttribute('data-browse-bot-debug') || '';
      return { toolsCalled, debug };
    `);
    
    // Print any remaining debug
    if (finalResult?.debug && finalResult.debug !== lastDebug) {
      const newLines = finalResult.debug.replace(lastDebug, '').trim();
      if (newLines) {
        for (const line of newLines.split('\n')) {
          if (line.trim()) console.log('  [SW]', line.trim());
        }
      }
    }
    
    return { 
      success: false, 
      toolsCalled: finalResult?.toolsCalled || [] 
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
