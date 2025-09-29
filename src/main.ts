// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import { mount } from 'svelte';
import './app.css';
import App from './front/App.svelte';
import { initializeI18n } from './front/lib/i18n';

await initializeI18n();

const app = mount(App, {
    target: document.getElementById('app')!
});

export default app;
