import { join } from 'node:path';

import type { Page } from 'playwright';

import type { AttachmentStore } from './attachment-store.ts';
import type { UrlRewriter } from './url-rewriter.ts';

export interface Config {
	forumUrl: string;
	outDir: string;
	headless: boolean;
	startPage: number;
	delayMs: number;
	maxPagesPerForum: number;
	maxThreads: number;
	maxMembers: number;
	downloadAttachments: boolean;
	attachments: boolean;
	useCache: boolean;
	timeout: number;
	retries: number;
	minify: boolean;
	reverse: boolean;
	concurrency: number;
}

export interface Dirs {
	forums: string;
	threads: string;
	members: string;
	attachments: string;
	cache: string;
}

export function threadsDirForForum(baseThreadsDir: string, channelId: number): string {
	return join(baseThreadsDir, String(channelId));
}

export interface ScrapeContext {
	page: Page;
	config: Config;
	dirs: Dirs;
	urlRewriter: UrlRewriter;
	attachmentStore: AttachmentStore;
}

export type { Attachment, Post, ThreadRef, ForumData, ThreadData, MemberData } from './schemas.ts';
