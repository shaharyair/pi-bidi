// bidi-js ships no types; only the calls this extension makes are declared.
declare module "bidi-js" {
	export interface EmbeddingLevels {
		levels: Uint8Array;
		paragraphs: { start: number; end: number; level: number }[];
	}
	interface Bidi {
		getEmbeddingLevels(
			text: string,
			direction?: "ltr" | "rtl" | "auto",
		): EmbeddingLevels;
		getReorderedString(
			text: string,
			embeddingLevels: EmbeddingLevels,
			start?: number,
			end?: number,
		): string;
		getReorderedIndices(text: string, embeddingLevels: EmbeddingLevels): number[];
		getMirroredCharacter(char: string): string | null;
	}
	export default function bidiFactory(): Bidi;
}
