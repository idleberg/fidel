import { defineConfig } from 'oxlint';

export default defineConfig({
	plugins: ['import', 'typescript', 'unicorn'],
	env: {
		es2024: true,
	},
	categories: {
		correctness: 'error',
		suspicious: 'warn',
		pedantic: 'warn',
	},
	rules: {
		eqeqeq: 'warn',
		'import/no-cycle': 'error',
		'import/max-dependencies': 'off',
		'max-lines-per-function': 'off',
		'no-underscore-dangle': ['warn', { allow: ['_startDate', '_lastContent', '_created', '_updated'] }],
	},
	ignorePatterns: ['node_modules/'],
});
