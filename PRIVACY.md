# Privacy Policy for Browse Bot

**Last Updated:** October 22, 2025  
**Developer:** PROTOS GALAXIAS LIMITED

## Overview

Browse Bot is committed to protecting your privacy. This Privacy Policy explains what data we collect, how we use it, and your rights regarding your information.

**Key Principle:** All data is stored locally on your device. Browse Bot does not have backend servers and does not collect, transmit, or sell your personal data to third parties.

---

## Data Collection and Storage

### What Data We Collect

Browse Bot stores the following data **locally in your browser's IndexedDB**:

#### 1. Authentication Information
- **API Keys**: Your API keys for AI providers (OpenRouter, OpenAI, xAI)
- **Server URLs**: Base URLs for Ollama and xAI servers
- **Storage**: Encrypted in browser's secure storage
- **Purpose**: Authenticate with AI services when you issue commands

#### 2. Personal Communications
- **Chat History**: All messages exchanged between you and the AI assistant
- **Chat Metadata**: Chat titles, creation dates, last update timestamps
- **Storage**: Local IndexedDB, organized by chat ID
- **Purpose**: Maintain conversation context and allow you to review past interactions

#### 3. Web History
- **Tab URLs and Titles**: Information about web pages you interact with through Browse Bot
- **Active Tab Context**: Current page URL and title for providing relevant assistance
- **Storage**: Temporarily stored during chat sessions
- **Purpose**: Provide context-aware automation and display current page information

#### 4. User Activity
- **Automation Actions**: Record of actions performed by AI on your command (clicks, form fills, navigation)
- **Action History**: Log of completed tasks for review and analysis
- **Storage**: Local IndexedDB as part of chat history
- **Purpose**: Allow you to review what Browse Bot did and improve automation accuracy

#### 5. Website Content
- **Parsed Page Data**: Content extracted from web pages for AI analysis
- **Page Structure**: DOM elements and their properties used for automation
- **Storage**: Temporarily in chat context, not permanently stored separately
- **Purpose**: Enable AI to understand page content and execute your commands

#### 6. User Preferences and Configuration
- **AI Provider Settings**: Selected provider, active model for each provider, list of available models
- **Interface Settings**: Theme (light/dark/system), language (en/ru), input behavior options
- **Custom Prompts**: Global system prompt and domain-specific prompts you create
- **MCP Servers**: Model Context Protocol server configurations you add
- **Custom Tools**: JavaScript tools you create with their code and descriptions
- **Storage**: Local IndexedDB
- **Purpose**: Maintain your preferences and customizations across sessions

---

## Data We DO NOT Collect

Browse Bot **does NOT** collect, store, or transmit:

❌ Personally identifiable information (name, address, email, phone number, age)  
❌ Health information  
❌ Financial and payment information (credit cards, bank accounts, transactions)  
❌ Location data (GPS, IP address tracking)  
❌ Biometric data  
❌ Government-issued identification numbers

---

## How We Use Your Data

### Local Processing Only

All data processing happens **locally on your device**:

1. **AI Commands**: When you issue a command, Browse Bot sends your message and relevant context to your chosen AI provider's API
2. **Page Automation**: Content scripts interact with web pages based on AI instructions
3. **Data Storage**: All history, settings, and configurations remain in your browser's local storage

### Data Transmission

Browse Bot only transmits data in the following scenarios:

1. **To AI Provider APIs**: When you send a command, your message and necessary context (page content, chat history) are sent to the AI provider you configured (OpenRouter, OpenAI, xAI, or Ollama)
    - **Your Control**: You choose which provider to use
    - **Your API Keys**: You provide and control the API keys
    - **Provider Policies**: Data transmission is governed by your chosen provider's privacy policy

2. **MCP Servers**: If you configure MCP servers, Browse Bot may send requests to those endpoints per your configuration
    - **Your Control**: You specify which servers to connect to
    - **Optional Feature**: MCP servers are entirely optional

**Important**: Browse Bot itself does not operate any backend servers. We do not receive, store, or process your data on external servers.

---

## Data Security

### Local Storage Security

- **Encrypted Storage**: API keys are stored in Chrome's encrypted storage area
- **Browser Protection**: All data benefits from Chrome's built-in security mechanisms
- **No Cloud Sync**: Data is not synchronized to cloud services by Browse Bot
- **Sandboxed Execution**: Extension runs in Chrome's sandboxed environment

### Your Responsibility

- **API Key Security**: Keep your AI provider API keys confidential
- **Device Security**: Secure your device with password/biometric authentication
- **Browser Security**: Keep Chrome updated to latest version

