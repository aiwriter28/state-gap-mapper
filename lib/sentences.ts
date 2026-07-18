import type { Sentence } from "./machine";

const SENTENCE_BOUNDARY =
  /(?:\r?\n)+|(?<=[!?])\s+|(?<!e\.g\.)(?<=[.])\s+/i;

/** Splits a Spec into stable, 1-based Sentence evidence anchors. */
export function splitSpec(text: string): Sentence[] {
  return text
    .split(SENTENCE_BOUNDARY)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((text, offset) => ({ index: offset + 1, text }));
}
