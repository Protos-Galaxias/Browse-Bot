import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
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
                ...globals.node
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
            'eol-last': ['error', 'always'],
            '@typescript-eslint/no-explicit-any': 'off'
        }
    },
    {
        ignores: ['node_modules/']
    }
];

