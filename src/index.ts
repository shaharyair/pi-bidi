import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import bidiFactory from "bidi-js";

/**
 * Most terminals have no bidi support (e.g. ghostty-org/ghostty#1442): they
 * shape every run LTR, so Hebrew/Arabic/Persian renders in logical order —
 * backwards. This runs the Unicode Bidirectional Algorithm (UAX #9) over Pi's
 * transcript markdown and hands the terminal visually-ordered text instead.
 */

/** Hebrew, Arabic, Syriac, Thaana, N'Ko, Samaritan + Arabic presentation forms. */
const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

const bidi = bidiFactory();

/**
 * Reorder logical-order text to visual order, line by line, with the base
 * direction auto-detected per line from its first strong character.
 *
 * Fenced code blocks are left alone: reordering them would make text copied
 * out of the terminal differ from the source.
 */
export function toVisual(text: string): string {
	if (!RTL.test(text)) return text;
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
			if (!RTL.test(line)) return line;
			return bidi.getReorderedString(line, bidi.getEmbeddingLevels(line, "auto"));
		})
		.join("\n");
}

export default function piBidi(pi: ExtensionAPI): void {
	pi.registerMarkdownTransformer(toVisual);
}
