<script lang="ts">
    import { _ } from 'svelte-i18n';
</script>

<div class="capabilities-container">
    <h2>{$_('cap.title')}</h2>

    <div class="capability-section">
        <h3>🤖 {$_('cap.sections.automation.title')}</h3>
        <ul>
            <li>{$_('cap.sections.automation.items.search')}</li>
            <li>{$_('cap.sections.automation.items.addToCart')}</li>
            <li>{$_('cap.sections.automation.items.fillForms')}</li>
            <li>{$_('cap.sections.automation.items.navigate')}</li>
        </ul>
    </div>

    <div class="capability-section">
        <h3>💬 {$_('cap.sections.chat.title')}</h3>
        <ul>
            <li>{$_('cap.sections.chat.items.autoDetect')}</li>
            <li>{$_('cap.sections.chat.items.directQuestions')}</li>
            <li>{$_('cap.sections.chat.items.analysis')}</li>
            <li>{$_('cap.sections.chat.items.context')}</li>
        </ul>
    </div>

    <div class="capability-section">
        <h3>🔧 {$_('cap.sections.tools.title')}</h3>
        <ul>
            <li>{$_('cap.sections.tools.items.scan')}</li>
            <li>{$_('cap.sections.tools.items.findElements')}</li>
            <li>{$_('cap.sections.tools.items.clickElements')}</li>
            <li>{$_('cap.sections.tools.items.typeText')}</li>
            <li>{$_('cap.sections.tools.items.observeChanges')}</li>
        </ul>
    </div>

    <div class="capability-section">
        <h3>📊 {$_('cap.sections.analytics.title')}</h3>
        <ul>
            <li>{$_('cap.sections.analytics.items.history')}</li>
            <li>{$_('cap.sections.analytics.items.performance')}</li>
            <li>{$_('cap.sections.analytics.items.reports')}</li>
        </ul>
    </div>

    <div class="capability-section">
        <h3>⚙️ {$_('cap.sections.settings.title')}</h3>
        <ul>
            <li>{$_('cap.sections.settings.items.apiKeys')}</li>
            <li>{$_('cap.sections.settings.items.modelChoice')}</li>
            <li>{$_('cap.sections.settings.items.dataSecurity')}</li>
        </ul>
    </div>
</div>

<style>
    .capabilities-container {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: var(--bg-primary);
        padding: 1rem;
        overflow-y: auto;
        text-align: left;
    }

    h2 {
        color: var(--text-primary);
        margin: 0 0 1.5rem 0;
        font-size: 1.2rem;
        font-weight: 300;
        text-align: left;
    }

    .capability-section {
        margin-bottom: 1.5rem;
    }

    h3 {
        color: var(--accent-color);
        font-size: 1rem;
        margin: 0 0 0.5rem 0;
        font-weight: 500;
    }

    ul {
        margin: 0;
        padding-left: 0;
        color: var(--text-primary);
        font-size: 0.9rem;
        line-height: 1.4;
        list-style: none;
    }

    li {
        margin-bottom: 0.25rem;
        padding-left: 0;
    }
</style>
