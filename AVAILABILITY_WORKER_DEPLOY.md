# Деплой Availability Worker

Этот Cloudflare Worker проверяет доступность AI провайдеров для визарда первого запуска.

## Быстрый деплой

1. **Создайте Cloudflare аккаунт**
   - Перейдите на [dash.cloudflare.com](https://dash.cloudflare.com)
   - Зарегистрируйтесь или войдите

2. **Создайте Worker**
   - Перейдите в раздел **Workers & Pages**
   - Нажмите **"Start with Hello World!"** (или "Create" → "Worker")
   - Дайте имя (например, `web-walker-availability`)
   - Нажмите **Deploy**

3. **Скопируйте код**
   - После деплоя нажмите **"Edit code"**
   - Удалите весь шаблонный код
   - Откройте файл `availability-worker.js` в своём проекте
   - Скопируйте весь код и вставьте в редактор Cloudflare

4. **Задеплойте**
   - Нажмите **"Save and Deploy"** (или **"Deploy"**)
   - Скопируйте URL вашего worker (например, `https://web-walker-availability.your-subdomain.workers.dev/`)

5. **Обновите код расширения**
   - Откройте `src/front/Wizard.svelte`
   - Найдите строку `const AVAILABILITY_CHECK_URL = ...`
   - Замените на URL вашего worker

## Альтернатива: локальная проверка (упрощённая)

Если не хотите деплоить Worker, можете использовать упрощённую версию без внешнего сервера:

В `src/front/Wizard.svelte` замените функцию `checkProvidersAvailability`:

```typescript
async function checkProvidersAvailability() {
    const providerIds = Object.keys(ProviderMeta) as ProviderId[];
    
    providers = providerIds.map(id => ({
        id,
        name: id,
        available: true, // Все доступны по умолчанию
        checking: false,
        ...providerDetails[id]
    }));
}
```

## Тестирование

После деплоя проверьте работу:

```bash
curl "https://your-worker-url/?provider=openai"
```

Ответ должен быть:
```json
{
  "available": true,
  "note": "API accessible (auth required)"
}
```

## Стоимость

Cloudflare Workers предоставляет **100,000 бесплатных запросов в день**, чего более чем достаточно для проверки доступности.

