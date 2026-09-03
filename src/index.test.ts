import assert from "node:assert/strict";
import { test } from "node:test";
import { toVisual } from "./index.ts";

test("reverses a Hebrew run", () => {
	assert.equal(toVisual("שלום"), "םולש");
});

test("reverses and shapes Arabic in logical order", () => {
	assert.equal(toVisual("مرحبا"), "ابحرم");
});

test("leaves pure LTR untouched", () => {
	const s = "const x = [1, 2];";
	assert.equal(toVisual(s), s);
});

test("RTL base keeps embedded LTR runs in order", () => {
	assert.equal(toVisual("שלום world 42"), "world 42 םולש");
});

test("LTR base places the RTL run in place", () => {
	assert.equal(toVisual("hello שלום done"), "hello םולש done");
});

test("per-line: LTR lines are unaffected", () => {
	assert.equal(toVisual("abc\nשלום"), "abc\nםולש");
});

test("leaves fenced code blocks in logical order", () => {
	const s = 'שלום\n```js\nconst a = "שלום";\n```\nשלום';
	assert.equal(toVisual(s), 'םולש\n```js\nconst a = "שלום";\n```\nםולש');
});

test("tilde fences and longer closing fences also hold", () => {
	const s = "~~~\nשלום\n~~~~\nשלום";
	assert.equal(toVisual(s), "~~~\nשלום\n~~~~\nםולש");
});
