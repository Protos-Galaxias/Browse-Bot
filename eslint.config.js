import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['**/*.ts', '**/*.js'],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module'
            },
            globals: {
                ...globals.browser,
                ...globals.webextensions,
                chrome: 'readonly',
                browser: 'readonly'
            }
        },
        plugins: {
            '@typescript-eslint': typescript
        },
        rules: {
            ...typescript.configs.recommended.rules,
            'indent': ['error', 4],
            'no-tabs': 'error',
            'semi': ['error', 'always'],
            'quotes': ['error', 'single', { 'avoidEscape': true }],
            'comma-dangle': ['error', 'never'],
            'no-trailing-spaces': 'error',
            'eol-last': ['error', 'always']
        }
    },
    {
        files: ['**/*.svelte'],
        languageOptions: {
            parser: svelteParser,
            parserOptions: {
                parser: typescriptParser,
                ecmaVersion: 'latest',
                sourceType: 'module'
            },
            globals: {
                ...globals.browser,
                ...globals.webextensions,
                chrome: 'readonly',
                browser: 'readonly'
            }
        },
        plugins: {
            svelte
        },
        rules: {
            ...svelte.configs.recommended.rules,
            'indent': ['error', 4],
            'svelte/indent': ['error', {
                indent: 4,
                indentScript: true
            }],
            'no-tabs': 'error',
            'semi': ['error', 'always'],
            'quotes': ['error', 'single', { 'avoidEscape': true }],
            'comma-dangle': ['error', 'never'],
            'no-trailing-spaces': 'error',
            'eol-last': ['error', 'always']
        }
    },
    {
        ignores: [
            'dist/',
            'dist-firefox/',
            'node_modules/',
            '*.config.js',
            '*.config.ts',
            'vite.config.*.ts'
        ]
    }
];