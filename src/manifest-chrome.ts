// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from '../package.json';

export default defineManifest({
    manifest_version: 3,
    name: 'Browse Bot',
    version: packageJson.version,
    permissions: ['storage', 'activeTab', 'scripting', 'notifications', 'webNavigation', 'tabs', 'sidePanel'],
    host_permissions: ['<all_urls>'],
    // web_accessible_resources: [
    //     {
    //         resources: ['src/content.ts'],
    //         matches: ['<all_urls>']
    //     }
    // ],
    background: {
        service_worker: 'src/service_worker.ts',
        type: 'module'
    },
    side_panel: {
        default_path: 'index.html'
    },
    action: {
        default_title: 'Open Browse Bot'
    },
    icons: {
        '16': 'logos/16x16.png',
        '32': 'logos/32x32.png',
        '48': 'logos/48x48.png',
        '96': 'logos/96x96.png',
        '128': 'logos/128x128.png'
    },
    omnibox: {
        keyword: '@ai'
    },
    content_scripts: [
        {
            matches: ['<all_urls>'],
            js: ['src/content.ts']
        }
    ]
});
