import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { toJsonSchema } from '@valibot/to-json-schema';

import { ForumDataSchema, ThreadDataSchema, MemberDataSchema, SCHEMA_BASE_URL } from './lib/schemas.ts';

const SCHEMAS_DIR = join(process.cwd(), 'schemas');

const schemas = [
	['forum-data.schema.json', ForumDataSchema],
	['thread-data.schema.json', ThreadDataSchema],
	['member-data.schema.json', MemberDataSchema],
] as const;

await mkdir(SCHEMAS_DIR, { recursive: true });

for (const [filename, schema] of schemas) {
	const jsonSchema = { $id: `${SCHEMA_BASE_URL}/${filename}`, ...toJsonSchema(schema) };
	await writeFile(join(SCHEMAS_DIR, filename), JSON.stringify(jsonSchema, null, 2) + '\n', 'utf-8');
	console.log(`Generated ${filename}`);
}
