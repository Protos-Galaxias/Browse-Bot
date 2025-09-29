// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from '../package.json';

const { version } = packageJson;

// eslint-disable-next-line no-undef
const browser = process.env.BROWSER || 'chrome';

const commonManifest = {
    name: 'Browse Bot',
    description: 'AI-agent for your browser.',
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
        default_title: 'Open Browse Bot'
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
            //   default_title: "Browse Bot",
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
