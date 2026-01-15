# Browse Bot - AI-Powered Web Extension

A page-aware AI browser extension helps users navigate and interact with web pages. Built with Svelte, TypeScript, and Vite for both Chrome and Firefox, this tool supports AI agent-style workflows to save time, reduce errors during research, and improve user experience.

## Install

🔹 Chrome: https://chromewebstore.google.com/detail/browse-bot/hkcbjmdeheceggmlbhbiljejkkpjljjp
🔹 Firefox: https://addons.mozilla.org/en-US/firefox/addon/browse-bot/

## Features

- **AI-Powered Web Actions**: Perform complex web tasks using natural language
- **Smart Content Processing**: Summarize, clean, and aggregate web content
- **Multi-Step Planning**: Plan and execute multi-step on-page interactions
- **Cross-Browser Support**: Use both on Chrome (Manifest V3) and Firefox
- **Side Panel UI**: Enjoy a minimalist and modern side-bar interface

## Architecture

This extension uses a sophisticated AI-powered architecture:

- **OpenRouter AI Service**: Integration with multiple AI models
- **Tool-Based Operations**: Structured AI interactions including:
  - `plannerTool`: Plans multi-step web actions
  - `performWebAction`: Executes actions on web pages
  - `summarizationTool`: Summarizes text content
  - `aggregationAndCleaningTool`: Processes and cleans data
- **Service Layer**: Singleton services for AI, configuration, messaging, and state
- **Content Scripts**: Injected scripts for web page interaction

## Tech Stack

- **Frontend**: Svelte 5 + TypeScript
- **Build Tool**: Vite with separate Chrome/Firefox configurations
- **AI Integration**: OpenRouter API with multiple model support
- **Browser APIs**: Manifest V3, Side Panel, Content Scripts

## Development

### Prerequisites

- Node.js (latest LTS version)
- npm or yarn
- Chrome/Firefox browser for testing

### Installation

```bash
npm install
```

### Development Commands

Start development server for Chrome:
```bash
npm run dev:chrome
```

Start development server for Firefox:
```bash
npm run dev:firefox
```

### Building

Build for Chrome:
```bash
npm run build:chrome
```

Build for Firefox:
```bash
npm run build:firefox
```

### Code Quality

Lint code:
```bash
npm run lint
```

Auto-fix linting issues:
```bash
npm run lint:fix
```

## Installation

### Chrome
1. Build the extension: `npm run build:chrome`
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist` folder

### Firefox
1. Build the extension: `npm run build:firefox`
2. Open Firefox and go to `about:debugging`
3. Click "This Firefox"
4. Click "Load Temporary Add-on"
5. Select the `manifest.json` file from the `dist` folder

## Configuration

The extension requires an OpenRouter API key for AI functionality:

1. Get an API key from [OpenRouter](https://openrouter.ai)
2. Open the extension settings
3. Enter your API key
4. Configure your preferred AI model

## Threat model

Browse Bot is designed to be transparent, predictable, and limited by default.

**What it can access**
- The content and structure of the current webpage, only when you trigger an action
- Local files (PDFs, images, screenshots) only when you explicitly select them

**What it does not access**
- Browsing history, cookies, passwords, or authentication data
- Pages you are not actively viewing
- Any data in the background or without user interaction

If you don’t actively use Browse Bot, it does nothing.

**Data handling**
- Browse Bot does not send webpage content to the cloud
- No browsing data is collected, stored, or tracked
- All behavior stays within the clearly defined scope of the extension

**What it protects against**
- Accidental data sharing with third-party AI services
- Hidden background activity
- Undocumented or unclear data flows

**What it does not protect against**
- Malicious websites or compromised pages
- Browser-level vulnerabilities
- Other extensions with excessive permissions

**Transparency**
- Browse Bot is open-source (for personal use) and fully inspectable
- No obfuscated code or hidden network requests
- All permissions are documented and intentional

If something is unclear, it should be visible in the code.

## Project Structure

```
├── src/
│   ├── components/          # Svelte UI components
│   ├── services/           # Core services (AI, Config, State)
│   ├── content/            # Content scripts
│   ├── background/         # Background scripts
│   └── manifest/           # Extension manifests
├── vite.config.chrome.ts   # Chrome build configuration
├── vite.config.firefox.ts  # Firefox build configuration
└── CLAUDE.md              # AI assistant instructions
```

## License

This project is licensed under BSL 1.1  
Commercial use restrictions apply until 2030-09-29
