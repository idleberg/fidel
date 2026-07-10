import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import type { Options as SanitizeSchema } from 'rehype-sanitize';
import { visit, SKIP } from 'unist-util-visit';
import type { Root, Element, Text, Node } from 'hast';

const sanitizeSchema: SanitizeSchema = {
	tagNames: [
		'a',
		'b',
		'strong',
		'i',
		'em',
		'u',
		'br',
		'ul',
		'ol',
		'li',
		'blockquote',
		'pre',
		'code',
		'img',
		'div',
		'p',
	],
	attributes: {
		a: ['href'],
		img: ['src', 'alt', 'title'],
	},
	strip: ['hr'],
};

function hasClass(node: Element, cls: string): boolean {
	return Array.isArray(node.properties.className) && (node.properties.className as string[]).includes(cls);
}

function findChild(node: Element, tag: string, cls?: string): Element | undefined {
	return node.children.find(
		(c): c is Element => c.type === 'element' && c.tagName === tag && (!cls || hasClass(c, cls)),
	);
}

function collectText(node: Node): string {
	if (node.type === 'text') return (node as Text).value;
	if (node.type === 'element') {
		const el = node as Element;
		if (el.tagName === 'br') return '\n';
		return el.children.map(collectText).join('');
	}
	return '';
}

function rehypeBbcodeContainers() {
	return (tree: Root) => {
		visit(tree, 'element', (node: Element) => {
			if (!(node.tagName === 'div' && hasClass(node, 'bbcode_container'))) return;

			const quoteDiv = findChild(node, 'div', 'bbcode_quote');
			if (quoteDiv) {
				const container = findChild(quoteDiv, 'div', 'quote_container');
				const content = (container ?? quoteDiv).children.filter(
					(c) => !(c.type === 'element' && c.tagName === 'div' && hasClass(c as Element, 'bbcode_quote_container')),
				);
				node.tagName = 'blockquote';
				node.properties = {};
				node.children = content;
				return;
			}

			const codeDiv = findChild(node, 'div', 'bbcode_code');
			if (codeDiv) {
				const codeEl = findChild(codeDiv, 'code');
				const text = collectText(codeEl ?? codeDiv)
					.replaceAll('\u00A0', ' ')
					.replaceAll(/\n{2,}/gu, '\n')
					.replaceAll(/^\n+|\n+$/gu, '');
				node.tagName = 'pre';
				node.properties = {};
				node.children = [
					{
						type: 'element',
						tagName: 'code',
						properties: {},
						children: [{ type: 'text', value: text }],
					},
				];
			}
		});
	};
}

function rehypeStripBbcodeDescriptions() {
	return (tree: Root) => {
		visit(tree, 'element', (node: Element, index, parent) => {
			if (
				node.tagName === 'div' &&
				hasClass(node, 'bbcode_description') &&
				/^(PHP|HTML)\s+Code:$/u.test(collectText(node).trim())
			) {
				parent?.children.splice(index!, 1);
				return [SKIP, index!];
			}
		});
	};
}

function rehypeStripColorSpans() {
	return (tree: Root) => {
		visit(tree, 'element', (node: Element) => {
			if (node.tagName !== 'pre' && node.tagName !== 'code') return;

			visit(node, 'element', (child: Element, index, parent) => {
				if (
					child.tagName === 'span' &&
					typeof child.properties.style === 'string' &&
					/\bcolor\s*:/u.test(child.properties.style)
				) {
					parent?.children.splice(index!, 1, ...child.children);
					return [SKIP, index!];
				}
			});
		});
	};
}

function rehypeStripCodeLabels() {
	return (tree: Root) => {
		visit(tree, 'element', (node: Element, index, parent) => {
			if (
				node.tagName === 'font' &&
				node.children.length === 1 &&
				node.children[0].type === 'text' &&
				node.children[0].value.trim() === 'code:'
			) {
				parent?.children.splice(index!, 1);
				return [SKIP, index!];
			}
		});
	};
}

