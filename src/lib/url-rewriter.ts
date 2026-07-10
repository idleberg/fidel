import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import logSymbols from 'log-symbols';
import type { Page } from 'playwright';

import { SCHEMA_BASE_URL } from './schemas.ts';
import { jsonStringify, pl, sleep } from './utils.ts';
import { findOldForumById, findOldForumByName } from './wayback.ts';

export class UrlRewriter {
	private urlMap: Record<string, string> = {};
	private mapPath: string;
	private localThreadIds = new Set<string>();
	private forumsByOldId = new Map<number, number>();
	private dataDir: string;
	private dirty = false;
	private minify: boolean;

	constructor(dataDir: string, minify = true) {
		this.dataDir = dataDir;
		this.mapPath = join(dataDir, 'url-map.json');
		this.minify = minify;
	}

	async init(): Promise<void> {
		if (existsSync(this.mapPath)) {
			this.urlMap = JSON.parse(await readFile(this.mapPath, 'utf-8'));
		}

		const threadsDir = join(this.dataDir, 'threads');
		if (existsSync(threadsDir)) {
			for (const sub of readdirSync(threadsDir)) {
				const subDir = join(threadsDir, sub);
				let files: string[];
				try {
					files = readdirSync(subDir);
				} catch {
					continue;
				}
				for (const f of files) {
					if (f.endsWith('.json')) this.localThreadIds.add(f.replace('.json', ''));
				}
			}
		}

		const forumsDir = join(this.dataDir, 'forums');
		if (existsSync(forumsDir)) {
			for (const f of readdirSync(forumsDir)) {
				if (!f.endsWith('.json')) continue;
				const forum = JSON.parse(await readFile(join(forumsDir, f), 'utf-8'));
				if (forum.name && forum.channelId) {
					const old = findOldForumByName(forum.name);
					if (old) this.forumsByOldId.set(old.forumId, forum.channelId);
				}
			}
		}

		console.log(
			`  URL rewriter: ${Object.keys(this.urlMap).length} cached, ${this.localThreadIds.size} local threads, ${this.forumsByOldId.size} forum mappings`,
		);
	}

	async save(): Promise<void> {
		if (this.dirty) {
			const obj = { $schema: `${SCHEMA_BASE_URL}/url-map.schema.json`, ...this.urlMap };
			await writeFile(this.mapPath, jsonStringify(obj, this.minify), 'utf-8');
			this.dirty = false;
		}
	}

	addLocalThread(id: string): void {
		this.localThreadIds.add(id);
	}

	async resolveOldUrls(page: Page, urls: string[]): Promise<number> {
		const unresolved = [...new Set(urls)].filter((u) => !(this.normalize(u) in this.urlMap));
		if (unresolved.length === 0) return 0;

		console.log(`  → Resolving ${pl(unresolved.length, 'old URL')}…`);
		let resolved = 0;

		for (const url of unresolved) {
			const key = this.normalize(url);
			try {
				await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
				const newUrl = page.url();
				this.urlMap[key] = newUrl;
				resolved++;
			} catch {
				this.urlMap[key] = '';
			}
			this.dirty = true;
			await sleep(500);
		}

		await this.save();
		console.log(`  ${logSymbols.success} Resolved ${pl(resolved, 'URL')}`);
		return resolved;
	}

	rewriteHtml(html: string): string {
		return html.replaceAll(/href="([^"]*)"/giu, (_match, rawHref: string) => {
			const href = decodeHref(rawHref);
			const rewritten = this.rewriteUrl(href);
			if (rewritten && rewritten !== href) return `href="${rewritten}"`;
			return _match;
		});
	}

	extractOldThreadUrls(html: string): string[] {
		const urls: string[] = [];
		const re = /href="([^"]*)"/giu;
		let m;
		while ((m = re.exec(html)) !== null) {
			const href = decodeHref(m[1]);
			if (isOldThreadUrl(href) && !(this.normalize(href) in this.urlMap)) {
				urls.push(href);
			}
		}
		return urls;
	}

	private rewriteUrl(url: string): string | undefined {
		if (!url.includes('forums.winamp.com')) return undefined;

		return (
			this.tryNewFormatThread(url) ??
			this.tryOldForumUrl(url) ??
			this.tryResolvedThread(url) ??
			this.tryWaybackFallback(url)
		);
	}

	private tryNewFormatThread(url: string): string | undefined {
		const match = url.match(/forums\.winamp\.com\/forum\/.*?\/(\d+)-/u);
		if (!match) return undefined;
		const id = match[1];
		return this.localThreadIds.has(id) ? `/thread/${id}` : undefined;
	}

	private tryOldForumUrl(url: string): string | undefined {
		const match = url.match(/forumdisplay\.php[^]*?(?:forumid|f)=(\d+)/iu);
		if (!match) return undefined;
		const forumId = Math.trunc(Number(match[1]));

		const channelId = this.forumsByOldId.get(forumId);
		if (channelId) return `/forum/${channelId}`;

		if (findOldForumById(forumId)) {
			return `https://web.archive.org/web/*/http://forums.winamp.com/forumdisplay.php?forumid=${forumId}`;
		}
		return undefined;
	}

	private tryResolvedThread(url: string): string | undefined {
		if (!isOldThreadUrl(url)) return undefined;

		const resolved = this.urlMap[this.normalize(url)];
		if (!resolved) return undefined;

		const threadMatch = resolved.match(/\/(\d+)-[^/]*$/u);
		if (threadMatch && this.localThreadIds.has(threadMatch[1])) {
			return `/thread/${threadMatch[1]}`;
		}
		return resolved || undefined;
	}

	private tryWaybackFallback(url: string): string | undefined {
		const threadId = url.match(/(?:threadid|t)=(\d+)/iu)?.[1];
		if (threadId) {
			return `https://web.archive.org/web/*/http://forums.winamp.com/showthread.php?threadid=${threadId}`;
		}

		const postId = url.match(/(?:postid|p)=(\d+)/iu)?.[1];
		if (postId) {
			return `https://web.archive.org/web/*/http://forums.winamp.com/showthread.php?postid=${postId}`;
		}

		return undefined;
	}

	private normalize(url: string): string {
		return decodeHref(url)
			.replaceAll('\\', '')
			.replaceAll(/[\n\t\r]+/gu, '')
			.trim();
	}
}

function decodeHref(href: string): string {
	return href.replaceAll('&#x26;', '&').replaceAll('&amp;', '&');
}

function isOldThreadUrl(url: string): boolean {
	return /forums\.winamp\.com\/showthread\.php/iu.test(url);
}
