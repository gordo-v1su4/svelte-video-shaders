// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';

import prettier from 'eslint-config-prettier';
import vitest from 'eslint-plugin-vitest';
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
			globals: { ...globals.browser, ...globals.node, ...globals.vitest }
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

	// Vitest/Tests
	{
		files: ['**/*.test.{js,ts}', '**/*.spec.{js,ts}'],
		plugins: { vitest },
		rules: {
			'vitest/consistent-test-it': ['error', { fn: 'it' }],
			'vitest/expect-expect': 'warn',
			'vitest/no-alias-methods': 'error',
			'vitest/no-disabled-tests': 'warn',
			'vitest/no-focused-tests': 'error',
			'vitest/no-identical-title': 'error',
			'vitest/no-interpolation-in-snapshots': 'error',
			'vitest/no-large-snapshots': 'warn',
			'vitest/no-mocks-import': 'error',
			'vitest/no-standalone-expect': 'error',
			'vitest/prefer-called-with': 'warn',
			'vitest/prefer-expect-assertions': 'off',
			'vitest/prefer-hooks-in-order': 'warn',
			'vitest/prefer-hooks-on-top': 'warn',
			'vitest/prefer-lowercase-title': 'warn',
			'vitest/prefer-spy-on': 'warn',
			'vitest/prefer-strict-equal': 'warn',
			'vitest/prefer-to-be': 'warn',
			'vitest/prefer-to-contain': 'warn',
			'vitest/prefer-to-have-length': 'warn',
			'vitest/prefer-todo': 'warn',
			'vitest/require-to-throw-message': 'warn',
			'vitest/valid-expect': 'error',
			'vitest/valid-title': 'error'
		}
	},

	// Storybook
	...storybook.configs['flat/recommended'],

	// Formatting (last - must be after all other configs)
	prettier
];
