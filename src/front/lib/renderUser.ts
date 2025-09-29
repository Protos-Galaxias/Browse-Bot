// Copyright (c) 2025 PROTOS GALAXIAS LIMITED
// SPDX-License-Identifier: BSL-1.1

import DOMPurify from 'dompurify';

export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

export function renderUserMessage(input: string): string {
    const trimmed = (input || '').replace(/\s+$/g, '');
    const lines = trimmed.split('\n');
    while (lines.length > 0 && /^\s*$/.test(lines[lines.length - 1] || '')) {
        lines.pop();
    }
    const parts: string[] = [];
    const tokenRe = /@tab:([^@\n]+)/g;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let lastIndex = 0;
        tokenRe.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = tokenRe.exec(line)) !== null) {
            const start = m.index;
            const end = tokenRe.lastIndex;
            const before = line.slice(lastIndex, start);
            if (before) parts.push(escapeHtml(before));
            const title = (m[1] || '').trim();
            const safeTitle = escapeHtml(title);
            parts.push(`<span class="mention-chip"><span class="chip-label">@tab:${safeTitle}</span></span>`);
            lastIndex = end;
        }
        const tail = line.slice(lastIndex);
        if (tail) parts.push(escapeHtml(tail));
        if (i < lines.length - 1) parts.push('<br>');
    }
    return DOMPurify.sanitize(parts.join(''), { USE_PROFILES: { html: true } });
}
