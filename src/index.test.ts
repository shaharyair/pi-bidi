import assert from "node:assert/strict";
import { test } from "node:test";
import piBidi, { editorRow, toVisual } from "./index.ts";
import * as tui from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext, MarkdownTransformer } from "@earendil-works/pi-coding-agent";

test("reverses a Hebrew run", () => {
	assert.equal(toVisual("שלום"), "םולש  ");
});

test("reverses and shapes Arabic in logical order", () => {
	assert.equal(toVisual("مرحبا"), "ابحرم  ");
});

test("leaves pure LTR untouched", () => {
	const s = "const x = [1, 2];";
	assert.equal(toVisual(s), s);
});

test("RTL base keeps embedded LTR runs in order", () => {
	assert.equal(toVisual("שלום world 42"), "world 42 םולש  ");
});

test("LTR base places the RTL run in place", () => {
	assert.equal(toVisual("hello שלום done"), "hello םולש done  ");
});

test("per-line: LTR lines are unaffected", () => {
	assert.equal(toVisual("abc\nשלום"), "abc\nםולש  ");
});

test("leaves fenced code blocks in logical order", () => {
	const s = 'שלום\n```js\nconst a = "שלום";\n```\nשלום';
	assert.equal(toVisual(s), 'םולש  \n```js\nconst a = "שלום";\n```\nםולש  ');
});

test("tilde fences and longer closing fences also hold", () => {
	const s = "~~~\nשלום\n~~~~\nשלום";
	assert.equal(toVisual(s), "~~~\nשלום\n~~~~\nםולש  ");
});

test("block prefixes stay at the line start", () => {
	assert.equal(toVisual("- שלום עולם"), "- םלוע םולש  ");
	assert.equal(toVisual("1. שלום"), "1. םולש  ");
	assert.equal(toVisual("## כותרת"), "## תרתוכ");
	assert.equal(toVisual("> ציטוט"), "> טוטיצ  ");
});

test("links and code spans move as one unit", () => {
	assert.equal(toVisual("ראה [כאן](http://x.com) עכשיו"), "וישכע [ןאכ](http://x.com) האר  ");
	assert.equal(toVisual("הרץ `npm test`"), "`npm test` ץרה  ");
});

test("table cells reorder in place, column order kept", () => {
	assert.equal(toVisual("| שם | גיל |"), "| םש | ליג |");
});

test("wraps in logical order before reordering", () => {
	assert.equal(toVisual("- אחת שתיים שלוש ארבע", 14), "- םייתש תחא  \n  עברא שולש  ");
});

test("right-aligns RTL paragraphs, headings and quotes to the width", () => {
	const nb = (n: number) => "\u00a0".repeat(n);
	assert.equal(toVisual("שלום", 10), `${nb(6)}םולש  `);
	assert.equal(toVisual("## שלום", 10), `## \u2060${nb(6)}םולש`);
	assert.equal(toVisual("> שלום", 10), `> ${nb(6)}םולש  `);
	assert.equal(toVisual("- שלום", 10), "- םולש  ");
	assert.equal(toVisual("hello שלום", 20), "hello םולש  ");
});

test("emphasis moves whole and does not count toward width", () => {
	assert.equal(toVisual("**שלום** עולם", 12), `${"\u00a0".repeat(3)}םלוע **םולש**  `);
});

test("niqqud stays on its letter, emoji stay whole", () => {
	assert.equal(toVisual("שָׁלוֹם 😀"), "😀 םוֹלשָׁ  ");
});

test("editor rows: RTL reordered, cursor moves with its character", () => {
	assert.equal(editorRow(" ab\x1b[7mש\x1b[0mל ", "rtl"), " ל\x1b[7mש\x1b[0mab ");
	assert.equal(editorRow("plain", "ltr"), "plain");
	assert.equal(editorRow("\x1b[31mשלום\x1b[0m", "rtl"), "\x1b[31mשלום\x1b[0m");
});

test("adjacent RTL atoms swap like words", () => {
	assert.equal(toVisual("**אב** `x` **גד**"), "**דג** `x` **בא**  ");
});

const fakeCursor = (tui as { renderFakeCursor?: (text: string) => string }).renderFakeCursor;

test("Pi 1.5 semantic cursor stays on its character and preserves width", { skip: !fakeCursor }, () => {
	for (const [text, visual] of [["של", "לש"], ["مر", "رم"]]) {
		const row = " ab" + tui.CURSOR_MARKER + fakeCursor!(text[0]) + text[1] + " ";
		const expected = " " + visual[0] + tui.CURSOR_MARKER + fakeCursor!(visual[1]) + "ab ";
		assert.equal(editorRow(row, "rtl"), expected);
		assert.equal(tui.visibleWidth(editorRow(row, "rtl")), tui.visibleWidth(row));
	}
	assert.equal(editorRow(" " + fakeCursor!("h") + "ello ", "ltr"), " " + fakeCursor!("h") + "ello ");
});

