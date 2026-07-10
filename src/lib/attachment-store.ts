import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import logSymbols from 'log-symbols';
import type { Page } from 'playwright';

import { SCHEMA_BASE_URL } from './schemas.ts';
import { jsonStringify } from './utils.ts';

export class AttachmentStore {
	private index = new Map<number, string>();
	private indexPath: string;
	private dirty = false;

	constructor(
		private attachmentsDir: string,
		private minify: boolean,
	) {
		this.indexPath = join(attachmentsDir, 'index.json');
	}

	async init(): Promise<void> {
		if (existsSync(this.indexPath)) {
			const raw: Record<string, string> = JSON.parse(await readFile(this.indexPath, 'utf-8'));
			for (const [id, hash] of Object.entries(raw)) {
				this.index.set(Math.trunc(Number(id)), hash);
			}
		}
	}

	has(id: number): boolean {
		return this.index.has(id);
	}

	getHash(id: number): string | undefined {
		return this.index.get(id);
	}

	hashToPath(hash: string): string {
		return `${hash.slice(0, 2)}/${hash}`;
	}

	async download(page: Page, id: number): Promise<string | undefined> {
		const existing = this.index.get(id);
		if (existing) return existing;

		const url = `https://forums.winamp.com/filedata/fetch?id=${id}`;
		console.log(`  ↓ Downloading attachment ${id}`);

		const result = await page.evaluate(async (fetchUrl) => {
			const res = await fetch(fetchUrl);
			if (!res.ok) return { ok: false as const, status: res.status };
			const buf = await res.arrayBuffer();
			const bytes = new Uint8Array(buf);
			let binary = '';
			for (let i = 0; i < bytes.length; i++) binary += String.fromCodePoint(bytes[i]);
			return { ok: true as const, data: btoa(binary) };
		}, url);

		if (!result.ok) {
			console.log(`  ${logSymbols.warning} Failed to download attachment ${id}: ${result.status}`);
			return undefined;
		}

		const body = Buffer.from(result.data, 'base64');
		const hash = createHash('sha256').update(body).digest('hex');
		const rel = this.hashToPath(hash);
		const absPath = join(this.attachmentsDir, rel);

		if (!existsSync(absPath)) {
			await mkdir(join(this.attachmentsDir, hash.slice(0, 2)), { recursive: true });
			await writeFile(absPath, body);
		}

		this.index.set(id, hash);
		this.dirty = true;
		return hash;
	}

	async save(): Promise<void> {
		if (!this.dirty) return;
		const obj: Record<string, string> = {
			$schema: `${SCHEMA_BASE_URL}/attachment-index.schema.json`,
		};
		for (const [id, hash] of this.index) {
			obj[String(id)] = hash;
		}
		await writeFile(this.indexPath, jsonStringify(obj, this.minify), 'utf-8');
		this.dirty = false;
	}
}
