import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import logSymbols from 'log-symbols';
import type { Page } from 'playwright';

import { navigateWithRetry } from '../lib/browser.ts';
import { selectors } from '../lib/selectors.ts';
import { SCHEMA_BASE_URL } from '../lib/schemas.ts';
import type { ScrapeContext, ForumData, ThreadRef } from '../lib/types.ts';
import { jsonStringify, link, pl, runInBatches, parseForumDate, epochToISO } from '../lib/utils.ts';

const sel = selectors.forum;
const common = selectors.common;

const extractSelectors = {
	threadTitle: sel.threadTitle,
	threadAuthor: sel.threadAuthor,
	threadDate: sel.threadDate,
	postsCount: sel.postsCount,
	viewsCount: sel.viewsCount,
	closedIcon: sel.closedIcon,
};

export async function discoverForums(ctx: ScrapeContext): Promise<string[]> {
	const { page, config } = ctx;
	console.log(`\n→ Discovering sub-forums: ${link(config.forumUrl)}`);
	await navigateWithRetry(ctx, config.forumUrl);

	const subForumUrls = await page.$$eval(sel.subForumLinks, (els) => els.map((a) => (a as HTMLAnchorElement).href));

	console.log(`  Found ${pl(subForumUrls.length, 'sub-forum')}`);
	return [config.forumUrl, ...subForumUrls];
}

function extractThreads(page: Page): Promise<ThreadRaw[]> {
	return page.$$eval(
		sel.threadRow,
		(rows, s) =>
			rows.map((row) => {
				const titleEl = row.querySelector<HTMLAnchorElement>(s.threadTitle);
				const startedByEl = row.querySelector<HTMLAnchorElement>(s.threadAuthor);
				const dateEl = row.querySelector<HTMLSpanElement>(s.threadDate);
				const postsEl = row.querySelector<HTMLDivElement>(s.postsCount);
				const viewsEl = row.querySelector<HTMLDivElement>(s.viewsCount);

				const postsText = postsEl?.textContent?.trim() ?? '0';
				const viewsText = viewsEl?.textContent?.trim() ?? '0';

				const classes = row.className ?? '';
				const sticky = classes.includes('sticky') || row.dataset.sticky === '1';
				const closed = classes.includes('closed') || classes.includes('locked') || !!row.querySelector(s.closedIcon);

				return {
					url: titleEl?.href ?? '',
					title: titleEl?.textContent?.trim() ?? '',
					startedBy: startedByEl?.textContent?.trim() ?? 'Guest',
					_startDate: dateEl?.textContent?.trim() ?? '',
					_lastContent: Math.trunc(Number(row.dataset.lastcontent ?? '0')),
					nodeId: Math.trunc(Number(row.dataset.nodeId ?? '')) || 0,
					responses: Math.trunc(Number(postsText.replaceAll(/[^\d]/gu, ''))) || 0,
					views: Math.trunc(Number(viewsText.replaceAll(/[^\d]/gu, ''))) || 0,
					sticky,
					closed,
				};
			}),
		extractSelectors,
	);
}

type ThreadRaw = {
	url: string;
	title: string;
	startedBy: string;
	_startDate: string;
	_lastContent: number;
	nodeId: number;
	responses: number;
	views: number;
	sticky: boolean;
	closed: boolean;
};

function toThreadRefs(threads: ThreadRaw[], forumPage: number): ThreadRef[] {
	return threads.map((t) => ({
		url: t.url,
		title: t.title,
		startedBy: t.startedBy,
		createdDate: parseForumDate(t._startDate),
		modifiedDate: epochToISO(t._lastContent),
		nodeId: t.nodeId,
		responses: t.responses,
		views: t.views,
		sticky: t.sticky,
		closed: t.closed,
		forumPage,
	}));
}

