/**
 * Cloudflare Worker для проверки доступности AI провайдеров
 * 
 * Деплой:
 * 1. Создайте проект на dash.cloudflare.com/workers
 * 2. Скопируйте этот код в worker
 * 3. Задеплойте
 * 4. Обновите AVAILABILITY_CHECK_URL в Wizard.svelte на ваш worker URL
 */

// Endpoints для проверки провайдеров
const PROVIDER_ENDPOINTS = {
  openrouter: 'https://openrouter.ai/api/v1/models',
  openai: 'https://api.openai.com/v1/models',
  xai: 'https://api.x.ai/v1/models',
  // Ollama проверяется локально пользователем
};

async function checkProviderAvailability(provider) {
  // Ollama всегда помечаем как недоступный (локальный)
  if (provider === 'ollama') {
    return { available: true, note: 'Local installation required' };
  }

  const endpoint = PROVIDER_ENDPOINTS[provider];
  if (!endpoint) {
    return { available: false, error: 'Unknown provider' };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'User-Agent': 'Web-Walker-Extension/1.0',
      },
      // Короткий таймаут для быстрой проверки
      signal: AbortSignal.timeout(5000),
    });

    // Если получили ответ (даже 401/403 - значит сервис работает)
    if (response.status === 401 || response.status === 403) {
      return { available: true, note: 'API accessible (auth required)' };
    }

    if (response.ok) {
      return { available: true, note: 'API accessible' };
    }

    return { available: false, error: `HTTP ${response.status}` };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

export default {
  async fetch(request) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    // Parse URL
    const url = new URL(request.url);
    const provider = url.searchParams.get('provider');

    if (!provider) {
      return new Response(
        JSON.stringify({
          error: 'Missing provider parameter',
          validProviders: Object.keys(PROVIDER_ENDPOINTS).concat(['ollama']),
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    // Check availability
    const result = await checkProviderAvailability(provider);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // 5 минут кеш
        ...corsHeaders,
      },
    });
  },
};

