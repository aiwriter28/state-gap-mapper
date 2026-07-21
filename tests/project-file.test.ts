import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  createProject,
  decodeProject,
  serializeProject,
  type ProjectSnapshot,
} from "../lib/projectFile";

const golden = JSON.parse(readFileSync("tests/fixtures/project-v1.json", "utf8")) as unknown;

describe("project file version 1", () => {
  test("accepts the committed golden fixture and serializes deterministically", () => {
    const decoded = decodeProject(golden);
    expect(decoded).toMatchObject({ ok: true });
    if (!decoded.ok) return;

    const serialized = serializeProject(decoded.value);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    expect(serialized.text.endsWith("\n")).toBe(true);
    expect(serialized.text.endsWith("\n\n")).toBe(false);
    expect(JSON.parse(serialized.text)).toEqual(golden);
  });

  test("fails closed on wrong format, versions, extra fields, and sentence drift", () => {
    expect(decodeProject(null)).toMatchObject({ ok: false, code: "wrong_format" });
    expect(decodeProject({ ...(golden as object), format: "generic" })).toMatchObject({
      ok: false,
      code: "wrong_format",
    });
    expect(decodeProject({ ...(golden as object), version: 2 })).toMatchObject({
      ok: false,
      code: "unsupported_version",
    });
    expect(decodeProject({ ...(golden as object), extra: true })).toMatchObject({
      ok: false,
      code: "invalid",
      path: "$",
    });
    expect(decodeProject({
      ...(golden as Record<string, unknown>),
      sentences: [{ index: 1, text: "Corrupted." }],
    })).toMatchObject({ ok: false, code: "invalid", path: "$.sentences" });
  });

  test("round trip preserves every non-derived field and canonical ordering", () => {
    const decoded = decodeProject(golden);
    if (!decoded.ok) throw new Error("fixture should decode");
    const snapshot: ProjectSnapshot = {
      activeSpec: decoded.value.spec.active,
      draftSpec: "An unmapped next draft.",
      sentences: decoded.value.sentences,
      machine: decoded.value.machine,
      dirty: true,
      ranks: [],
      suggestedEvents: [],
      rankTruncated: true,
      dismissedPairKeys: new Set(),
      acceptedSuggestedEventIds: new Map([["zeta", "cart"], ["alpha", "cart"]]),
      stubs: [],
    };

    const created = createProject(snapshot, new Date("2026-07-20T12:34:56.789Z"));
    expect(created).toMatchObject({
      ok: true,
      value: {
        exportedAt: "2026-07-20T12:34:56.789Z",
        spec: { active: decoded.value.spec.active, draft: "An unmapped next draft." },
        canvasEdited: true,
        analysis: { rankTruncated: true },
        decisions: {
          acceptedSuggestedEvents: [
            { suggestionId: "alpha", acceptedEventId: "cart" },
            { suggestionId: "zeta", acceptedEventId: "cart" },
          ],
        },
      },
    });
  });

  test("rejects invalid timestamps, evidence, duplicate decisions, forged provenance, and malformed machines", () => {
    type MutableFixture = Record<string, unknown> & {
      exportedAt: string;
      machine: {
        states: Array<Record<string, unknown>>;
        events: Array<Record<string, unknown>>;
      };
      decisions: {
        dismissedPairs: unknown[];
        acceptedSuggestedEvents: unknown[];
      };
    };
    const copy = () => structuredClone(golden) as MutableFixture;

    const timestamp = copy();
    timestamp.exportedAt = "2026-07-20T12:00:00Z";
    expect(decodeProject(timestamp)).toMatchObject({ ok: false, path: "$.exportedAt" });

    const evidence = copy();
    evidence.machine.states[0].evidence = [2];
    expect(decodeProject(evidence)).toMatchObject({ ok: false, path: "$.machine.states[0].evidence[0]" });

    const duplicate = copy();
    duplicate.machine.events = [{ id: "go", name: "Go", surfaceForms: ["go"], evidence: [1] }];
    duplicate.decisions.dismissedPairs = [
      { stateId: "cart", eventId: "go" },
      { stateId: "cart", eventId: "go" },
    ];
    expect(decodeProject(duplicate)).toMatchObject({ ok: false, path: "$.decisions.dismissedPairs[1]" });

    const provenance = copy();
    provenance.machine.events = [{ id: "go", name: "Go", surfaceForms: ["go"], evidence: [1] }];
    provenance.decisions.acceptedSuggestedEvents = [{ suggestionId: "suggested_go", acceptedEventId: "go" }];
    expect(decodeProject(provenance)).toMatchObject({
      ok: false,
      path: "$.decisions.acceptedSuggestedEvents[0].acceptedEventId",
    });

    const machine = copy();
    machine.machine.states.push({
      id: "cart",
      name: "Duplicate",
      isInitial: false,
      isFinal: false,
      evidence: [1],
    });
    expect(decodeProject(machine)).toMatchObject({ ok: false, code: "invalid" });
  });

  test("maximum reachable version 1 content remains below the shared 8 MiB boundary", () => {
    const escaped = `${"\u0000".repeat(3_999)}A`;
    const states = Array.from({ length: 30 }, (_, index) => ({
      id: `s${index}`,
      name: `${"\u0000".repeat(63)}S`,
      isInitial: index === 0,
      isFinal: false,
      evidence: [1],
    }));
    const events = Array.from({ length: 30 }, (_, index) => ({
      id: `e${index}`,
      name: `${"\u0000".repeat(63)}E`,
      surfaceForms: Array.from({ length: 10 }, (__, form) => `${"\u0000".repeat(63)}${String.fromCharCode(65 + form)}`),
      evidence: [1],
    }));
    const transitions = states.flatMap((state) => events.map((event) => ({
      from: state.id,
      event: event.id,
      to: "s0",
      evidence: [1],
    }))).slice(0, 200);
    const maximum = {
      format: "state-gap-mapper-project",
      version: 1,
      exportedAt: "2026-07-20T12:00:00.000Z",
      spec: { active: escaped, draft: escaped },
      sentences: [{ index: 1, text: escaped }],
      machine: { states, events, transitions },
      canvasEdited: true,
      analysis: {
        ranks: Array.from({ length: 100 }, (_, index) => ({
          stateId: states[Math.floor(index / 30)]!.id,
          eventId: events[index % 30]!.id,
          relevance: 1,
          rationale: `${"\u0000".repeat(299)}R`,
          suggestedTargetStateId: "s0",
        })),
        suggestedEvents: Array.from({ length: 10 }, (_, index) => ({
          id: `suggestion_${index}`,
          name: `${"\u0000".repeat(63)}N`,
          surfaceForms: [`${"\u0000".repeat(63)}F`],
          rationale: `${"\u0000".repeat(299)}R`,
          confidence: 1,
        })),
        rankTruncated: true,
      },
      decisions: {
        dismissedPairs: states.flatMap((state) => events.map((event) => ({ stateId: state.id, eventId: event.id }))),
        acceptedSuggestedEvents: Array.from({ length: 1_000 }, (_, index) => ({
          suggestionId: `remembered_${index}`,
          acceptedEventId: "deleted_event",
        })),
        testStubs: Array.from({ length: 500 }, () => ({
          stateId: "deleted_state",
          eventId: "deleted_event",
          targetStateId: "deleted_target",
          evidence: [1],
          text: `${"\u0000".repeat(1_023)}T`,
        })),
      },
    };
    const decoded = decodeProject(maximum);
    expect(decoded).toMatchObject({ ok: true });
    if (!decoded.ok) return;
    const serialized = serializeProject(decoded.value);
    expect(serialized).toMatchObject({ ok: true });
    if (!serialized.ok) return;
    expect(new TextEncoder().encode(serialized.text).byteLength).toBeLessThan(8 * 1024 * 1024);
  });
});
