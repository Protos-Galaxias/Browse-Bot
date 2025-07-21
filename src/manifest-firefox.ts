import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from '../package.json';

export default defineManifest({
    manifest_version: 3,
    name: 'Web Walker (Firefox)',
    version: packageJson.version,
    permissions: ['storage', 'activeTab', 'scripting', 'notifications', 'tabs', '<all_urls>'],
    background: {
        scripts: ['src/service_worker.ts']
    },
    web_accessible_resources: [
        {
            'resources': ['src/content.ts', 'src/content_script_parser.ts'],
            'matches': ['<all_urls>']
        }
    ],
    host_permissions: [
        '<all_urls>'
    ],
    content_scripts: [
        {
            matches: ['<all_urls>'],
            js: ['src/content.ts']
        }
    ],
    ...({
        sidebar_action: {
            default_panel: 'index.html',
            default_title: 'Web Walker'
        },
        browser_specific_settings: {
            gecko: {
                id: `web-walker@${new Date().getTime()}.org`
            }
        }
    } as any),
    action: {
        default_title: 'Открыть Web Walker'
    },
    omnibox: {
        keyword: '@ai'
    }
});