export async function scrapeForum(ctx: ScrapeContext, forumUrl: string, isRoot = false): Promise<ForumData> {
	const { page, config, dirs } = ctx;

	console.log(`\n→ Scraping forum: ${link(forumUrl)}`);
	await navigateWithRetry(ctx, forumUrl);

	const forumName = await page.$eval(common.heading, (el) => el.textContent?.trim() ?? '').catch(() => '');

	const channelId = await page.evaluate((threadRowSel) => {
		const firstThread = document.querySelector<HTMLElement>(threadRowSel);
		return Math.trunc(Number(firstThread?.dataset.channelId ?? '')) || 0;
	}, sel.threadRow);

	const outPath = join(dirs.forums, `${channelId || forumUrl.replaceAll(/[^a-z0-9]/giu, '_')}.json`);

	if (existsSync(outPath)) {
		console.log(`  ${logSymbols.info} Forum already scraped: ${channelId}`);
		return JSON.parse(await readFile(outPath, 'utf-8'));
	}

	console.log(`  Forum: ${forumName} (channel=${channelId})`);

	const maxPageFromPagination = await page
		.$eval(common.lastPageButton, (el) => Math.trunc(Number(el.dataset.page ?? '')) || 0)
		.catch(() => 0);

	let startPage: number;
	let endPage: number;

	if (config.reverse) {
		startPage = config.startPage > 1 ? config.startPage : maxPageFromPagination || 1;
		endPage = Math.max(1, startPage - config.maxPagesPerForum + 1);
	} else {
		startPage = config.startPage;
		endPage = Math.min(startPage + config.maxPagesPerForum - 1, maxPageFromPagination || Infinity);
	}

	if (startPage !== 1) {
		const pageUrl = `${forumUrl}/page${startPage}`;
		console.log(`  → Jumping to page ${startPage}`);
		await navigateWithRetry(ctx, pageUrl);
	}

	const firstPageThreads = await extractThreads(page);
	const allThreads: ThreadRef[] = toThreadRefs(firstPageThreads, startPage);
	console.log(`    Found ${pl(firstPageThreads.length, 'thread')} on page ${startPage}`);

	const remainingPageNums: number[] = [];
	if (config.reverse) {
		for (let p = startPage - 1; p >= endPage; p--) remainingPageNums.push(p);
	} else {
		for (let p = startPage + 1; p <= endPage; p++) remainingPageNums.push(p);
	}

	if (remainingPageNums.length > 0) {
		const concurrency = config.concurrency;

		const pageResults = await runInBatches(
			remainingPageNums,
			concurrency,
			config.delayMs,
			async (pageNum, workerIndex) => {
				let workerPage: Page;
				let workerCtx: ScrapeContext;
				let needsClose = false;

				if (concurrency > 1 && workerIndex > 0) {
					workerPage = await page.context().newPage();
					workerCtx = { ...ctx, page: workerPage };
					needsClose = true;
				} else {
					workerPage = page;
					workerCtx = ctx;
				}

				try {
					const pageUrl = `${forumUrl}/page${pageNum}`;
					console.log(`  → Page ${pageNum}`);
					await navigateWithRetry(workerCtx, pageUrl);
					const threads = await extractThreads(workerPage);
					console.log(`    Found ${pl(threads.length, 'thread')} on page ${pageNum}`);
					return toThreadRefs(threads, pageNum);
				} finally {
					if (needsClose) await workerPage.close();
				}
			},
		);

		for (const refs of pageResults) {
			allThreads.push(...refs);
		}
	}

	const totalPages = maxPageFromPagination || startPage;

	const seen = new Set<string>();
	const data: ForumData = {
		$schema: `${SCHEMA_BASE_URL}/forum-data.schema.json`,
		url: forumUrl,
		name: forumName,
		channelId,
		...(isRoot && { isRoot: true }),
		totalPages,
		threads: allThreads.filter((t) => {
			if (seen.has(t.url)) return false;
			seen.add(t.url);
			return true;
		}),
	};

	await writeFile(outPath, jsonStringify(data, ctx.config.minify), 'utf-8');
	console.log(`  ${logSymbols.success} Saved ${pl(allThreads.length, 'thread')} → ${outPath}`);
	return data;
}
