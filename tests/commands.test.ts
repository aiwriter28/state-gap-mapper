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

function expectAtomicError(
  original: Machine,
  code: string,
  command: (machine: Machine) => ReturnType<typeof addState>,
): void {
  const before = structuredClone(original);
  const result = command(original);
  expect(result).toMatchObject({ ok: false, error: { code } });
  expect(original).toEqual(before);
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

    expectAtomicError(colliding, "blank_name", (machine) => addState(machine, { name: " ... ! " }));
    expectAtomicError(colliding, "too_large", (machine) => addState(machine, { name: "x".repeat(65) }));
  });

  test("preserves ids while renaming states and events and reports stale ids", () => {
    const renamedState = resultMachine(renameState(orderMachine, { id: "processing", name: "In progress" }));
    expect(renamedState.states.find((state) => state.id === "processing")?.name).toBe("In progress");
    expect(resultMachine(renameEvent(renamedState, { id: "cancel", name: "Cancel order" }))
      .events.find((event) => event.id === "cancel")?.name).toBe("Cancel order");

    expectAtomicError(orderMachine, "unknown_id", (machine) => renameState(machine, { id: "gone", name: "Gone" }));
    expectAtomicError(orderMachine, "blank_name", (machine) => renameEvent(machine, { id: "cancel", name: "  " }));
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
    expectAtomicError(collision, "nondeterministic", (machine) => mergeEvents(machine, { sourceId: "left", targetId: "right" }));
    expectAtomicError(collision, "unknown_id", (machine) => mergeEvents(machine, { sourceId: "missing", targetId: "right" }));
    expectAtomicError(collision, "unknown_id", (machine) => mergeEvents(machine, { sourceId: "left", targetId: "missing" }));

    const forms: Machine = {
      ...collision,
      transitions: [{ from: "a", event: "left", to: "done", evidence: [1] }],
      events: [
        { id: "left", name: "Left", surfaceForms: Array.from({ length: 6 }, (_, index) => `left ${index}`), evidence: [1] },
        { id: "right", name: "Right", surfaceForms: Array.from({ length: 5 }, (_, index) => `right ${index}`), evidence: [1] },
      ],
    };
    expectAtomicError(forms, "too_large", (machine) => mergeEvents(machine, { sourceId: "left", targetId: "right" }));
  });

  test("deletes noninitial state with incident edges, changes initial and final status safely", () => {
    const deleted = resultMachine(deleteState(orderMachine, { id: "paid" }));
    expect(deleted.states.map((state) => state.id)).not.toContain("paid");
    expect(deleted.transitions.some((transition) => transition.from === "paid" || transition.to === "paid")).toBe(false);

    expectAtomicError(orderMachine, "initial_required", (machine) => deleteState(machine, { id: "cart" }));
    expectAtomicError(orderMachine, "unknown_id", (machine) => deleteState(machine, { id: "missing" }));

    const initial = resultMachine(setInitial(orderMachine, { id: "processing" }));
    expect(initial.states.filter((state) => state.isInitial).map((state) => state.id)).toEqual(["processing"]);
    expectAtomicError(orderMachine, "unknown_id", (machine) => setInitial(machine, { id: "missing" }));
    expectAtomicError(orderMachine, "final_outgoing", (machine) => toggleFinal(machine, { id: "processing" }));
    expectAtomicError(orderMachine, "unknown_id", (machine) => toggleFinal(machine, { id: "missing" }));
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

    expectAtomicError(filled, "nondeterministic", (machine) => addTransition(machine, {
      from: "processing", to: "cancelled", event: { kind: "existing", id: "cancel" },
    }));
    expectAtomicError(filled, "final_outgoing", (machine) => addTransition(machine, {
      from: "cancelled", to: "cart", event: { kind: "existing", id: "cancel" },
    }));
    expectAtomicError(filled, "unknown_id", (machine) => addTransition(machine, {
      from: "missing", to: "cart", event: { kind: "existing", id: "cancel" },
    }));
    expectAtomicError(filled, "unknown_id", (machine) => addTransition(machine, {
      from: "processing", to: "missing", event: { kind: "existing", id: "cancel" },
    }));
    expectAtomicError(filled, "unknown_id", (machine) => addTransition(machine, {
      from: "processing", to: "cart", event: { kind: "existing", id: "missing" },
    }));

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
    expectAtomicError(thirty, "too_large", (machine) => addState(machine, { name: "Thirty first" }));
    expectAtomicError(thirty, "unknown_id", (machine) => deleteTransition(machine, { from: "s0", eventId: "missing" }));

    const fullLengthId = "a".repeat(64);
    const suffixOverflow: Machine = {
      states: [{ id: fullLengthId, name: fullLengthId, isInitial: true, isFinal: false, evidence: [1] }],
      events: [],
      transitions: [],
    };
    expectAtomicError(suffixOverflow, "too_large", (machine) => addState(machine, { name: fullLengthId }));
  });

  test("rejects 31st event, 201st transition, and over-cap evidence without changing a candidate", () => {
    const states = Array.from({ length: 30 }, (_, index) => ({
      id: `s${index}`, name: `State ${index}`, isInitial: index === 0, isFinal: false, evidence: [1],
    }));
    const events = Array.from({ length: 30 }, (_, index) => ({
      id: `e${index}`, name: `Event ${index}`, surfaceForms: [`event ${index}`], evidence: [1],
    }));
    const maxedEvents: Machine = { states: states.slice(0, 2), events, transitions: [] };
    expectAtomicError(maxedEvents, "too_large", (machine) => addTransition(machine, {
      from: "s0", to: "s1", event: { kind: "new", name: "New event" },
    }));

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
    expectAtomicError(maxedTransitions, "too_large", (machine) => addTransition(machine, {
      from: "s6", to: "s0", event: { kind: "existing", id: "e20" },
    }));

    const evidenceOverCap: Machine = {
      ...orderMachine,
      states: [{ ...orderMachine.states[0], evidence: Array.from({ length: 21 }, (_, index) => index + 1) }, ...orderMachine.states.slice(1)],
    };
    expectAtomicError(evidenceOverCap, "too_large", (machine) => addState(machine, { name: "Still blocked" }));
  });
});
