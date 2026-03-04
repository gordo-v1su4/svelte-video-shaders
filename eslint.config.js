import prettier from 'eslint-config-prettier';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

/** @type {import('eslint').Linter.Config[]} */
export default [
	// Ignores
	includeIgnoreFile(gitignorePath),

	// Base
	js.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},

	// Svelte 5
	...svelte.configs.recommended,
	...svelte.configs.prettier,
	{
		files: ['**/*.svelte', '**/*.svelte.js', '**/*.svelte.ts'],
		languageOptions: { parserOptions: { svelteConfig } },
		rules: {
			// Svelte 5: Additional rules can be added here as needed
			// Note: 'svelte/no-deprecated-script-tag' is not a valid rule in eslint-plugin-svelte
		}
	},

	// TailwindCSS: Plugin installed but flat config support pending
	// TODO: Add when eslint-plugin-tailwindcss fully supports flat config

	// Formatting (last - must be after all other configs)
	prettier
];
