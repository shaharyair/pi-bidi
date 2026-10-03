import assert from "node:assert/strict";
import { test } from "node:test";
import { editorRow, toVisual } from "./index.ts";

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
