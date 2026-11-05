import { CustomEditor, type ExtensionAPI, type ExtensionContext, type MarkdownTransformContext, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";
import * as tui from "@earendil-works/pi-tui";
import bidiFactory, { type EmbeddingLevels } from "bidi-js";

/**
 * Most terminals have no bidi support (e.g. ghostty-org/ghostty#1442): they
 * shape every run LTR, so Hebrew/Arabic/Persian renders in logical order —
 * backwards. This runs the Unicode Bidirectional Algorithm (UAX #9) over Pi's
 * transcript markdown and the input editor, handing the terminal visually
 * ordered text instead.
 *
 * The markdown hook runs before parsing, so markdown syntax has to survive the
 * reordering: block prefixes (headings, quotes) stay at the line start,
 * table cells are reordered one by one, and links, code spans and emphasis move
 * as one unit. RTL lines are pre-wrapped to the available width in logical
 * order, each piece ends in a hard break so the renderer never re-wraps
 * reordered text, and RTL paragraphs are right-aligned with no-break spaces.
 */

/** Hebrew, Arabic, Syriac, Thaana, N'Ko, Samaritan + Arabic presentation forms. */
const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
/** Leading block syntax: indent, quote markers, then one list marker or heading. */
const PREFIX = /^(\s*(?:>\s?)*)((?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?|#{1,6}\s+)?/;
/** Spans that must not be split or reordered internally: code, link, autolink, emphasis. */
const ATOM =
	/(`+)[^`]*?\1|!?\[([^\]]*)\]\([^)]*\)|<[a-z]+:[^>\s]*>|(\*\*|__|~~)(?=\S)(.+?)(?<=\S)\3|\*(?=[^\s*])([^*]+?)(?<=[^\s*])\*/gi;
const PUA = 0xe000;
const PUA_RE = /[\uE000-\uF8FF]/g;
const NBSP = "\u00a0";
/** Zero-width; stops the heading parser from trimming the alignment padding. */
const WJ = "\u2060";

const bidi = bidiFactory();
const graphemes = new Intl.Segmenter();
// Pi 1.5 uses semantic cursor markers; older hosts only have ANSI reverse video.
// Discover markers through the public renderer without requiring it on older hosts.
const fakeCursor = (tui as { renderFakeCursor?: (text: string) => string }).renderFakeCursor;
const [FAKE_CURSOR_START, FAKE_CURSOR_END] = fakeCursor?.("\0").split("\0") ?? [];

type Dir = "rtl" | "ltr";

/** Terminal cells, measured the way pi-tui's renderer measures them. */
const cells = visibleWidth;

const baseDir = (text: string): Dir =>
	bidi.getEmbeddingLevels(text, "auto").paragraphs[0]?.level ? "rtl" : "ltr";

/**
 * Visual order as grapheme clusters, each tagged with its logical start index.
 * Unlike bidi-js's getReorderedString, this keeps combining marks after their
 * base letter and surrogate pairs intact inside reversed runs.
 */
function visual(text: string, levels: EmbeddingLevels): { start: number; text: string }[] {
	const owner = new Array<number>(text.length);
	const clusters: { start: number; text: string }[] = [];
	for (const { segment, index } of graphemes.segment(text)) {
		owner.fill(clusters.length, index, index + segment.length);
		clusters.push({ start: index, text: segment });
	}
	const seen = new Set<number>();
	const out: { start: number; text: string }[] = [];
	for (const i of bidi.getReorderedIndices(text, levels)) {
		const c = owner[i]!;
		if (seen.has(c)) continue;
		seen.add(c);
		const { start, text: t } = clusters[c]!;
		const mirror = levels.levels[start]! & 1 ? bidi.getMirroredCharacter(t) : null;
		out.push({ start, text: mirror ?? t });
	}
	return out;
}

/** `levelsOf` is a same-length stand-in used only to resolve directions. */
const reorder = (text: string, dir: Dir, levelsOf = text) =>
	visual(text, bidi.getEmbeddingLevels(levelsOf, dir))
		.map((c) => c.text)
		.join("");

/** Logical-order word wrap. Words longer than the width are left whole. */
function wrap(text: string, width: number, len: (s: string) => number): string[] {
	if (len(text) <= width) return [text];
	const lines: string[] = [];
	let cur = "";
	for (const word of text.split(/(?<=\s)/)) {
		if (cur && len(cur + word.trimEnd()) > width) {
			lines.push(cur.trimEnd());
			cur = "";
		}
		cur += word;
	}
	if (cur.trim()) lines.push(cur.trimEnd());
	return lines;
}

interface Inline {
	dir: Dir;
	/** Visual-order lines, each paired with its rendered width in cells. */
	lines: { text: string; width: number }[];
}

/** Reorder inline markdown; atoms move whole, their visible text reordered recursively. */
function inline(text: string, width: number, outer?: Dir): Inline {
	const atoms: string[] = [];
	const shown: string[] = [];
	/** One strong (or digit) character per atom, so the placeholder carries its content's direction. */
	const standIn: string[] = [];
	const masked = text.replace(ATOM, (m, tick, label, emph, emphInner, star) => {
		const inner = (s: string) => inline(s, Infinity, outer).lines[0]?.text ?? "";
		let atom = m;
		let visible = m;
		if (tick) visible = m.slice(tick.length, -tick.length);
		else if (label !== undefined) {
			atom = m.replace(`[${label}]`, `[${inner(label)}]`);
			visible = label;
		} else if (emph) {
			atom = emph + inner(emphInner) + emph;
			visible = emphInner;
		} else if (star !== undefined) {
			atom = `*${inner(star)}*`;
			visible = star;
		}
		atoms.push(atom);
		shown.push(visible);
		standIn.push(baseDir(visible) === "rtl" ? "\u05d0" : /\p{L}/u.test(visible) ? "a" : "0");
		return String.fromCharCode(PUA + atoms.length - 1);
	});
	const restore = (s: string) => s.replace(PUA_RE, (c) => atoms[c.charCodeAt(0) - PUA] ?? c);
	const len = (s: string) =>
		cells(
			s
				.replace(PUA_RE, (c) => shown[c.charCodeAt(0) - PUA] ?? c)
				.replace(/\\(?=[!-/:-@[-`{-~])/g, ""),
		);
	const sub = (s: string) => s.replace(PUA_RE, (c) => standIn[c.charCodeAt(0) - PUA] ?? c);
	const dir = outer ?? baseDir(sub(masked));
	return {
		dir,
		lines: wrap(masked, width, len).map((l) => ({
			text: restore(reorder(l, dir, sub(l))),
			width: len(l),
		})),
	};
}

function tableRow(line: string): string {
	return line.replace(/(?<=^\s*\||[^\\]\|)([^|]*?[^\\|][^|]*?)(?=\|)/g, (cell) => {
		const lead = cell.match(/^\s*/)![0];
		const trail = cell.match(/\s*$/)![0];
		return lead + (inline(cell.trim(), Infinity).lines[0]?.text ?? "") + trail;
	});
}

function block(line: string, width: number, outer?: Dir): string {
	if (/^\s*\|/.test(line)) return tableRow(line);
	const m = PREFIX.exec(line)!;
	const [quote, marker = ""] = [m[1]!, m[2]];
	const isHeading = marker.startsWith("#");
	if (outer === "rtl" && marker && !isHeading) {
		// Pi pins parsed list markers left. Render RTL items as hard-broken
		// paragraphs so their literal marker travels with the contents instead.
		const avail = Math.max(10, width - cells(quote));
		return inline(marker + line.slice(m[0].length), avail, outer).lines
			.map(({ text, width: w }) => quote + (Number.isFinite(avail) ? NBSP.repeat(Math.max(0, avail - w)) : "") + WJ + text + "  ")
			.join("\n");
	}
	// h1/h2 render without their "#" prefix; quotes render "> " as "│ ", same width.
	const shown = isHeading && marker.trim().length < 3 ? cells(quote) : cells(m[0]);
	const avail = Math.max(10, width - shown);
	const { dir, lines } = inline(line.slice(m[0].length), avail, outer);
	const cont = quote + (isHeading ? marker : " ".repeat(marker.length));
	// Right-align RTL paragraphs, quotes and headings; list text stays beside its marker.
	const align = dir === "rtl" && Number.isFinite(width) && (!marker || isHeading);
	// Two trailing spaces = hard break; headings are single-line, so repeat the marker instead.
	const end = isHeading ? "" : "  ";
	return lines
		.map(({ text, width: w }, i) => {
			const pad = align ? NBSP.repeat(Math.max(0, avail - w)) : "";
			return (i ? cont : quote + marker) + (pad && isHeading ? WJ : "") + pad + text + end;
		})
		.join("\n");
}

/**
 * Reorder logical-order markdown to visual order, line by line, with the base
 * direction auto-detected per line unless supplied by the caller. A finite
 * width enables wrapping and right-alignment.
 *
 * Fenced code blocks are left alone: reordering them would make text copied
 * out of the terminal differ from the source.
 */
export function toVisual(text: string, width = Infinity, outer?: Dir): string {
	if (!RTL.test(text) && outer !== "rtl") return text;
	let fence: string | undefined;
	return text
		.split("\n")
		.map((line) => {
			const marker = FENCE.exec(line)?.[1];
			if (fence) {
				if (marker && marker[0] === fence[0] && marker.length >= fence.length)
					fence = undefined;
				return line;
			}
			if (marker) {
				fence = marker;
				return line;
			}
			if (!line.trim() || /^(?: {4}|\t)/.test(line) || /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line) || /^\s*=+\s*$/.test(line)) return line;
			if (!RTL.test(line) && outer !== "rtl") return line;
			return block(line, width, outer);
		})
		.join("\n");
}

/**
 * Reorder one rendered editor row, moving its semantic or reverse-video cursor
 * with its character. Rows carrying any other styling are returned untouched. In an RTL
 * row the padding lands on the left, so the text sits flush right.
 */
export function editorRow(row: string, dir: Dir): string {
	const marker = row.includes(CURSOR_MARKER) ? CURSOR_MARKER : "";
	let s = row.replace(CURSOR_MARKER, "");
	let cursor = -1;
	const [open, close] = FAKE_CURSOR_START && s.includes(FAKE_CURSOR_START)
		? [FAKE_CURSOR_START, FAKE_CURSOR_END!]
		: ["\x1b[7m", "\x1b[0m"];
	const on = s.indexOf(open);
	if (on >= 0) {
		const off = s.indexOf(close, on + open.length);
		if (off < 0) return row;
		s = s.slice(0, on) + s.slice(on + open.length, off) + s.slice(off + close.length);
		cursor = on;
	}
	if (s.includes("\x1b") || (dir === "ltr" && !RTL.test(s))) return row;
	return visual(s, bidi.getEmbeddingLevels(s, dir))
		.map((c) => (c.start === cursor ? `${marker}${open}${c.text}${close}` : c.text))
		.join("");
}

/**
 * The stock editor, with its text rows reordered after it lays them out —
 * so wrapping stays logical and correct. Keys still move the cursor logically.
 */
class BidiEditor extends CustomEditor {
	override render(width: number): string[] {
		const rows = super.render(width);
		const text = this.getText();
		if (!RTL.test(text)) return rows;
		// ponytail: one base direction for the whole draft, per-paragraph if mixed drafts matter.
		const dir = baseDir(text);
		// Row 0 is the top border; then the visible text rows.
		// SAFETY: renderedVisibleLineCount is TS-private on pi-tui's Editor but a plain runtime
		// field, set by the super.render() call above; a missing field yields undefined → loop skipped.
		const count = (this as unknown as { renderedVisibleLineCount: number }).renderedVisibleLineCount;
		for (let i = 1; i <= count && i < rows.length; i++) rows[i] = editorRow(rows[i]!, dir);
		return rows;
	}
}

/** Direction of the user turn preceding this reply, including persisted history. */
function questionDirection(
	branch: readonly SessionEntry[],
	context: MarkdownTransformContext & { messageId?: string; timestamp?: string },
): Dir | undefined {
	const target = branch.findIndex((entry) => context.messageId
		? entry.id === context.messageId
		: context.timestamp ? entry.timestamp === context.timestamp : false);
	for (let i = target < 0 ? branch.length - 1 : target - 1; i >= 0; i--) {
		const entry = branch[i]!;
		if (entry.type !== "message" || entry.message.role !== "user") continue;
		const content = entry.message.content;
		const text = typeof content === "string" ? content
			: content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
		if (text.trim()) return baseDir(text);
	}
	return undefined;
}

export default function piBidi(pi: ExtensionAPI): void {
	let session: ExtensionContext | undefined;
	pi.registerMarkdownTransformer((md: string, ctx: MarkdownTransformContext) =>
		toVisual(md, ctx.availableWidth || Infinity,
			ctx.messageType === "user" || !session ? undefined
				: questionDirection(session.sessionManager.getBranch(), ctx)),
	);
	pi.on("session_start", (_event, ctx) => {
		session = ctx;
		if (ctx.hasUI) ctx.ui.setEditorComponent((tui, theme, kb) => new BidiEditor(tui, theme, kb));
	});
	pi.on("session_shutdown", () => { session = undefined; });
}
