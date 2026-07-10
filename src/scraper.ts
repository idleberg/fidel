import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import logSymbols from 'log-symbols';

import { AttachmentStore } from './lib/attachment-store.ts';
import { createContext } from './lib/browser.ts';
import type { Config, Dirs, ScrapeContext, ForumData } from './lib/types.ts';
import { threadsDirForForum } from './lib/types.ts';
import { UrlRewriter } from './lib/url-rewriter.ts';
import { pl, sleep, runInBatches } from './lib/utils.ts';
import { discoverForums, scrapeForum } from './scrapers/forum.ts';
import { scrapeThread } from './scrapers/thread.ts';
import { scrapeMember } from './scrapers/member.ts';

function buildDirs(outDir: string): Dirs {
	return {
		forums: join(outDir, 'forums'),
		threads: join(outDir, 'threads'),
		members: join(outDir, 'members'),
		attachments: join(outDir, 'attachments'),
		cache: join(outDir, '.cache'),
	};
}

export async function scrape(config: Config): Promise<void> {
	const dirs = buildDirs(config.outDir);

	const mkdirs = [
		mkdir(dirs.forums, { recursive: true }),
		mkdir(dirs.threads, { recursive: true }),
		mkdir(dirs.members, { recursive: true }),
		mkdir(dirs.cache, { recursive: true }),
	];
	if (config.downloadAttachments) mkdirs.push(mkdir(dirs.attachments, { recursive: true }));
	await Promise.all(mkdirs);

	const { context, close } = await createContext(config.headless);
	const urlRewriter = new UrlRewriter(config.outDir, config.minify);
	await urlRewriter.init();
	const attachmentStore = new AttachmentStore(dirs.attachments, config.minify);
	await attachmentStore.init();

	const concurrency = config.concurrency;
	const pages = await Promise.all(Array.from({ length: concurrency }, () => context.newPage()));
	const contexts: ScrapeContext[] = pages.map((page) => ({
		page,
		config,
		dirs,
		urlRewriter,
		attachmentStore,
	}));
	const primaryCtx = contexts[0];

	try {
		const forumUrls = await discoverForums(primaryCtx);
		const allForumData: ForumData[] = [];
		for (const forumUrl of forumUrls) {
			const data = await scrapeForum(primaryCtx, forumUrl, forumUrl === config.forumUrl);
			allForumData.push(data);
			await sleep(config.delayMs);
		}

		const memberIds = new Set<number>();
		const failedThreads: string[] = [];

		for (const forum of allForumData) {
			const threadsDir = threadsDirForForum(dirs.threads, forum.channelId);
			await mkdir(threadsDir, { recursive: true });

			const threadsToScrape = forum.threads.filter((t) => t.url).slice(0, config.maxThreads);

			const results = await runInBatches(threadsToScrape, concurrency, config.delayMs, async (thread, workerIndex) => {
				const ctx = contexts[workerIndex];
				const tag = concurrency > 1 ? `[W${workerIndex + 1}] ` : '';
				try {
					const threadData = await scrapeThread(ctx, thread.url, threadsDir, tag);
					return { memberIds: threadData.posts.map((p) => p.authorId).filter(Boolean), failedUrl: null };
				} catch (err) {
					console.log(
						`  ${tag}${logSymbols.error} Failed to scrape thread ${thread.url} (forum page ${thread.forumPage}): ${(err as Error).message.split('\n')[0]}`,
					);
					return { memberIds: [] as number[], failedUrl: thread.url };
				}
			});

			for (const result of results) {
				for (const id of result.memberIds) memberIds.add(id);
				if (result.failedUrl) failedThreads.push(result.failedUrl);
			}
		}

		await urlRewriter.save();
		await attachmentStore.save();

		const membersToScrape = [...memberIds].slice(0, config.maxMembers);
		await runInBatches(membersToScrape, concurrency, config.delayMs, async (memberId, workerIndex) => {
			const tag = concurrency > 1 ? `[W${workerIndex + 1}] ` : '';
			await scrapeMember(contexts[workerIndex], memberId, tag);
		});

		console.log(`\n${logSymbols.success} Scrape complete.`);
		console.log(`  ${pl(allForumData.length, 'forum')}`);
		console.log(`  ${pl(memberIds.size, 'member')} collected (${pl(membersToScrape.length, 'member')} scraped)`);
		if (failedThreads.length > 0) {
			console.log(`  ${logSymbols.warning} ${pl(failedThreads.length, 'thread')} failed:`);
			for (const url of failedThreads) console.log(`    - ${url}`);
		}
	} finally {
		await close();
	}
}
