import { defineConfig } from 'tsdown';

export default defineConfig((options) => {
	const isProduction = options.watch !== true;

	return {
		target: 'node24',
		clean: isProduction,
		dts: isProduction,
		entry: ['src/cli.ts'],
		format: 'esm',
		minify: isProduction,
		outDir: 'bin',
	};
});
