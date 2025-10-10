# Конфигурация провайдеров

Визард загружает список AI провайдеров из внешнего JSON файла.

## Формат JSON

```json
{
  "providers": [
    {
      "id": "openrouter",
      "name": "OpenRouter",
      "description": "Access to 200+ models including GPT-4, Claude, Llama",
      "needsApiKey": true,
      "apiKeyUrl": "https://openrouter.ai/keys",
      "apiKeyPlaceholder": "sk-or-...",
      "needsBaseUrl": false,
      "baseUrlPlaceholder": "",
      "enabled": true,
      "priority": 1
    }
  ],
  "version": "1.0.0",
  "lastUpdated": "2025-01-10"
}
```

## Поля провайдера

- **id** (обязательно) - уникальный идентификатор (`openrouter`, `openai`, `xai`, `ollama`)
- **name** (обязательно) - отображаемое имя
- **description** (опционально) - краткое описание
- **needsApiKey** - требуется ли API ключ
- **apiKeyUrl** - URL для получения API ключа
- **apiKeyPlaceholder** - пример формата ключа
- **needsBaseUrl** - требуется ли Base URL (для локальных/самохостинговых)
- **baseUrlPlaceholder** - пример Base URL
- **enabled** - показывать ли провайдера в визарде
- **priority** - порядок отображения (меньше = выше)

## Где разместить JSON

### 1. GitHub (рекомендуется)

```bash
# Создай публичный репозиторий на GitHub
# Положи providers-config.json в корень
# URL будет:
https://raw.githubusercontent.com/username/repo/main/providers-config.json
```

### 2. Cloudflare R2

```bash
# Создай бакет в Cloudflare R2
# Загрузи providers-config.json
# Настрой публичный доступ
# URL будет:
https://your-bucket.r2.dev/providers-config.json
```

### 3. Любой статический хостинг

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

## Обновление URL в коде

В `src/front/Wizard.svelte`:

```typescript
const PROVIDERS_CONFIG_URL = 'https://ваш-url/providers-config.json';
```

## Fallback механизм

Если загрузка не удалась, используется встроенная конфигурация из `FALLBACK_PROVIDERS`.

## Добавление нового провайдера

1. Добавь провайдера в `providers-config.json`
2. Добавь конфигурацию в `src/services/ProviderConfigs.ts`
3. Добавь мета-данные в `src/services/ProviderMeta.ts`
4. Пересобери расширение

## Управление доступностью

Просто измени `enabled`:

```json
{
  "id": "xai",
  "name": "xAI (Grok)",
  "enabled": false  // Скрыть из визарда
}
```

Провайдер исчезнет из списка при следующей загрузке конфигурации.

