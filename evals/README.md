# Browse-Bot Evaluation Suite

Автоматизированное тестирование Browse-Bot агента с разными LLM моделями.

## Требования

- Node.js 18+
- Firefox (не headless — расширения требуют GUI)
- Geckodriver (установится автоматически)

## Quick Start

```bash
# 1. Установи зависимости
cd evals
npm install

# 2. Собери расширение Firefox
cd ..
npm run build:firefox
cd evals

# 3. Запусти сервер тестовых страниц (в отдельном терминале)
npm run serve

# 4. Запусти тесты с API ключом
OPENAI_API_KEY=sk-proj-... npm run eval -- run --all
```

## API Ключи

Передавай через environment variables:

```bash
# OpenAI (по умолчанию)
OPENAI_API_KEY=sk-proj-...

# Или OpenRouter (для доступа к разным моделям)
OPENROUTER_API_KEY=sk-or-v1-...

# Или xAI
XAI_API_KEY=xai-...
```

## Команды

### Запуск тестов

```bash
# Один сценарий
npm run eval -- run -s add-to-cart

# Все сценарии
npm run eval -- run

# Конкретная модель (если настроено несколько в config.ts)
npm run eval -- run -m openai/gpt-4.1-mini

# С кастомным таймаутом
npm run eval -- run -s login -t 90000
```

### Просмотр результатов

```bash
# Список доступных сценариев
npm run eval -- list

# Отчёт по последним запускам
npm run eval -- report

# Детальный отчёт
npm run eval -- report -d

# Сравнение запусков
npm run eval -- report -c
```

## Структура проекта

```
evals/
├── scenarios/           # YAML сценарии тестов
│   ├── add-to-cart.yaml
│   ├── add-multiple-items.yaml
│   ├── fill-contact-form.yaml
│   ├── login.yaml
│   └── search.yaml
├── fixtures/pages/      # HTML страницы для тестов
│   ├── shop.html
│   ├── form.html
│   ├── login.html
│   └── search.html
├── results/             # JSON результаты запусков
└── src/
    ├── cli.ts           # CLI команды
    ├── runner.ts        # Логика запуска
    ├── assertions.ts    # Проверки результатов
    ├── firefox-driver.ts # Selenium + Firefox
    └── config.ts        # Конфигурация моделей
```

## Формат сценария

```yaml
name: "Add item to cart"
description: "Агент добавляет товар в корзину"
url: "/shop.html"
task: "Add the Wireless Headphones to the cart"
timeout: 45000  # опционально, мс

assertions:
  # Проверить текст элемента
  - type: selector
    selector: "#cartCount"
    expected: "1"
  
  # Проверить что tool был вызван
  - type: tool_called
    tool: "findAndClick"
    contains: "add to cart"  # опционально
  
  # Проверить localStorage
  - type: localStorage
    key: "cartCount"
    expected: "1"
```

## Типы проверок (assertions)

| Тип | Параметры | Что проверяет |
|-----|-----------|---------------|
| `selector` | `selector`, `expected` | Текст элемента равен значению |
| `selector_exists` | `selector` | Элемент существует на странице |
| `selector_not_exists` | `selector` | Элемент НЕ существует |
| `url_contains` | `expected` | URL содержит подстроку |
| `url_equals` | `expected` | URL точно равен |
| `text_contains` | `expected` | Страница содержит текст |
| `tool_called` | `tool`, `contains?` | Агент вызвал инструмент |
| `localStorage` | `key`, `expected` | Значение в localStorage |
| `cookie` | `key`, `expected` | Значение cookie |

## Критерий успеха

**Тест проходит если ВСЕ assertions прошли.**

Пример вывода:
```
▶ Running: Add item to cart
  Model: openai/gpt-4.1-mini
  URL: http://localhost:3001/shop.html
  Task: Add the Wireless Headphones to the cart
  [SW] Active tab: 1 http://localhost:3001/shop.html
  [SW] Provider: openai
  [SW] API key present: true sk-proj-...
  [SW] Creating AI service...
  [SW] Starting agent task with 11 tools
  [SW] Agent task completed
  Tools: parsePage → findAndClick
  ✓ PASSED (5234ms)
```

## Добавление нового теста

1. **Создай HTML страницу** (если нужна новая) в `fixtures/pages/`

2. **Создай YAML сценарий** в `scenarios/`:
```yaml
name: "My new test"
url: "/my-page.html"
task: "Do something specific"
assertions:
  - type: selector_exists
    selector: "#success"
```

3. **Запусти**:
```bash
npm run eval -- run -s "my new test"
```

## Изменение модели по умолчанию

Редактируй `src/config.ts`:

```typescript
export const DEFAULT_MODELS: ModelConfig[] = [
  {
    provider: 'openai',      // openai | openrouter | xai | ollama | lmstudio
    model: 'gpt-4.1-mini',
  },
];
```

## Troubleshooting

### Firefox не запускается
```bash
# Проверь что geckodriver доступен
npx geckodriver --version

# Если нет — переустанови
npm install geckodriver --force
```

### "No active tab" ошибка
Firefox нужен с GUI (не headless). Убедись что на машине есть дисплей.

### Тест таймаутится
- Увеличь timeout: `npm run eval -- run -s test -t 120000`
- Проверь что `npm run serve` запущен
- Проверь API ключ — должен быть правильного провайдера

### "API key not configured"
Передай ключ через env:
```bash
OPENAI_API_KEY=sk-... npm run eval -- run
```

### Content script не загружается
Пересобери расширение:
```bash
cd .. && npm run build:firefox && cd evals
```

## Как это работает

1. **Selenium запускает Firefox** и устанавливает расширение
2. **Конфигурирует расширение** — записывает API ключ и провайдер в IndexedDB
3. **Открывает тестовую страницу** (localhost:3001/...)
4. **Отправляет задачу агенту** через DOM атрибут
5. **Content script** передаёт задачу в service worker
6. **Service worker** инициализирует AI и запускает агента
7. **Агент выполняет задачу** — вызывает tools (parsePage, findAndClick, etc.)
8. **Каждый вызов tool** записывается в DOM для отслеживания
9. **После завершения** Selenium проверяет assertions
10. **Результат** — PASSED или FAILED с деталями
