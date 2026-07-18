import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { splitSpec } from "../lib/sentences";

test("splits on sentence terminators and newlines, 1-based sequential", () => {
  expect(splitSpec("A starts. B ends!\nC waits")).toEqual([
    { index: 1, text: "A starts." },
    { index: 2, text: "B ends!" },
    { index: 3, text: "C waits" },
  ]);
});

test("does not split on decimals or e.g.", () => {
  expect(splitSpec("Retry up to 3.5 times e.g. on timeout.")).toEqual([
    { index: 1, text: "Retry up to 3.5 times e.g. on timeout." },
  ]);
});

test("preserves literal characters previously used as sentinels", () => {
  const text = "Keep \uE000 and \uE001 exactly.";
  expect(splitSpec(text)).toEqual([{ index: 1, text }]);
});

test("empty and whitespace-only input yield []", () => {
  expect(splitSpec("")).toEqual([]);
  expect(splitSpec("  \n\t ")).toEqual([]);
});

test("sample 1 splits into exactly 6 sentences, S5 mentions cancel", () => {
  const s = splitSpec(readFileSync("samples/order-checkout.txt", "utf8"));
  expect(s).toHaveLength(6);
  expect(s[4].text).toMatch(/cancel/);
});