---

## Data Retention and Deletion

### How Long We Keep Data

Data is stored locally **indefinitely** until you choose to delete it. Browse Bot does not automatically delete any data.

### How to Delete Your Data

You have full control to delete your data at any time:

#### Option 1: Clear Specific Data (Recommended)
1. Open Browse Bot side panel
2. Go to Settings
3. Use "Clear Chat History", "Reset Settings", or similar options

#### Option 2: Clear All Extension Data
1. Open Chrome Settings
2. Go to Extensions → Browse Bot
3. Click "Remove" to uninstall and delete all data

#### Option 3: Clear Browser Storage
1. Open Chrome DevTools (F12)
2. Go to Application → Storage → IndexedDB
3. Delete `web-walker-ext-storage` database

#### Option 4: Clear Individual Chats
1. Open Browse Bot
2. Select chat from history
3. Delete individual chat or messages

---

## Third-Party Services

Browse Bot integrates with third-party AI services. When you use Browse Bot, you are also subject to the privacy policies of:

- **OpenRouter** (if selected): [OpenRouter Privacy Policy](https://openrouter.ai/privacy)
- **OpenAI** (if selected): [OpenAI Privacy Policy](https://openai.com/privacy/)
- **xAI** (if selected): [xAI Privacy Policy](https://x.ai/privacy/)
- **Ollama** (if selected): Self-hosted, your own responsibility

**Important**: Browse Bot does not control how these services handle your data. Please review their respective privacy policies.

---

## Data Sharing and Sale

### We Do NOT:

❌ Sell or transfer user data to third parties  
❌ Use user data for advertising or marketing purposes  
❌ Share user data with data brokers  
❌ Use user data for purposes unrelated to Browse Bot's core automation functionality  
❌ Use user data to determine creditworthiness or for lending purposes

### We DO:

✅ Keep all data local on your device  
✅ Only transmit data when you explicitly issue commands requiring AI processing  
✅ Give you full control over your data and API keys

---

## Children's Privacy

Browse Bot is not directed at children under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe a child has provided data to Browse Bot, please contact us and we will assist with data removal.

---

## Changes to Privacy Policy

We may update this Privacy Policy from time to time. Changes will be posted in this document with an updated "Last Updated" date. For material changes, we will notify users through:

- Extension update notes
- GitHub repository announcements
- Chrome Web Store listing updates

Continued use of Browse Bot after policy changes constitutes acceptance of the updated policy.

---

## Your Rights

You have the right to:

✅ **Access**: View all data stored by Browse Bot (it's in your browser's local storage)  
✅ **Deletion**: Delete any or all data at any time  
✅ **Portability**: Export your chat history or settings (manually from IndexedDB)  
✅ **Control**: Choose which AI provider to use and control API keys  
✅ **Transparency**: Understand exactly what data is collected and how it's used

---

## Open Source Transparency

Browse Bot is open source under BSL 1.1 license. You can:

- Review the complete source code: [GitHub Repository](https://github.com/Protos-Galaxias/Browse-Bot)
- Verify data handling practices
- Audit security implementations
- Contribute improvements

---

## Contact Information

For privacy-related questions, concerns, or requests:

- **GitHub Issues**: [Report Privacy Concerns](https://github.com/Protos-Galaxias/Browse-Bot/issues)
- **Developer**: PROTOS GALAXIAS LIMITED
- **Repository**: https://github.com/Protos-Galaxias/Browse-Bot

---

## Compliance

Browse Bot complies with:

- Chrome Web Store Developer Program Policies
- General Data Protection Regulation (GDPR) principles (data minimization, user control, transparency)
- California Consumer Privacy Act (CCPA) principles

**Note**: Since all data is stored locally and Browse Bot has no backend servers, traditional data controller/processor relationships do not apply. You maintain full control and custody of your data.

---

## Summary

**In Plain Language:**

- 📦 Everything stays on your computer in your browser
- 🔒 Your API keys are encrypted and never leave your device except when you use them
- 💬 Your chats are saved locally so you can come back to them
- 🤖 When you give a command, we send it to the AI service YOU chose with YOUR API key
- 🗑️ You can delete everything anytime you want
- 🚫 We don't have servers, so we literally can't collect your data even if we wanted to
- 👀 Everything is open source - you can verify all of this yourself

---

**By using Browse Bot, you acknowledge that you have read and understood this Privacy Policy.**

---

*This Privacy Policy is effective as of October 22, 2025.*
