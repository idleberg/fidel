import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import kleur from 'kleur';
import logSymbols from 'log-symbols';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { BrowserContext } from 'playwright';

import type { ScrapeContext } from './types.ts';
import { link } from './utils.ts';

chromium.use(StealthPlugin());

export async function createContext(
	headless: boolean,
): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
	const browser = await chromium.launch({ headless });
	const context = await browser.newContext({
		userAgent:
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
			'AppleWebKit/537.36 (KHTML, like Gecko) ' +
			'Chrome/149.0.0.0 Safari/537.36',
		viewport: { width: 1440, height: 900 },
		locale: 'en-US',
		timezoneId: 'UTC',
	});
	return { context, close: () => browser.close() };
}

function urlToCachePath(url: string, cacheDir: string): string {
	const u = new URL(url);
	const hash = createHash('sha256')
		.update(u.hostname + u.pathname)
		.digest('hex');
	return join(cacheDir, `${hash}.html`);
}

export async function navigateWithRetry(
	ctx: ScrapeContext,
	url: string,
	{ skipCache = false }: { skipCache?: boolean } = {},
): Promise<void> {
	const { page, config, dirs } = ctx;
	const retries = config.retries;
	const timeout = config.timeout;
	const cachePath = urlToCachePath(url, dirs.cache);

	if (!skipCache && config.useCache && existsSync(cachePath)) {
		console.log(`  ← ${kleur.yellow('cache')} ${link(url)}`);
		const html = await readFile(cachePath, 'utf-8');
		await page.route(url, (route) => route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }));
		await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
		await page.unroute(url);
		return;
	}

	for (let i = 0; i < retries; i++) {
		let response;
		try {
			response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
		} catch (err) {
			const backoff = Math.min(5_000 * Math.pow(2, i), 120_000);
			console.log(
				`  ${logSymbols.warning} Navigation failed: ${(err as Error).message.split('\n')[0]} (attempt ${i + 1}/${retries}, next retry in ${backoff / 1000}s)`,
			);
			if (i < retries - 1) {
				await page.waitForTimeout(backoff);
				continue;
			}
			throw err;
		}
		console.log(`  ← ${response?.status() ?? 'no response'} ${link(url)}`);

		await page.waitForTimeout(3_000);

		const html = (await page.content()).toLowerCase();
		const isChallenge = ['just a moment', 'cf-chl', 'challenge-platform'].some((m) => html.includes(m));

		if (!isChallenge) {
			await mkdir(dirname(cachePath), { recursive: true });
			await writeFile(cachePath, await page.content(), 'utf-8');
			return;
		}

		console.log(`  ${logSymbols.warning} Cloudflare challenge detected, waiting 10s (attempt ${i + 1}/${retries})…`);
		await page.waitForTimeout(10_000);
	}
	console.log(`  ${logSymbols.error} Could not bypass Cloudflare for ${link(url)}, continuing anyway`);
}
