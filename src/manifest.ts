import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from '../package.json';

const { version } = packageJson;

const browser = process.env.BROWSER || 'chrome';

const commonManifest = {
    name: 'Web Walker',
    description: 'AI-агент для вашего браузера.',
    version: version,
    permissions: [
        'storage',
        'activeTab',
        'scripting',
        'notifications',
        'tabs'
    ],
    web_accessible_resources: [
        {
            resources: ['content_script_parser.js'],
            matches: ['<all_urls>']
        }
    ],
    omnibox: {
        keyword: '@ai'
    },
    action: {
        default_title: 'Открыть Web Walker'
    }
};

const getManifest = () => {
    if (browser === 'firefox') {
    // Firefox specific manifest properties are handled in manifest-firefox.ts
        return defineManifest({
            manifest_version: 3,
            ...commonManifest,
            background: {
                scripts: ['src/service_worker.ts']
            }
            // browser_specific_settings: {
            //   gecko: {
            //     id: "web-walker@example.com",
            //   },
            // },
            // sidebar_action: {
            //   default_panel: "index.html",
            //   default_title: "Web Walker",
            // },
            // browser_specific_settings and sidebar_action are handled in manifest-firefox.ts
        });
    }

    return defineManifest({
        manifest_version: 3,
        ...commonManifest,
        background: {
            service_worker: 'src/service_worker.ts',
            type: 'module'
        },
        side_panel: {
            default_path: 'index.html'
        }
    });
};

export default getManifest();
