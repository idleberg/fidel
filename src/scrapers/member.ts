import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import logSymbols from 'log-symbols';

import { navigateWithRetry } from '../lib/browser.ts';
import { selectors } from '../lib/selectors.ts';
import { SCHEMA_BASE_URL } from '../lib/schemas.ts';
import type { ScrapeContext, MemberData } from '../lib/types.ts';
import { jsonStringify, link, parseForumDate } from '../lib/utils.ts';

const sel = selectors.member;

const evaluateSelectors = {
	sidebarContent: sel.sidebarContent,
	username: sel.username,
	userTitle: sel.userTitle,
	profileInfo: sel.profileInfo,
	totalPosts: sel.totalPosts,
};

export async function scrapeMember(ctx: ScrapeContext, memberId: number, tag = ''): Promise<MemberData | null> {
	const { page, config: _config, dirs } = ctx;
	const outPath = join(dirs.members, `${memberId}.json`);

	if (existsSync(outPath)) {
		console.log(`  ${tag}${logSymbols.info} Member already scraped: ${memberId}`);
		return JSON.parse(await readFile(outPath, 'utf-8'));
	}

	const memberUrl = `https://forums.winamp.com/member/${memberId}`;
	console.log(`\n${tag}→ Scraping member: ${link(memberUrl)}`);
	await navigateWithRetry(ctx, memberUrl, { skipCache: true });

	const aboutLink = page.locator(sel.aboutTab);
	if (await aboutLink.isVisible().catch(() => false)) {
		await aboutLink.click();
		await page
			.locator(sel.aboutContainer)
			.first()
			.waitFor({ timeout: 10_000 })
			.catch(() => {});
	}

	const data = await page.evaluate((s) => {
		const sidebar = document.querySelector(s.sidebarContent);
		const name = sidebar?.querySelector(s.username)?.textContent?.trim() ?? '';
		const title = sidebar?.querySelector(s.userTitle)?.textContent?.trim() ?? '';

		const info: Record<string, string> = {};
		sidebar?.querySelectorAll(s.profileInfo).forEach((el) => {
			const text = el.textContent?.trim() ?? '';
			const match = text.match(/^(.+?):\s*(.+)$/u);
			if (match) {
				info[match[1].trim()] = match[2].trim();
			}
		});

		const totalPostsEl = document.querySelector(s.totalPosts);
		const totalPosts = Math.trunc(Number(totalPostsEl?.textContent?.trim().replaceAll(',', '') ?? '0')) || 0;

		return { name, title, info, totalPosts };
	}, evaluateSelectors);

	const memberData: MemberData = {
		$schema: `${SCHEMA_BASE_URL}/member-data.schema.json`,
		url: memberUrl,
		id: memberId,
		name: data.name,
		title: data.title,

		joinDate: parseForumDate(data.info['Join Date'] ?? data.info['Joined'] ?? ''),
		lastActivity: parseForumDate(data.info['Last Activity'] ?? data.info['Last Online'] ?? ''),
		totalPosts: data.totalPosts,
		location: data.info['Location'] ?? '',
	};

	await writeFile(outPath, jsonStringify(memberData, ctx.config.minify), 'utf-8');
	console.log(`  ${tag}${logSymbols.success} Saved member ${memberData.name} → ${outPath}`);
	return memberData;
}
