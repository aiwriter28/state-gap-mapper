import type { Sentence } from "./machine";

const DECIMAL_PERIOD = "\uE000";
const ABBREVIATION_PERIOD = "\uE001";

function protectPeriods(text: string): string {
  return text
    .replace(/(\d)\.(\d)/g, `$1${DECIMAL_PERIOD}$2`)
    .replace(/\be\.g\./gi, (abbreviation) =>
      abbreviation.replaceAll(".", ABBREVIATION_PERIOD),
    );
}

function restorePeriods(text: string): string {
  return text
    .replaceAll(DECIMAL_PERIOD, ".")
    .replaceAll(ABBREVIATION_PERIOD, ".");
}

/** Splits a Spec into stable, 1-based Sentence evidence anchors. */
export function splitSpec(text: string): Sentence[] {
  return protectPeriods(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((segment) => restorePeriods(segment).trim())
    .filter((segment) => segment.length > 0)
    .map((text, offset) => ({ index: offset + 1, text }));
}
