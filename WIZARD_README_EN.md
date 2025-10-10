# First Launch Wizard

## What's Done

Added a wizard (onboarding) for first launch when there are no settings:

### ✅ Features

1. **Provider Loading** - AI provider list loaded from external JSON
2. **Provider Selection** - displays list with names and descriptions
3. **Credentials Input** - prompts for API key or Base URL after selection
4. **Key Acquisition Links** - direct links to create API keys
5. **Auto-redirect to Chat** - automatically redirects to chat screen after saving
6. **Fallback** - uses built-in configuration if loading fails

### 📁 Modified Files

- `src/front/Wizard.svelte` - new wizard component
- `src/front/App.svelte` - wizard integration into main app
- `src/front/locales/en.json` - English translations
- `src/front/locales/ru.json` - Russian translations
- `providers-config.json` - AI provider configuration

### 🚀 How It Works

1. On first launch, App.svelte checks for existing settings
2. If no `provider` or no API keys - wizard is shown
3. Wizard loads provider configuration from external JSON
4. After selecting a provider, credentials input form is shown
5. After saving, wizard hides and main interface is shown

### 🌐 External Configuration

The wizard loads provider data from `PROVIDERS_CONFIG_URL` (line ~36 in `Wizard.svelte`).

**Quick Start Without External JSON:**

The wizard works out of the box with built-in `FALLBACK_PROVIDERS`. No setup required!

To use external JSON:
1. Host `providers-config.json` on GitHub/GitLab
2. Update `PROVIDERS_CONFIG_URL` in `Wizard.svelte`
3. Rebuild the extension

### 🎨 Design

- Modern minimalist UI
- Responsive layout
- Light and dark theme support
- Smooth animations and transitions
- Visual state indicators (loading, available, unavailable)

### 🔧 Providers

Supported:
- **OpenRouter** - requires API key (openrouter.ai)
- **OpenAI** - requires API key (platform.openai.com)
- **xAI (Grok)** - requires API key (console.x.ai)
- **Ollama** - requires local installation (localhost:11434)

### 📝 Localization

Full support for Russian and English:
- All texts translated
- Dynamic switching
- Contextual error messages

## Testing

1. Clear extension settings:
   ```javascript
   // In browser console on extension page
   chrome.storage.local.clear()
   ```

2. Reload extension

3. Open popup/sidebar - wizard should appear

## Known Issues

- SVG icons may not display correctly in dark theme (filter: invert added)

