import { defineConfig } from 'oxfmt';

export default defineConfig({
	useTabs: true,
	singleQuote: true,
	trailingComma: 'all',
	semi: true,
	printWidth: 120,
	arrowParens: 'always',
	bracketSpacing: true,
	endOfLine: 'lf',
	ignorePatterns: ['node_modules/'],
});
