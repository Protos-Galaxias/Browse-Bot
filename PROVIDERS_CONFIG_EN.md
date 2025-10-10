# Provider Configuration

The wizard loads the list of AI providers from an external JSON file.

## JSON Format

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

## Provider Fields

- **id** (required) - unique identifier (`openrouter`, `openai`, `xai`, `ollama`)
- **name** (required) - display name
- **description** (optional) - short description
- **needsApiKey** - whether API key is required
- **apiKeyUrl** - URL to get API key
- **apiKeyPlaceholder** - example key format
- **needsBaseUrl** - whether Base URL is required (for local/self-hosted)
- **baseUrlPlaceholder** - example Base URL
- **enabled** - whether to show provider in wizard
- **priority** - display order (lower = higher)

## Where to Host JSON

### 1. GitHub (recommended)

```bash
# Create a public repository on GitHub
# Put providers-config.json in the root
# URL will be:
https://raw.githubusercontent.com/username/repo/main/providers-config.json
```

### 2. GitLab

```bash
# Create a public repository on GitLab
# Put providers-config.json in the root
# URL will be:
https://gitlab.com/username/repo/-/raw/main/providers-config.json
```

### 3. Cloudflare R2

```bash
# Create a bucket in Cloudflare R2
# Upload providers-config.json
# Configure public access
# URL will be:
https://your-bucket.r2.dev/providers-config.json
```

### 4. Any Static Hosting

- GitHub Pages
- GitLab Pages
- Netlify
- Vercel
- Cloudflare Pages

## Update URL in Code

In `src/front/Wizard.svelte`:

```typescript
const PROVIDERS_CONFIG_URL = 'https://your-url/providers-config.json';
```

## Fallback Mechanism

If loading fails, the built-in configuration from `FALLBACK_PROVIDERS` is used.

## Adding a New Provider

1. Add provider to `providers-config.json`
2. Add configuration to `src/services/ProviderConfigs.ts`
3. Add metadata to `src/services/ProviderMeta.ts`
4. Rebuild the extension

## Managing Availability

Simply change `enabled`:

```json
{
  "id": "xai",
  "name": "xAI (Grok)",
  "enabled": false  // Hide from wizard
}
```

The provider will disappear from the list on next config load.

