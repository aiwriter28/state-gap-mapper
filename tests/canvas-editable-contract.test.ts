import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

test("canvas exposes pointer and non-pointer editing controls", () => {
  const canvas = readFileSync("src/components/Canvas.tsx", "utf8");

  expect(canvas).toContain("Edit machine");
  expect(canvas).toContain("Add state");
  expect(canvas).toContain("Add transition");
  expect(canvas).toContain("onNodeDoubleClick");
  expect(canvas).toContain("onConnect");
  expect(canvas).toContain("Added by you");
  expect(canvas).toContain("deleteTransition");
});
