import { expect, test } from "vitest";

import type { Gaps, Machine } from "../lib/machine";
import {
  selectActiveGapCount,
  stateEventMatrix,
  uncoveredSentences,
} from "../lib/selectors";

const coverageMachine: Machine = {
  states: [
    { id: "draft", name: "Draft", isInitial: true, isFinal: false, evidence: [1] },
    { id: "done", name: "Done", isInitial: false, isFinal: true, evidence: [2] },
  ],
  events: [
    { id: "finish", name: "Finish", surfaceForms: ["finish"], evidence: [3] },
  ],
  transitions: [
    { from: "draft", event: "finish", to: "done", evidence: [4] },
  ],
};

test("uncoveredSentences returns every unreferenced 1-based sentence in order", () => {
  expect(uncoveredSentences(coverageMachine, 6)).toEqual([5, 6]);
});

test("stateEventMatrix applies defined, not-applicable, dismissed, then hole precedence", () => {
  const machine: Machine = {
    states: [
      { id: "working", name: "Working", isInitial: true, isFinal: false, evidence: [1] },
      { id: "done", name: "Done", isInitial: false, isFinal: true, evidence: [2] },
    ],
    events: [
      { id: "finish", name: "Finish", surfaceForms: ["finish"], evidence: [1] },
      { id: "cancel", name: "Cancel", surfaceForms: ["cancel"], evidence: [2] },
      { id: "retry", name: "Retry", surfaceForms: ["retry"], evidence: [3] },
    ],
    transitions: [
      { from: "working", event: "finish", to: "done", evidence: [1] },
      // Invalid at the domain boundary by design; included here to lock selector precedence.
      { from: "done", event: "finish", to: "done", evidence: [1] },
    ],
  };
  const dismissed = new Set([
    "working\u0000finish",
    "working\u0000cancel",
    "done\u0000retry",
  ]);

  expect(stateEventMatrix(machine, dismissed)).toEqual([
    {
      stateId: "working",
      cells: [
        { stateId: "working", eventId: "finish", status: "defined" },
        { stateId: "working", eventId: "cancel", status: "dismissed" },
        { stateId: "working", eventId: "retry", status: "hole" },
      ],
    },
    {
      stateId: "done",
      cells: [
        { stateId: "done", eventId: "finish", status: "defined" },
        { stateId: "done", eventId: "cancel", status: "not-applicable" },
        { stateId: "done", eventId: "retry", status: "not-applicable" },
      ],
    },
  ]);
});

test("selectActiveGapCount excludes dismissed display holes and de-duplicates affected states", () => {
  const gaps: Gaps = {
    missingTransitions: [
      { stateId: "working", eventId: "finish" },
      { stateId: "working", eventId: "cancel" },
      { stateId: "orphan", eventId: "finish" },
    ],
    unreachableStateIds: ["orphan", "sink"],
    deadEndStateIds: ["sink"],
  };

  expect(selectActiveGapCount({
    displayHoles: [
      { stateId: "working", eventId: "finish", rank: null },
      { stateId: "orphan", eventId: "finish", rank: null },
    ],
    gaps,
  })).toBe(4);
});
