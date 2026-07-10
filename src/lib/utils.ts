import kleur from 'kleur';

export const link = (url: string) => kleur.blue(url);

export const sleep = (ms: number) =>
	new Promise<void>((r) => {
		setTimeout(r, ms);
	});

export const pl = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const jsonStringify = (data: unknown, minify: boolean) => JSON.stringify(data, null, minify ? undefined : 2);

export function parseForumDate(dateStr: string): string {
	if (!dateStr) return '';
	const d = new Date(dateStr);
	if (!isNaN(d.getTime())) return d.toISOString();
	const cleaned = dateStr.replace(',', '');
	const d2 = new Date(cleaned + ' UTC');
	if (!isNaN(d2.getTime())) return d2.toISOString();
	return dateStr;
}

export function epochToISO(epoch: number): string {
	if (!epoch) return '';
	return new Date(epoch * 1000).toISOString();
}

function* enumerate<T>(items: T[]): Generator<readonly [number, T]> {
	for (let i = 0; i < items.length; i++) yield [i, items[i]] as const;
}

export async function runInBatches<T, R>(
	items: T[],
	concurrency: number,
	delayMs: number,
	worker: (item: T, workerIndex: number) => Promise<R>,
): Promise<R[]> {
	const results: R[] = Array.from({ length: items.length });
	const iter = enumerate(items);

	async function runWorker(workerIndex: number): Promise<void> {
		for (const [i, item] of iter) {
			results[i] = await worker(item, workerIndex);
			if (delayMs > 0) await sleep(delayMs);
		}
	}

	const workers = Array.from({ length: Math.min(concurrency, items.length) }, (_, i) => runWorker(i));
	await Promise.all(workers);
	return results;
}
