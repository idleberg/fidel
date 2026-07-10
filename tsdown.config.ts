import { defineConfig } from 'tsdown';

export default defineConfig((options) => {
	const isProduction = options.watch !== true;

	return {
		target: 'node24',
		banner: { js: '#!/usr/bin/env node' },
		clean: isProduction,
		dts: isProduction,
		entry: ['src/cli.ts'],
		format: 'esm',
		minify: isProduction,
		outDir: 'bin',
	};
});
