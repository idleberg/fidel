import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import logSymbols from 'log-symbols';
import type { Page } from 'playwright';

import { navigateWithRetry } from '../lib/browser.ts';
import { fixMojibakeDeep } from '../lib/mojibake.ts';
import { sanitizeHtml, type ExtractedAttachment } from '../lib/sanitize.ts';
import { selectors } from '../lib/selectors.ts';
import { SCHEMA_BASE_URL } from '../lib/schemas.ts';
import type { ScrapeContext, ThreadData, Post } from '../lib/types.ts';
import { jsonStringify, link, pl, runInBatches, parseForumDate } from '../lib/utils.ts';

const common = selectors.common;
const sel = selectors.thread;

const extractSelectors = {
	person: sel.person,
	authorUrl: sel.authorUrl,
	memberLink: sel.memberLink,
	timestampDate: sel.timestampDate,
	postcreatedDate: sel.postcreatedDate,
	time: sel.time,
	postTitle: sel.postTitle,
	postTitleAlt: sel.postTitleAlt,
	postContent: sel.postContent,
	postContentAlt: sel.postContentAlt,
	attachments: sel.attachments,
	authorName: sel.authorName,
	editInfo: sel.editInfo,
};

function extractPosts(page: Page) {
	return page.$$eval(
		sel.post,
		(postEls, s) =>
			postEls.map((post) => {
				const id = Math.trunc(Number(post.dataset.nodeId ?? post.id ?? '')) || 0;
				const personEl = post.querySelector<HTMLElement>(s.person);
				const authorEl =
					personEl?.querySelector<HTMLAnchorElement>(s.authorUrl) ??
					post.querySelector<HTMLAnchorElement>(s.memberLink);
				const dateEl =
					post.querySelector<HTMLSpanElement>(s.timestampDate) ??
					post.querySelector<HTMLSpanElement>(s.postcreatedDate) ??
					post.querySelector<HTMLSpanElement>(s.time);
				const titleEl =
					post.querySelector<HTMLHeadingElement>(s.postTitle) ?? post.querySelector<HTMLHeadingElement>(s.postTitleAlt);
				const bodyEl =
					post.querySelector<HTMLDivElement>(s.postContent) ?? post.querySelector<HTMLDivElement>(s.postContentAlt);
				const attachEls = post.querySelectorAll<HTMLAnchorElement>(s.attachments);

				return {
					id,
					title: titleEl?.textContent?.trim() ?? '',
					body: bodyEl?.innerHTML?.trim() ?? '',
					author:
						personEl?.querySelector(s.authorName)?.textContent?.trim() ?? authorEl?.textContent?.trim() ?? 'Guest',
					authorId:
						Math.trunc(Number(authorEl?.dataset.vbnamecard ?? '')) ||
						Math.trunc(Number(authorEl?.href?.match(/\/member\/(\d+)/u)?.[1] ?? '')) ||
						0,
					_created: dateEl?.textContent?.trim() ?? '',
					_updated:
						post
							.querySelector(s.editInfo)
							?.textContent?.match(/;\s*(.+)\./u)?.[1]
							?.trim() ?? '',
					attachments: Array.from(attachEls).map((a) => {
						const spans = a.querySelectorAll('span');
						const nameSpan = spans[1];
						const metaSpan = spans[2];
						const meta = metaSpan?.textContent?.match(/\(([^,]+),\s*(\d[\d,]*)\s*views?\)/u);
						return {
							id: Math.trunc(Number(a.href?.match(/[?&]id=(\d+)/u)?.[1] ?? '')) || 0,
							name: nameSpan?.textContent?.trim() ?? '',
							size: meta?.[1]?.trim() ?? '',
							views: Math.trunc(Number(meta?.[2]?.replaceAll(',', '') ?? '')) || 0,
						};
					}),
				};
			}),
		extractSelectors,
	);
}

type RawPost = Awaited<ReturnType<typeof extractPosts>>[number];

// The "Attached Files" block can live either beside the post body or inside it, in which
// case both the DOM query and the body sanitizer pick it up. Merge those into one entry.
function dedupeAttachments(attachments: ExtractedAttachment[]): ExtractedAttachment[] {
	const byKey = new Map<string, ExtractedAttachment>();

	for (const att of attachments) {
		const key = att.id ? `id:${att.id}` : `name:${att.name.toLowerCase()}`;
		const existing = byKey.get(key);

		byKey.set(
			key,
			existing
				? {
						id: existing.id || att.id,
						name: existing.name || att.name,
						size: existing.size === '' ? att.size : existing.size,
						views: Math.max(existing.views, att.views),
					}
				: att,
		);
	}

	return [...byKey.values()];
}

