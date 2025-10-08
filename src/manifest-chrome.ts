// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from '../package.json';

export default defineManifest({
    manifest_version: 3,
    name: 'Browse Bot (Chrome)',
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
