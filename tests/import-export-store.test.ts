import { readFileSync } from "node:fs";

import { expect, test, vi } from "vitest";

import { decodeProject } from "../lib/projectFile";
import type { SuggestedEvent } from "../lib/machine";
import {
  createAppStore,
  type ExtractionResponse,
  type LlmClient,
  type RankResponse,
} from "../src/store";

const noCalls: LlmClient = {
  extract: vi.fn((): Promise<ExtractionResponse> => new Promise(() => undefined)),
  rank: vi.fn((): Promise<RankResponse> => new Promise(() => undefined)),
};

test("project hydration is atomic, recomputes derived state, and invalidates every async guard", () => {
  const decoded = decodeProject(JSON.parse(readFileSync("tests/fixtures/project-v1.json", "utf8")));
  if (!decoded.ok) throw new Error("fixture should decode");
  const store = createAppStore(noCalls);
  store.setState({ sessionSeq: 4, rankSeq: 7, machineRev: 9, rankPending: true });

  store.getState().hydrateProject({
    ...decoded.value,
    spec: { ...decoded.value.spec, draft: "An unmapped next draft." },
    canvasEdited: true,
  });

  expect(store.getState()).toMatchObject({
    activeSpec: "A new order starts in Cart.",
    draftSpec: "An unmapped next draft.",
    dirty: true,
    editorOpen: true,
    sessionSeq: 5,
    rankSeq: 8,
    machineRev: 10,
    rankPending: false,
    phase: "idle",
  });
  expect(store.getState().gaps.deadEndStateIds).toEqual(["cart"]);
  expect(noCalls.extract).not.toHaveBeenCalled();
  expect(noCalls.rank).not.toHaveBeenCalled();
});

test("text import changes only the draft and opens the editor", () => {
  const store = createAppStore(noCalls);
  const before = store.getState();
  store.getState().importSpecDraft("Imported exact\r\nsource");
  expect(store.getState()).toMatchObject({ draftSpec: "Imported exact\r\nsource", editorOpen: true });
  expect(store.getState().machine).toBe(before.machine);
  expect(noCalls.extract).not.toHaveBeenCalled();
});

test("project-only action caps fail atomically", () => {
  const decoded = decodeProject(JSON.parse(readFileSync("tests/fixtures/project-v1.json", "utf8")));
  if (!decoded.ok) throw new Error("fixture should decode");
  const store = createAppStore(noCalls);
  store.getState().hydrateProject(decoded.value);
  store.setState({
    acceptedSuggestedEventIds: new Map(Array.from({ length: 1_000 }, (_, index) => [`s${index}`, "missing"])),
  });
  const suggestion: SuggestedEvent = {
    id: "new_suggestion",
    name: "New suggestion",
    surfaceForms: ["new suggestion"],
    rationale: "Useful.",
    confidence: 0.5,
  };
  const machineBefore = store.getState().machine;
  expect(store.getState().acceptSuggestedEvent(suggestion)).toMatchObject({ ok: false, error: { code: "too_large" } });
  expect(store.getState().machine).toBe(machineBefore);
});