test("malformed and separately styled cursor rows remain untouched", { skip: !fakeCursor }, () => {
	const [start] = fakeCursor!("\0").split("\0");
	for (const row of [start + "שלום", "\x1b[31m" + fakeCursor!("ש") + "לום\x1b[0m"]) {
		assert.equal(editorRow(row, "rtl"), row);
	}
});

test("explicit RTL direction aligns English-leading, Hebrew and pure English lines", () => {
	for (const text of ["tool הוא כלי", "שלום tool", "English only"]) {
		const result = toVisual(text, 40, "rtl");
		assert.ok(result.startsWith("\u00a0"));
		assert.ok(result.includes(text === "English only" ? "English only" : "tool"));
		assert.equal(tui.visibleWidth(result.replace(/  $/, "")), 40);
	}
});

test("explicit LTR direction keeps Hebrew-leading replies on the left", () => {
	const result = toVisual("שלום tool", 40, "ltr");
	assert.ok(!result.startsWith("\u00a0"));
	assert.ok(result.includes("tool"));
	assert.equal(toVisual("English only", 40, "ltr"), "English only");
});

test("RTL list markers travel with wrapped items rather than staying left", () => {
	for (const marker of ["- ", "1. ", "- [x] "]) {
		const lines = toVisual(marker + "tool שלום עולם tool שלום עולם", 20, "rtl").split("\n");
		assert.ok(lines.length > 1);
		for (const line of lines) {
			assert.ok(line.includes("\u2060"));
			assert.ok(line.endsWith("  "));
			assert.ok(tui.visibleWidth(line.replace(/  $/, "")) <= 20);
		}
		assert.ok(lines.some((line) => line.includes("-") || line.includes("1")));
	}
});

test("forced direction preserves code and Markdown structural lines", () => {
	const source = '```js\nconst text = "שלום";\n```\n    const text = "שלום";\n\tשלום\n\n---\n***\n===';
	assert.equal(toVisual(source, 40, "rtl"), source);
	assert.equal(toVisual("| שם | tool |", 40, "rtl"), toVisual("| שם | tool |", 40));
	const formatted = toVisual("tool **שלום** [כאן](https://example.com) `npm test`", 80, "rtl");
	assert.ok(formatted.includes("**םולש**"));
	assert.ok(formatted.includes("[ןאכ](https://example.com)"));
	assert.ok(formatted.includes("`npm test`"));
});

test("registered transformer follows each question through history and streaming", () => {
	const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => void>();
	let transform!: MarkdownTransformer;
	const entry = (id: string, role: string, content: unknown) => ({
		type: "message", id, timestamp: id, message: { role, content },
	});
	let branch = [
		entry("q1", "user", [{ type: "text", text: "מה זה tool?" }]),
		entry("a1", "assistant", []),
		entry("q2", "user", "Explain tool"),
		entry("a2", "assistant", []),
	];
	piBidi({
		registerMarkdownTransformer: (handler: MarkdownTransformer) => { transform = handler; },
		on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => void) => { handlers.set(name, handler); },
	} as unknown as ExtensionAPI);
	const session = { hasUI: false, sessionManager: { getBranch: () => branch } } as unknown as ExtensionContext;
	handlers.get("session_start")!({}, session);
	const context = { messageType: "assistant" as const, availableWidth: 40, isStreaming: false };
	assert.ok(transform("tool הוא כלי", { ...context, messageId: "a1" }).startsWith("\u00a0"));
	assert.ok(transform("tool הוא כלי", { ...context, timestamp: "a1" }).startsWith("\u00a0"));
	assert.ok(!transform("שלום tool", { ...context, messageId: "a2" }).startsWith("\u00a0"));
	assert.ok(!transform("שלום tool", { ...context, isStreaming: true }).startsWith("\u00a0"));
	branch = [...branch, entry("q3", "user", "מה זה?")];
	assert.ok(transform("tool הוא כלי", { ...context, isStreaming: true }).startsWith("\u00a0"));
	assert.equal(transform("tool הוא כלי", { ...context, messageType: "user" }), toVisual("tool הוא כלי", 40));
	branch = [];
	assert.equal(transform("שלום tool", context), toVisual("שלום tool", 40));
	handlers.get("session_shutdown")!({}, session);
	assert.equal(transform("שלום tool", context), toVisual("שלום tool", 40));
});
