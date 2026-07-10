import { join, resolve } from 'node:path';

import { Command, InvalidArgumentError } from 'commander';
import * as v from 'valibot';

import { scrape } from './scraper.ts';
import type { Config } from './lib/types.ts';

const DEFAULT_OUT = join(process.cwd(), 'data');

const program = new Command()
	.name('fidel')
	.description('Scrape the Winamp AVS forums')
	.argument('<url>', 'root forum URL', (value: string) => {
		const result = v.safeParse(v.pipe(v.string(), v.url()), value);
		if (!result.success) {
			throw new InvalidArgumentError('must be a valid URL');
		}
		return result.output;
	})

	.optionsGroup('Output Options')
	.option('-o, --outdir <dir>', 'output directory', DEFAULT_OUT)
	.option('--download-attachments', 'download post attachments', false)
	.option('--no-attachments', 'ignore attachments entirely')
	.option('--no-minify', 'disable JSON minification')

	.optionsGroup('Scraper Options')
	.option('--start-page <n>', 'page number to start from', '1')
	.option('--max-pages <n>', 'max pages per forum', 'Infinity')
	.option('--max-threads <n>', 'max threads to scrape', 'Infinity')
	.option('--max-members <n>', 'max members to scrape', 'Infinity')
	.option('--reverse', 'scrape forum pages in reverse order (last page first)', false)

	.optionsGroup('Network Options')
	.option('--no-cache', 'bypass HTML cache and always fetch live')
	.option('--timeout <ms>', 'navigation timeout in ms', '60000')
	.option('--delay <ms>', 'delay between requests in ms', '1500')
	.option('--retries <n>', 'retry attempts for failed navigations', '20')

	.optionsGroup('Browser Options')
	.option('--headless', 'run browser in headless mode', false)
	.option('--concurrency <n>', 'number of parallel browser pages', '1');

program.parse();
const [url] = program.args;
const opts = program.opts();

const config: Config = {
	forumUrl: url,
	outDir: resolve(opts.outdir),
	headless: opts.headless,
	startPage: Math.trunc(Number(opts.startPage)),
	delayMs: Math.trunc(Number(opts.delay)),
	maxPagesPerForum: Number(opts.maxPages),
	maxThreads: Number(opts.maxThreads),
	maxMembers: Number(opts.maxMembers),
	downloadAttachments: opts.downloadAttachments,
	attachments: opts.attachments,
	useCache: opts.cache,
	timeout: Math.trunc(Number(opts.timeout)),
	retries: Math.trunc(Number(opts.retries)),
	minify: opts.minify,
	reverse: opts.reverse,
	concurrency: Math.trunc(Number(opts.concurrency)),
};

try {
	await scrape(config);
} catch (err) {
	console.error(err);
	process.exit(1);
}

// forum-index-download-extract-liberate!
