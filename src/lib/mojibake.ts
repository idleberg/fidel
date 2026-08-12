const CP1252_TO_BYTE = buildReverseMap();
const NON_ASCII_RUN = /\P{ASCII}+/gu;
const PERCENT_RUN = /(?:%[0-9A-Fa-f]{2})+/gu;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const MAX_LAYERS = 3;

function buildReverseMap(): Map<string, number> {
	const decoder = new TextDecoder('windows-1252');
	const map = new Map<string, number>();
	for (let byte = 0; byte < 256; byte++) {
		map.set(decoder.decode(new Uint8Array([byte])), byte);
	}
	return map;
}

function toBytes(text: string): Uint8Array | undefined {
	const bytes = new Uint8Array(text.length);
	let i = 0;
	for (const char of text) {
		const byte = CP1252_TO_BYTE.get(char);
		if (byte === undefined) return undefined;
		bytes[i++] = byte;
	}
	return bytes.subarray(0, i);
}

/**
 * Reverses UTF-8 that was decoded as windows-1252 ("einzelstÃ¼cke" → "einzelstücke").
 * Only applied while the round-trip stays lossless, so text that merely looks
 * suspicious – genuine Arabic, CJK, emoji – is left untouched.
 */
function repairRun(run: string): string {
	let repaired = '';
	let segment = '';

	for (const char of run) {
		if (CP1252_TO_BYTE.has(char)) {
			segment += char;
			continue;
		}
		repaired += repairSegment(segment) + char;
		segment = '';
	}

	return repaired + repairSegment(segment);
}

function repairSegment(segment: string): string {
	let current = segment;

	for (let layer = 0; layer < MAX_LAYERS; layer++) {
		const bytes = toBytes(current);
		if (!bytes) break;

		let decoded: string;
		try {
			decoded = UTF8_DECODER.decode(bytes);
		} catch {
			break;
		}
		if (decoded === current) break;
		current = decoded;
	}

	return current;
}

function percentEncode(text: string): string {
	return [...new TextEncoder().encode(text)]
		.map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
		.join('');
}

/**
 * Thread slugs are the lowercased title, so their mojibake lost the capital
 * lead byte ("Ã¼" → "ã¼") and needs it back before the round-trip works.
 */
function repairPercentRun(run: string): string {
	let decoded: string;
	try {
		decoded = decodeURIComponent(run);
	} catch {
		return run;
	}

	let repaired = repairRun(decoded);
	if (repaired === decoded && decoded.length > 0) {
		const capitalized = decoded[0].toUpperCase() + decoded.slice(1);
		const fromCapitalized = repairRun(capitalized);
		if (fromCapitalized !== capitalized) repaired = fromCapitalized.toLowerCase();
	}

	return repaired === decoded ? run : percentEncode(repaired);
}

export function fixMojibake(text: string): string {
	return text.replaceAll(NON_ASCII_RUN, repairRun).replaceAll(PERCENT_RUN, repairPercentRun);
}

export function fixMojibakeDeep<T>(value: T): T {
	if (typeof value === 'string') return fixMojibake(value) as T;
	if (Array.isArray(value)) return value.map((item) => fixMojibakeDeep(item)) as T;

	if (value !== null && typeof value === 'object') {
		const entries = Object.entries(value).map(([key, item]) => [key, fixMojibakeDeep(item)]);
		return Object.fromEntries(entries) as T;
	}

	return value;
}
