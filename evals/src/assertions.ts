import type { WebDriver } from 'selenium-webdriver';
import { By } from 'selenium-webdriver';
import type { Assertion, AssertionResult, ToolCall } from './types.js';

export async function runAssertion(
  driver: WebDriver,
  assertion: Assertion,
  toolsCalled: ToolCall[]
): Promise<AssertionResult> {
  try {
    switch (assertion.type) {
      case 'selector':
        return await assertSelector(driver, assertion);
      case 'selector_exists':
        return await assertSelectorExists(driver, assertion);
      case 'selector_not_exists':
        return await assertSelectorNotExists(driver, assertion);
      case 'url_contains':
        return await assertUrlContains(driver, assertion);
      case 'url_equals':
        return await assertUrlEquals(driver, assertion);
      case 'text_contains':
        return await assertTextContains(driver, assertion);
      case 'tool_called':
        return assertToolCalled(assertion, toolsCalled);
      case 'localStorage':
        return await assertLocalStorage(driver, assertion);
      case 'cookie':
        return await assertCookie(driver, assertion);
      default:
        return {
          assertion,
          passed: false,
          error: `Unknown assertion type: ${(assertion as Assertion).type}`,
        };
    }
  } catch (error) {
    return {
      assertion,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function assertSelector(
  driver: WebDriver,
  assertion: Assertion
): Promise<AssertionResult> {
  if (!assertion.selector) {
    return { assertion, passed: false, error: 'Missing selector' };
  }

  const element = await driver.findElement(By.css(assertion.selector));
  const actual = await element.getText();

  const passed = assertion.expected !== undefined
    ? actual.trim() === assertion.expected.trim()
    : actual.length > 0;

  return {
    assertion,
    passed,
    actual,
  };
}

async function assertSelectorExists(
  driver: WebDriver,
  assertion: Assertion
): Promise<AssertionResult> {
  if (!assertion.selector) {
    return { assertion, passed: false, error: 'Missing selector' };
  }

  const elements = await driver.findElements(By.css(assertion.selector));
  const passed = elements.length > 0;

  return {
    assertion,
    passed,
    actual: `Found ${elements.length} element(s)`,
  };
}

async function assertSelectorNotExists(
  driver: WebDriver,
  assertion: Assertion
): Promise<AssertionResult> {
  if (!assertion.selector) {
    return { assertion, passed: false, error: 'Missing selector' };
  }

  const elements = await driver.findElements(By.css(assertion.selector));
  const passed = elements.length === 0;

  return {
    assertion,
    passed,
    actual: `Found ${elements.length} element(s)`,
  };
}

async function assertUrlContains(
  driver: WebDriver,
  assertion: Assertion
): Promise<AssertionResult> {
  if (!assertion.expected) {
    return { assertion, passed: false, error: 'Missing expected value' };
  }

  const currentUrl = await driver.getCurrentUrl();
  const passed = currentUrl.includes(assertion.expected);

  return {
    assertion,
    passed,
    actual: currentUrl,
  };
}

async function assertUrlEquals(
  driver: WebDriver,
  assertion: Assertion
): Promise<AssertionResult> {
  if (!assertion.expected) {
    return { assertion, passed: false, error: 'Missing expected value' };
  }

  const currentUrl = await driver.getCurrentUrl();
  const passed = currentUrl === assertion.expected;

  return {
    assertion,
    passed,
    actual: currentUrl,
  };
}

async function assertTextContains(
  driver: WebDriver,
  assertion: Assertion
): Promise<AssertionResult> {
  if (!assertion.expected) {
    return { assertion, passed: false, error: 'Missing expected value' };
  }

  const body = await driver.findElement(By.css('body'));
  const text = await body.getText();
  const passed = text.includes(assertion.expected);

  return {
    assertion,
    passed,
    actual: text.length > 200 ? text.slice(0, 200) + '...' : text,
  };
}

function assertToolCalled(
  assertion: Assertion,
  toolsCalled: ToolCall[]
): AssertionResult {
  if (!assertion.tool) {
    return { assertion, passed: false, error: 'Missing tool name' };
  }

  const matchingCalls = toolsCalled.filter(call => call.name === assertion.tool);

  if (matchingCalls.length === 0) {
    return {
      assertion,
      passed: false,
      actual: `Tool '${assertion.tool}' was not called. Called tools: ${toolsCalled.map(t => t.name).join(', ') || 'none'}`,
    };
  }

  // If 'contains' is specified, check if any call's args contain that value
  if (assertion.contains) {
    const containsMatch = matchingCalls.some(call => {
      const argsStr = JSON.stringify(call.args).toLowerCase();
      return argsStr.includes(assertion.contains!.toLowerCase());
    });

    return {
      assertion,
      passed: containsMatch,
      actual: containsMatch
        ? `Tool '${assertion.tool}' was called with matching args`
        : `Tool '${assertion.tool}' was called but args don't contain '${assertion.contains}'`,
    };
  }

  return {
    assertion,
    passed: true,
    actual: `Tool '${assertion.tool}' was called ${matchingCalls.length} time(s)`,
  };
}

async function assertLocalStorage(
  driver: WebDriver,
  assertion: Assertion
): Promise<AssertionResult> {
  if (!assertion.key) {
    return { assertion, passed: false, error: 'Missing localStorage key' };
  }

  const value = await driver.executeScript<string | null>(
    `return localStorage.getItem(${JSON.stringify(assertion.key)});`
  );

  if (assertion.expected !== undefined) {
    const passed = value === assertion.expected;
    return { assertion, passed, actual: value ?? 'null' };
  }

  if (assertion.contains) {
    const passed = value !== null && value.includes(assertion.contains);
    return { assertion, passed, actual: value ?? 'null' };
  }

  // Just check existence
  return {
    assertion,
    passed: value !== null,
    actual: value ?? 'null',
  };
}

async function assertCookie(
  driver: WebDriver,
  assertion: Assertion
): Promise<AssertionResult> {
  if (!assertion.key) {
    return { assertion, passed: false, error: 'Missing cookie name' };
  }

  const cookie = await driver.manage().getCookie(assertion.key);

  if (!cookie) {
    return {
      assertion,
      passed: false,
      actual: `Cookie '${assertion.key}' not found`,
    };
  }

  if (assertion.expected !== undefined) {
    const passed = cookie.value === assertion.expected;
    return { assertion, passed, actual: cookie.value };
  }

  if (assertion.contains) {
    const passed = cookie.value.includes(assertion.contains);
    return { assertion, passed, actual: cookie.value };
  }

  return {
    assertion,
    passed: true,
    actual: cookie.value,
  };
}

export async function runAllAssertions(
  driver: WebDriver,
  assertions: Assertion[],
  toolsCalled: ToolCall[]
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  for (const assertion of assertions) {
    const result = await runAssertion(driver, assertion, toolsCalled);
    results.push(result);
  }

  return results;
}


