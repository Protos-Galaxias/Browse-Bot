// src/content.ts

console.log("Web Walker: Content script injected.");

// Хранилище кликабельных элементов, доступное в пределах этого скрипта
const interactiveElements = new Map<string, HTMLElement>();
let elementIdCounter = 0;

/**
 * Рекурсивно обходит DOM-дерево и создает его упрощенное текстовое представление,
 * помечая интерактивные элементы специальными тегами.
 * @returns {string} Упрощенный DOM в виде строки.
 */
function getSimplifiedDom(): string {
  interactiveElements.clear();
  elementIdCounter = 0;

  function isVisible(el: HTMLElement): boolean {
    // Проверяет, является ли элемент видимым для пользователя
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function traverse(node: Node): string {
    // 1. Обработка текстовых узлов
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      return node.textContent.trim().replace(/\s+/g, ' ');
    }

    // 2. Игнорирование не-элементных узлов
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const element = node as HTMLElement;

    // 3. Фильтрация невидимых и служебных тегов
    if (
      !isVisible(element) ||
      ['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'META', 'LINK'].includes(element.tagName)
    ) {
      return '';
    }

    // 4. Рекурсивный обход дочерних элементов
    let childrenContent = Array.from(element.childNodes).map(traverse).join(' ');

    // 5. Определение интерактивности
    const isClickable = window.getComputedStyle(element).cursor === 'pointer';
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
    
    // Элемент считается интерактивным, если он кликабельный или является полем ввода
    if ((isClickable || isInput) && (element.innerText.trim() || element.getAttribute('aria-label') || element.getAttribute('placeholder'))) {
        const id = element.id || `ai-element-${elementIdCounter++}`;
        interactiveElements.set(id, element);
        
        let type = "element";
        if (isInput) type = element.tagName.toLowerCase();
        else if (isClickable) type = "button";

        const textContent = element.innerText.trim() || element.getAttribute('aria-label') || element.getAttribute('placeholder');
        
        // Используем кастомные теги, понятные для LLM
        return `<interactive id="${id}" type="${type}">${textContent}</interactive>`;
    }

    return childrenContent;
  }

  const result = traverse(document.body);
  console.log("Web Walker: Simplified DOM created, elements tracked:", interactiveElements.size);
  return result;
}

// Слушаем команды от Service Worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Web Walker: Message received in content script", message);

  switch (message.type) {
    case 'GET_CONTEXT':
      const simplifiedDom = getSimplifiedDom();

      console.log("GET_CONTEXT666", simplifiedDom);
      sendResponse({ dom: simplifiedDom });
      break;

    case 'EXECUTE_CLICK':
      const elementToClick = interactiveElements.get(message.elementId);
      if (elementToClick) {
        elementToClick.click();
        console.log(`Web Walker: Clicked element ${message.elementId}`);
        sendResponse({ status: 'ok' });
      } else {
        console.error(`Web Walker: Element with id ${message.elementId} not found for CLICK.`);
        sendResponse({ status: 'error', reason: 'Element not found' });
      }
      break;

    case 'EXECUTE_TYPE':
      const elementToType = interactiveElements.get(message.elementId) as HTMLInputElement | HTMLTextAreaElement;
      if (elementToType) {
        elementToType.value = message.text;
        console.log(`Web Walker: Typed into element ${message.elementId}`);
        sendResponse({ status: 'ok' });
      } else {
        console.error(`Web Walker: Element with id ${message.elementId} not found for TYPE.`);
        sendResponse({ status: 'error', reason: 'Element not found' });
      }
      break;

    default:
        console.warn("Web Walker: Unknown message type received", message.type);
        break;
  }
  
  // Возвращаем true, чтобы indicate, что ответ будет отправлен асинхронно.
  return true;
});

// Уведомляем service worker, что контент-скрипт загружен и готов принимать сообщения.
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' }).catch(e => console.error("Web Walker: Failed to send CONTENT_SCRIPT_READY message:", e));