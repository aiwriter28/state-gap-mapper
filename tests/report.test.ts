import { expect, test } from "vitest";

import { decodeProject } from "../lib/projectFile";
import { renderReport } from "../lib/report";

test("report is deterministic, complete, and contains no executable imported Markdown", () => {
  const hostile = "# heading | [link](https://evil.example) <img src=x> `tick`\u202E";
  const decoded = decodeProject({
    format: "state-gap-mapper-project",
    version: 1,
    exportedAt: "2026-07-20T12:00:00.000Z",
    spec: { active: hostile, draft: hostile },
    sentences: [{ index: 1, text: hostile }],
    machine: {
      states: [{ id: "cart", name: "Cart | <x>", isInitial: true, isFinal: false, evidence: [1] }],
      events: [],
      transitions: [],
    },
    canvasEdited: false,
    analysis: { ranks: [], suggestedEvents: [], rankTruncated: false },
    decisions: {
      dismissedPairs: [],
      acceptedSuggestedEvents: [],
      testStubs: [{ stateId: "deleted", eventId: "gone", targetStateId: null, evidence: [1], text: "Given ~~~\nThen ```" }],
    },
  });
  if (!decoded.ok) throw new Error(`${decoded.path} ${decoded.reason}`);

  const first = renderReport(decoded.value);
  expect(renderReport(decoded.value)).toBe(first);
  expect(first).toContain("# State Gap Mapper Report");
  expect(first).toContain("## Structural Gaps");
  expect(first).toContain("## User Decisions");
  expect(first).toContain("Deleted from current machine");
  expect(first).not.toContain("\u202E");
  expect(first.endsWith("\n")).toBe(true);
  const hostileHeading = first.indexOf("# heading");
  expect(hostileHeading).toBeGreaterThan(0);
  expect(first.slice(0, hostileHeading)).toMatch(/`{3,}\n$/);
});
