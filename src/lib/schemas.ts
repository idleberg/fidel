import * as v from 'valibot';

export const SCHEMA_BASE_URL = 'https://raw.githubusercontent.com/idleberg/fidel/v1/schemas';

export const AttachmentSchema = v.object({
	id: v.number(),
	name: v.string(),
	size: v.string(),
	views: v.number(),
	url: v.string(),
});

export const PostSchema = v.object({
	id: v.number(),
	title: v.string(),
	body: v.string(),
	author: v.string(),
	authorId: v.number(),
	created: v.string(),
	updated: v.string(),
	attachments: v.array(AttachmentSchema),
});

export const ThreadRefSchema = v.object({
	url: v.string(),
	title: v.string(),
	startedBy: v.string(),
	createdDate: v.string(),
	modifiedDate: v.string(),
	nodeId: v.number(),
	responses: v.number(),
	views: v.number(),
	sticky: v.boolean(),
	closed: v.boolean(),
	forumPage: v.number(),
});

export const ForumDataSchema = v.object({
	$schema: v.pipe(v.string(), v.url()),
	url: v.string(),
	name: v.string(),
	channelId: v.number(),
	isRoot: v.optional(v.boolean()),
	totalPages: v.number(),
	threads: v.array(ThreadRefSchema),
});

export const ThreadDataSchema = v.object({
	$schema: v.pipe(v.string(), v.url()),
	url: v.string(),
	title: v.string(),
	totalPages: v.number(),
	posts: v.array(PostSchema),
});

export const MemberDataSchema = v.object({
	$schema: v.pipe(v.string(), v.url()),
	url: v.string(),
	id: v.number(),
	name: v.string(),
	title: v.string(),
	joinDate: v.string(),
	lastActivity: v.string(),
	totalPosts: v.number(),
	location: v.string(),
});

export const AttachmentIndexSchema = v.intersect([
	v.object({ $schema: v.pipe(v.string(), v.url()) }),
	v.record(v.pipe(v.string(), v.digits()), v.pipe(v.string(), v.hexadecimal(), v.length(64))),
]);

export const UrlMapSchema = v.intersect([
	v.object({ $schema: v.pipe(v.string(), v.url()) }),
	v.record(v.string(), v.string()),
]);

export type Attachment = v.InferOutput<typeof AttachmentSchema>;
export type Post = v.InferOutput<typeof PostSchema>;
export type ThreadRef = v.InferOutput<typeof ThreadRefSchema>;
export type ForumData = v.InferOutput<typeof ForumDataSchema>;
export type ThreadData = v.InferOutput<typeof ThreadDataSchema>;
export type MemberData = v.InferOutput<typeof MemberDataSchema>;
