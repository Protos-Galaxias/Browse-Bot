// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from '../package.json';

export default defineManifest({
    manifest_version: 3,
    name: 'Browse Bot',
    version: packageJson.version,
    content_security_policy: {
        extension_pages: "script-src 'self' 'unsafe-eval'; object-src 'self'"
    } as any,
    permissions: ['storage', 'activeTab', 'scripting', 'notifications', 'webNavigation', 'tabs', '<all_urls>'],
    background: {
        scripts: ['src/service_worker.ts']
    },
    // web_accessible_resources: [
    //     {
    //         'resources': ['src/content.ts'],
    //         'matches': ['<all_urls>']
    //     }
    // ],
    host_permissions: [
        '<all_urls>',
        'http://localhost/*',
        'http://127.0.0.1/*'
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
            default_title: 'Browse Bot',
            default_icon: {
                '16': 'logos/16x16.png',
                '32': 'logos/32x32.png',
                '48': 'logos/48x48.png',
                '96': 'logos/96x96.png',
                '128': 'logos/128x128.png'
            }
        },
        browser_specific_settings: {
            gecko: {
                id: 'browse-bot@protosgalaxias.com'
            }
        }
    } as any),
    action: {
        default_icon: {
            '16': 'logos/16x16.png',
            '32': 'logos/32x32.png',
            '48': 'logos/48x48.png',
            '96': 'logos/96x96.png',
            '128': 'logos/128x128.png'
        },
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
    }
});
