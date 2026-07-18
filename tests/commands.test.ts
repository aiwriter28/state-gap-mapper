import { describe, expect, test } from "vitest";

import {
  addState,
  addTransition,
  deleteState,
  deleteTransition,
  mergeEvents,
  renameEvent,
  renameState,
  setInitial,
  toggleFinal,
} from "../lib/commands";
import { computeGaps } from "../lib/gaps";
import type { Machine } from "../lib/machine";
import fixture from "./fixtures/order-checkout.machine.json";

const orderMachine = fixture as Machine;

function resultMachine(result: ReturnType<typeof addState>): Machine {
  if (!result.ok) throw new Error(result.error.message);
  return result.machine;
}

function expectError(
  result: ReturnType<typeof addState>,
  code: string,
  original: Machine,
): void {
  expect(result).toMatchObject({ ok: false, error: { code } });
  expect(original).toEqual(original);
}

describe("validated machine commands", () => {
  test("adds slugified user state, suffixes collisions, and rejects blank or oversized names", () => {
    const added = addState(orderMachine, { name: "Awaiting Review" });
    const first = resultMachine(added);
    expect(first.states.at(-1)).toEqual({
      id: "awaiting_review",
      name: "Awaiting Review",
      isInitial: false,
      isFinal: false,
      evidence: [],
      userAdded: true,
    });

    const colliding = resultMachine(addState(first, { name: "Awaiting review" }));
    expect(colliding.states.at(-1)?.id).toBe("awaiting_review_2");

    const before = structuredClone(colliding);
    expectError(addState(colliding, { name: " ... ! " }), "blank_name", colliding);
    expect(colliding).toEqual(before);
    expectError(addState(colliding, { name: "x".repeat(65) }), "too_large", colliding);
    expect(colliding).toEqual(before);
  });

  test("preserves ids while renaming states and events and reports stale ids", () => {
    const renamedState = resultMachine(renameState(orderMachine, { id: "processing", name: "In progress" }));
    expect(renamedState.states.find((state) => state.id === "processing")?.name).toBe("In progress");
    expect(resultMachine(renameEvent(renamedState, { id: "cancel", name: "Cancel order" }))
      .events.find((event) => event.id === "cancel")?.name).toBe("Cancel order");

    const before = structuredClone(orderMachine);
    expectError(renameState(orderMachine, { id: "gone", name: "Gone" }), "unknown_id", orderMachine);
    expectError(renameEvent(orderMachine, { id: "cancel", name: "  " }), "blank_name", orderMachine);
    expect(orderMachine).toEqual(before);
  });

  test("merges event data and rewrites transition event ids without losing evidence", () => {
    const machine: Machine = {
      states: [
        { id: "a", name: "A", isInitial: true, isFinal: false, evidence: [1] },
        { id: "done", name: "Done", isInitial: false, isFinal: true, evidence: [2] },
      ],
      events: [
        { id: "retry", name: "Retry", surfaceForms: ["retry", "again"], evidence: [1] },
        { id: "try_again", name: "Try again", surfaceForms: ["again", "repeat"], evidence: [2, 1] },
      ],
      transitions: [{ from: "a", event: "retry", to: "done", evidence: [1] }],
    };
    const merged = resultMachine(mergeEvents(machine, { sourceId: "retry", targetId: "try_again" }));
    expect(merged.events).toEqual([{
      id: "try_again",
      name: "Try again",
      surfaceForms: ["again", "repeat", "retry"],
      evidence: [1, 2],
    }]);
    expect(merged.transitions).toEqual([{ from: "a", event: "try_again", to: "done", evidence: [1] }]);
  });

  test("rejects nondeterministic merges and over-cap surface-form unions atomically", () => {
    const collision: Machine = {
      states: [
        { id: "a", name: "A", isInitial: true, isFinal: false, evidence: [1] },
        { id: "done", name: "Done", isInitial: false, isFinal: true, evidence: [1] },
      ],
      events: [
        { id: "left", name: "Left", surfaceForms: ["left"], evidence: [1] },
        { id: "right", name: "Right", surfaceForms: ["right"], evidence: [1] },
      ],
      transitions: [
        { from: "a", event: "left", to: "done", evidence: [1] },
        { from: "a", event: "right", to: "done", evidence: [1] },
      ],
    };
    const beforeCollision = structuredClone(collision);
    expectError(mergeEvents(collision, { sourceId: "left", targetId: "right" }), "nondeterministic", collision);
    expect(collision).toEqual(beforeCollision);

    const forms: Machine = {
      ...collision,
      transitions: [{ from: "a", event: "left", to: "done", evidence: [1] }],
      events: [
        { id: "left", name: "Left", surfaceForms: Array.from({ length: 6 }, (_, index) => `left ${index}`), evidence: [1] },
        { id: "right", name: "Right", surfaceForms: Array.from({ length: 5 }, (_, index) => `right ${index}`), evidence: [1] },
      ],
    };
    const beforeForms = structuredClone(forms);
    expectError(mergeEvents(forms, { sourceId: "left", targetId: "right" }), "too_large", forms);
    expect(forms).toEqual(beforeForms);
  });

  test("deletes noninitial state with incident edges, changes initial and final status safely", () => {
    const deleted = resultMachine(deleteState(orderMachine, { id: "paid" }));
    expect(deleted.states.map((state) => state.id)).not.toContain("paid");
    expect(deleted.transitions.some((transition) => transition.from === "paid" || transition.to === "paid")).toBe(false);

    const before = structuredClone(orderMachine);
    expectError(deleteState(orderMachine, { id: "cart" }), "initial_required", orderMachine);
    expect(orderMachine).toEqual(before);

    const initial = resultMachine(setInitial(orderMachine, { id: "processing" }));
    expect(initial.states.filter((state) => state.isInitial).map((state) => state.id)).toEqual(["processing"]);
    expectError(toggleFinal(orderMachine, { id: "processing" }), "final_outgoing", orderMachine);
    const final = resultMachine(toggleFinal(orderMachine, { id: "cancelled" }));
    expect(final.states.find((state) => state.id === "cancelled")?.isFinal).toBe(false);
  });

  test("adds transitions with existing and new events, rejects duplicate and final sources, and deletes by pair", () => {
    const filled = resultMachine(addTransition(orderMachine, {
      from: "processing",
      to: "cancelled",
      event: { kind: "existing", id: "cancel" },
    }));
    expect(filled.transitions).toContainEqual({
      from: "processing", event: "cancel", to: "cancelled", evidence: [], userAdded: true,
    });
    expect(computeGaps(filled).missingTransitions).not.toContainEqual({ stateId: "processing", eventId: "cancel" });

    const withEvent = resultMachine(addTransition(filled, {
      from: "processing",
      to: "cart",
      event: { kind: "new", name: "Payment timeout" },
    }));
    expect(withEvent.events.at(-1)).toEqual({
      id: "payment_timeout", name: "Payment timeout", surfaceForms: ["Payment timeout"], evidence: [], userAdded: true,
    });
    expect(withEvent.transitions.at(-1)?.event).toBe("payment_timeout");

    const before = structuredClone(filled);
    expectError(addTransition(filled, {
      from: "processing", to: "cancelled", event: { kind: "existing", id: "cancel" },
    }), "nondeterministic", filled);
    expectError(addTransition(filled, {
      from: "cancelled", to: "cart", event: { kind: "existing", id: "cancel" },
    }), "final_outgoing", filled);
    expectError(addTransition(filled, {
      from: "missing", to: "cart", event: { kind: "existing", id: "cancel" },
    }), "unknown_id", filled);
    expect(filled).toEqual(before);

    const deleted = resultMachine(deleteTransition(filled, { from: "processing", eventId: "cancel" }));
    expect(deleted.transitions.some((transition) => transition.from === "processing" && transition.event === "cancel")).toBe(false);
    expect(computeGaps(deleted).missingTransitions).toContainEqual({ stateId: "processing", eventId: "cancel" });

    const noInbound = resultMachine(deleteTransition(orderMachine, { from: "cart", eventId: "checkout" }));
    expect(computeGaps(noInbound).unreachableStateIds).toContain("processing");
  });

  test("enforces all state caps without truncation and reports unknown ids atomically", () => {
    const thirty: Machine = {
      states: Array.from({ length: 30 }, (_, index) => ({
        id: `s${index}`, name: `State ${index}`, isInitial: index === 0, isFinal: false, evidence: [1],
      })),
      events: [],
      transitions: [],
    };
    const before = structuredClone(thirty);
    expectError(addState(thirty, { name: "Thirty first" }), "too_large", thirty);
    expect(thirty).toEqual(before);
    expectError(deleteTransition(thirty, { from: "s0", eventId: "missing" }), "unknown_id", thirty);
    expect(thirty).toEqual(before);
  });

  test("rejects 31st event, 201st transition, and over-cap evidence without changing a candidate", () => {
    const states = Array.from({ length: 30 }, (_, index) => ({
      id: `s${index}`, name: `State ${index}`, isInitial: index === 0, isFinal: false, evidence: [1],
    }));
    const events = Array.from({ length: 30 }, (_, index) => ({
      id: `e${index}`, name: `Event ${index}`, surfaceForms: [`event ${index}`], evidence: [1],
    }));
    const maxedEvents: Machine = { states: states.slice(0, 2), events, transitions: [] };
    const eventsBefore = structuredClone(maxedEvents);
    expectError(addTransition(maxedEvents, {
      from: "s0", to: "s1", event: { kind: "new", name: "New event" },
    }), "too_large", maxedEvents);
    expect(maxedEvents).toEqual(eventsBefore);

    const maxedTransitions: Machine = {
      states,
      events,
      transitions: Array.from({ length: 200 }, (_, index) => ({
        from: `s${Math.floor(index / 30)}`,
        event: `e${index % 30}`,
        to: "s0",
        evidence: [1],
      })),
    };
    const transitionsBefore = structuredClone(maxedTransitions);
    expectError(addTransition(maxedTransitions, {
      from: "s6", to: "s0", event: { kind: "existing", id: "e20" },
    }), "too_large", maxedTransitions);
    expect(maxedTransitions).toEqual(transitionsBefore);

    const evidenceOverCap: Machine = {
      ...orderMachine,
      states: [{ ...orderMachine.states[0], evidence: Array.from({ length: 21 }, (_, index) => index + 1) }, ...orderMachine.states.slice(1)],
    };
    const evidenceBefore = structuredClone(evidenceOverCap);
    expectError(addState(evidenceOverCap, { name: "Still blocked" }), "too_large", evidenceOverCap);
    expect(evidenceOverCap).toEqual(evidenceBefore);
  });
});
