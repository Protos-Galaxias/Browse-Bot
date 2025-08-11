import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from '../package.json';

export default defineManifest({
    manifest_version: 3,
    name: 'Web Walker (Chrome)',
    version: packageJson.version,
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAk1',
    permissions: ['storage', 'activeTab', 'scripting', 'notifications', 'webNavigation', 'tabs', 'sidePanel'],
    background: {
        service_worker: 'src/service_worker.ts',
        type: 'module'
    },
    side_panel: {
        default_path: 'index.html'
    },
    action: {
        default_title: 'Открыть Web Walker'
    },
    omnibox: {
        keyword: '@ai'
    },
    web_accessible_resources: [
        {
            resources: ['content_script_parser.js'],
            matches: ['<all_urls>']
        }
    ]
});
