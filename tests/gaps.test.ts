import { expect, test } from "vitest";

import { computeGaps } from "../lib/gaps";
import { gapCount } from "../lib/gapCount";
import { holeEvidence, type Machine } from "../lib/machine";
import orderCheckout from "./fixtures/order-checkout.machine.json";

const oc: Machine = orderCheckout;

const synthetic: Machine = {
  states: [
    { id: "a", name: "A", isInitial: true, isFinal: false, evidence: [1] },
    { id: "b", name: "B", isInitial: false, isFinal: false, evidence: [1] },
    { id: "c", name: "C", isInitial: false, isFinal: true, evidence: [1] },
    { id: "orphan", name: "Orphan", isInitial: false, isFinal: false, evidence: [1] },
    { id: "sink", name: "Sink", isInitial: false, isFinal: false, evidence: [1] },
  ],
  events: [
    { id: "e1", name: "E1", surfaceForms: ["e1"], evidence: [1] },
    { id: "e2", name: "E2", surfaceForms: ["e2"], evidence: [1] },
  ],
  transitions: [
    { from: "a", event: "e1", to: "b", evidence: [1] },
    { from: "b", event: "e2", to: "c", evidence: [1] },
    { from: "orphan", event: "e1", to: "sink", evidence: [1] },
  ],
};

const evidenceFixture: Machine = {
  states: [
    { id: "s", name: "S", isInitial: true, isFinal: false, evidence: [4, 2] },
  ],
  events: [
    { id: "e", name: "E", surfaceForms: ["e"], evidence: [5, 2] },
  ],
  transitions: [],
};

test("order-checkout: the complete literal hole set (hand-derived, state order then event order)", () => {
  const gaps = computeGaps(oc);

  expect(gaps.missingTransitions).toEqual([
    { stateId: "cart", eventId: "payment_succeeded" },
    { stateId: "cart", eventId: "payment_failed" },
    { stateId: "cart", eventId: "handed_to_courier" },
    { stateId: "processing", eventId: "checkout" },
    { stateId: "processing", eventId: "cancel" },
    { stateId: "processing", eventId: "handed_to_courier" },
    { stateId: "paid", eventId: "checkout" },
    { stateId: "paid", eventId: "payment_succeeded" },
    { stateId: "paid", eventId: "payment_failed" },
    { stateId: "paid", eventId: "cancel" },
  ]);
  expect(gaps.unreachableStateIds).toEqual([]);
  expect(gaps.deadEndStateIds).toEqual([]);
});

test("synthetic topology: exact unreachable and dead-end sets", () => {
  const gaps = computeGaps(synthetic);

  expect(gaps.unreachableStateIds).toEqual(["orphan", "sink"]);
  expect(gaps.deadEndStateIds).toEqual(["sink"]);
});

test("gap total counts each structurally affected state once across unreachable and dead-end categories", () => {
  const gaps = computeGaps(synthetic);

  expect(gapCount(gaps)).toBe(gaps.missingTransitions.length + 2);
});

test("final states contribute no rows", () => {
  const rows = computeGaps(oc).missingTransitions.map((hole) => hole.stateId);

  expect(rows).not.toContain("cancelled");
  expect(rows).not.toContain("shipped");
});

test("deterministic ordering: first hole is cart+payment_succeeded", () => {
  expect(computeGaps(oc).missingTransitions[0]).toEqual({
    stateId: "cart",
    eventId: "payment_succeeded",
  });
});

test("holeEvidence: sorted dedup union", () => {
  expect(holeEvidence(evidenceFixture, { stateId: "s", eventId: "e" })).toEqual([2, 4, 5]);
  expect(holeEvidence(oc, { stateId: "processing", eventId: "cancel" })).toEqual([2, 5]);
});