function processPosts(rawPosts: RawPost[], ctx: ScrapeContext, page: Page): Promise<Post[]> {
	const ignoreAttachments = !ctx.config.attachments;

	return Promise.all(
		rawPosts.map(async ({ _created, _updated, body, attachments, ...rest }) => {
			const sanitized = await sanitizeHtml(body);

			if (ignoreAttachments) {
				return {
					...rest,
					body: ctx.urlRewriter.rewriteHtml(sanitized.body),
					created: parseForumDate(_created),
					updated: parseForumDate(_updated),
					attachments: [],
				};
			}

			const allAttachments = dedupeAttachments([...attachments, ...sanitized.attachments]);

			const attachmentUrls = new Map<number, string>();
			for (const att of allAttachments) {
				if (!att.id) continue;
				if (ctx.config.downloadAttachments) {
					const hash = await ctx.attachmentStore.download(page, att.id);
					if (hash) attachmentUrls.set(att.id, `/attachments/${ctx.attachmentStore.hashToPath(hash)}`);
				}
			}

			const seenUrls = new Set<string>();
			const resolved = allAttachments
				.map((att) => ({
					...att,
					url: attachmentUrls.get(att.id) ?? `https://forums.winamp.com/filedata/fetch?id=${att.id}`,
				}))
				// distinct ids can hash to the same file, and so to the same content-addressed path
				.filter((att) => !seenUrls.has(att.url) && seenUrls.add(att.url));

			return {
				...rest,
				body: ctx.urlRewriter.rewriteHtml(sanitized.body),
				created: parseForumDate(_created),
				updated: parseForumDate(_updated),
				attachments: resolved,
			};
		}),
	);
}

export async function scrapeThread(
	ctx: ScrapeContext,
	threadUrl: string,
	threadsDir: string,
	tag = '',
): Promise<ThreadData> {
	const { page, config } = ctx;

	const threadId = threadUrl.match(/\/(\d+)-/u)?.[1];
	if (!threadId) throw new Error(`No thread ID in URL: ${threadUrl}`);
	const outPath = join(threadsDir, `${threadId}.json`);

	ctx.urlRewriter.addLocalThread(threadId);

	if (existsSync(outPath)) {
		console.log(`  ${tag}${logSymbols.info} Thread already scraped: ${threadId}`);
		return JSON.parse(await readFile(outPath, 'utf-8'));
	}

	console.log(`\n${tag}→ Scraping thread: ${link(threadUrl)}`);
	await navigateWithRetry(ctx, threadUrl);

	const title = await page.$eval(common.heading, (el) => el.textContent?.trim() ?? '').catch(() => '');
	console.log(`  ${tag}Thread: ${title}`);

	const totalPages =
		(await page.$eval(common.lastPageButton, (el) => Math.trunc(Number(el.dataset.page ?? '')) || 0).catch(() => 0)) ||
		1;

	const firstPagePosts = await extractPosts(page);
	const allPosts = await processPosts(firstPagePosts, ctx, page);
	console.log(`    ${tag}Found ${pl(firstPagePosts.length, 'post')} on page 1`);

	if (totalPages > 1) {
		const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
		const concurrency = config.concurrency;

		const pageResults = await runInBatches(
			remainingPages,
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
					const pageUrl = `${threadUrl}/page${pageNum}`;
					console.log(`  ${tag}→ Page ${pageNum}`);
					await navigateWithRetry(workerCtx, pageUrl);
					const rawPosts = await extractPosts(workerPage);
					const posts = await processPosts(rawPosts, workerCtx, workerPage);
					console.log(`    ${tag}Found ${pl(rawPosts.length, 'post')} on page ${pageNum}`);
					return posts;
				} finally {
					if (needsClose) await workerPage.close();
				}
			},
		);

		for (const posts of pageResults) {
			allPosts.push(...posts);
		}
	}

	const data: ThreadData = fixMojibakeDeep({
		$schema: `${SCHEMA_BASE_URL}/thread-data.schema.json`,
		url: threadUrl,
		title,

		totalPages,
		posts: allPosts,
	});

	await writeFile(outPath, jsonStringify(data, ctx.config.minify), 'utf-8');
	console.log(`  ${tag}${logSymbols.success} Saved ${pl(allPosts.length, 'post')} → ${outPath}`);
	return data;
}