const smileyMap: Record<string, string> = {
	tongue: '😛',
	locked: '🔒',
	recycle6bs: '♻️',
	tinfoil: '🤨',
	superfrown: '😞',
	igore: '🧟',
	smile: '🙂',
	frown: '🙁',
	mad: '😠',
	wink: '😉',
	redface: '😳',
	cool: '😎',
	rolleyes: '🙄',
	eek: '😱',
	confused: '😕',
	biggrin: '😁',
	thumbsup: '👍',
	thumbsdown: '👎',
	forum_new: '📻',
	navbits_start: '🦙',
	stare: '😐',
	hanginghead: '😔',
	weird: '🤪',
	crying: '😢',
};

function rehypeReplaceSmiley() {
	return (tree: Root) => {
		visit(tree, 'element', (node: Element, index, parent) => {
			if (
				node.tagName === 'img' &&
				typeof node.properties.src === 'string' &&
				node.properties.src.includes('/core/smilies/')
			) {
				const basename = node.properties.src.replace(/.*\//u, '').replace(/\.[^.]+$/u, '');
				const emoji = smileyMap[basename];
				if (emoji) {
					(parent as Element).children.splice(index!, 1, { type: 'text', value: emoji });
					return [SKIP, index!];
				}
			}
		});
	};
}

function rehypeStripMaterialIcons() {
	return (tree: Root) => {
		visit(tree, 'element', (node: Element, index, parent) => {
			if (
				node.tagName === 'img' &&
				typeof node.properties.src === 'string' &&
				node.properties.src.includes('/core/images/default/google-material/')
			) {
				parent?.children.splice(index!, 1);
				return [SKIP, index!];
			}
		});
	};
}

export interface ExtractedAttachment {
	id: number;
	name: string;
	size: string;
	views: number;
}

function rehypeExtractAttachments(extracted: ExtractedAttachment[]) {
	return (tree: Root) => {
		visit(tree, 'element', (node: Element, index, parent) => {
			if (node.tagName !== 'div') return;

			const text = node.children.find((c): c is Text => c.type === 'text' && c.value.trim() === 'Attached Files');
			const ul = node.children.find((c): c is Element => c.type === 'element' && c.tagName === 'ul');
			if (!text || !ul) return;

			for (const li of ul.children) {
				if (li.type !== 'element' || li.tagName !== 'li') continue;
				const a = li.children.find((c): c is Element => c.type === 'element' && c.tagName === 'a');
				if (!a) continue;

				const href = String(a.properties.href ?? '');
				const idMatch = href.match(/[?&]id=(\d+)/u);
				const linkText = collectText(a).trim();
				const match = linkText.match(/^(.+?)\s*\(([^,]+),\s*(\d[\d,]*)\s*views?\)$/u);

				extracted.push({
					id: idMatch ? Math.trunc(Number(idMatch[1])) : 0,
					name: match?.[1]?.trim() ?? linkText,
					size: match?.[2]?.trim() ?? '',
					views: match ? Math.trunc(Number(match[3].replaceAll(',', ''))) : 0,
				});
			}

			parent?.children.splice(index!, 1);
			return [SKIP, index!];
		});
	};
}

export interface SanitizeResult {
	body: string;
	attachments: ExtractedAttachment[];
}

export async function sanitizeHtml(html: string): Promise<SanitizeResult> {
	const attachments: ExtractedAttachment[] = [];

	const pipeline = unified()
		.use(rehypeParse, { fragment: true })
		.use(rehypeBbcodeContainers)
		.use(rehypeStripBbcodeDescriptions)
		.use(rehypeStripColorSpans)
		.use(rehypeStripCodeLabels)
		.use(rehypeReplaceSmiley)
		.use(rehypeStripMaterialIcons)
		.use(rehypeExtractAttachments, attachments)
		.use(rehypeSanitize, sanitizeSchema)
		.use(rehypeStringify);

	const result = await pipeline.process(html);
	return { body: String(result).trim(), attachments };
}
