# Browse-Bot Evaluation Suite

Тестирование системного промпта и сравнение моделей для Browse-Bot.

## Quick Start

```bash
cd evals
npm install

# Сначала собери расширение
cd .. && npm run build:firefox && cd evals

# Запусти сервер с тестовыми страницами (в отдельном терминале)
npm run serve

# Запусти все тесты
npm run eval -- run --all

# Или конкретный сценарий
npm run eval -- run -s "add to cart"

# Только одна модель
npm run eval -- run -m openrouter/openai/gpt-4.1-mini
```

## Структура

```
evals/
├── src/
│   ├── cli.ts              # CLI интерфейс
│   ├── runner.ts           # Запуск сценариев
│   ├── assertions.ts       # Проверки результатов
│   ├── reporter.ts         # Генерация отчётов
│   ├── firefox-driver.ts   # Selenium + Firefox
│   ├── config.ts           # Конфигурация
│   └── types.ts            # TypeScript типы
├── scenarios/              # YAML сценарии
│   ├── add-to-cart.yaml
│   ├── fill-contact-form.yaml
│   ├── login.yaml
│   └── search.yaml
├── fixtures/
│   └── pages/              # Тестовые HTML страницы
│       ├── shop.html
│       ├── form.html
│       ├── login.html
│       └── search.html
└── results/                # JSON результаты
```

## Конфигурация моделей

API ключи через environment variables:

```bash
export OPENROUTER_API_KEY=sk-or-...
export OPENAI_API_KEY=sk-...
export XAI_API_KEY=xai-...
```

## Формат сценария (YAML)

```yaml
name: "Add item to cart"
description: "Optional description"
url: "/shop.html"                    # Относительный или абсолютный URL
task: "Add Wireless Headphones to cart"
timeout: 45000                       # ms, optional

assertions:
  - type: selector
    selector: "#cartCount"
    expected: "1"
  
  - type: tool_called
    tool: "findAndClick"
    contains: "add to cart"          # optional substring match
  
  - type: localStorage
    key: "cartCount"
    expected: "1"
```

## Типы assertions

| Type | Параметры | Описание |
|------|-----------|----------|
| `selector` | selector, expected | Проверить текст элемента |
| `selector_exists` | selector | Элемент существует |
| `selector_not_exists` | selector | Элемент не существует |
| `url_contains` | expected | URL содержит строку |
| `url_equals` | expected | URL равен значению |
| `text_contains` | expected | Страница содержит текст |
| `tool_called` | tool, contains? | Tool был вызван |
| `localStorage` | key, expected/contains | Проверить localStorage |
| `cookie` | key, expected/contains | Проверить cookie |

## Команды CLI

```bash
# Запуск тестов
npm run eval -- run [options]
  -s, --scenario <name>      # Конкретный сценарий
  -m, --model <model>        # Конкретная модель (provider/model)
  -a, --all                  # Все сценарии и модели
  -t, --timeout <ms>         # Таймаут (default: 60000)
  -o, --output <dir>         # Директория результатов
  --extension <path>         # Путь к собранному расширению
  --fixtures-url <url>       # URL для тестовых страниц

# Просмотр результатов
npm run eval -- report [options]
  -d, --detailed             # Детальный отчёт
  -c, --compare              # Сравнить последние прогоны
  -n, --limit <n>            # Количество прогонов для сравнения

# Список сценариев
npm run eval -- list
```

## Пример вывода

```
🧪 Browse-Bot Eval Suite
Found 5 scenarios
Testing 3 models

▶ Running: Add item to cart
  Model: openrouter/openai/gpt-4.1-mini
  URL: http://localhost:3001/shop.html
  Task: Add the Wireless Headphones to the cart
  ✓ PASSED (4521ms)

📊 Eval Summary

Total scenarios: 5
Total runs: 15

┌───────────────────────┬────────────┬────────┬────────┬───────────┬──────────┐
│ Model                 │ Provider   │ Passed │ Failed │ Success % │ Avg Time │
├───────────────────────┼────────────┼────────┼────────┼───────────┼──────────┤
│ claude-sonnet-4-20250514 │ anthropic  │ 5      │ 0      │ 100.0%    │ 3.8s     │
│ gpt-4.1-mini          │ openai     │ 4      │ 1      │ 80.0%     │ 4.2s     │
│ gemini-2.0-flash-001  │ google     │ 4      │ 1      │ 80.0%     │ 2.1s     │
└───────────────────────┴────────────┴────────┴────────┴───────────┴──────────┘

🏆 Best performer: anthropic/claude-sonnet-4-20250514
   100.0% success rate, 3.8s avg
```

## Интеграция с расширением

✅ **Уже интегрировано!** В расширение добавлены:

- `content.ts` - слушатель `browse-bot-eval-task` для получения задач
- `service_worker.ts` - обработчик `EVAL_TASK` для запуска агента
- События `browse-bot-tool-call` и `browse-bot-task-complete` для трекинга

Расширение автоматически:
1. Принимает задачу через custom event
2. Запускает агента с указанной моделью
3. Отправляет события о вызове каждого tool
4. Сигнализирует о завершении задачи

## Добавление новых сценариев

1. Создай HTML страницу в `fixtures/pages/` (или используй внешний URL)
2. Создай YAML файл в `scenarios/`
3. Определи assertions для проверки успеха
4. Запусти `npm run eval -- run -s "your scenario"`

