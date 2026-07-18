import { expect, test } from "vitest";

import type { Machine } from "../lib/machine";
import { buildFlowElements } from "../src/components/flowLayout";
import fixture from "./fixtures/order-checkout.machine.json";

test("Sample 1 converts to five state nodes, five drawn edges, and one ghost edge", () => {
  const machine = fixture as Machine;
  const elements = buildFlowElements(
    machine,
    { stateId: "processing", eventId: "cancel" },
    "processing\u0000cancel",
  );

  expect(elements.nodes.filter((node) => node.type === "state")).toHaveLength(5);
  expect(elements.edges.filter((edge) => edge.type === "machine")).toHaveLength(5);
  expect(elements.edges.filter((edge) => edge.type === "ghost")).toEqual([
    expect.objectContaining({
      source: "processing",
      data: { eventName: "Cancel", selected: true },
    }),
  ]);
  expect(elements.nodes.find((node) => node.id === "cart")?.data).toMatchObject({ initial: true });
  expect(elements.nodes.find((node) => node.id === "cancelled")?.data).toMatchObject({ final: true });
});

test("an all-final single-state machine still receives finite dagre coordinates", () => {
  const elements = buildFlowElements({
    states: [{ id: "idle", name: "Idle", isInitial: true, isFinal: true, evidence: [1] }],
    events: [],
    transitions: [],
  }, null, null);

  expect(Number.isFinite(elements.nodes[0].position.x)).toBe(true);
  expect(Number.isFinite(elements.nodes[0].position.y)).toBe(true);
});

test.each([
  { stateId: "cart", eventId: "payment_succeeded" },
  { stateId: "processing", eventId: "cancel" },
  { stateId: "paid", eventId: "checkout" },
])("ghost placement for $stateId x $eventId does not cover a state", (ghostHole) => {
  const elements = buildFlowElements(fixture as Machine, ghostHole, null);
  const ghost = elements.nodes.find((node) => node.type === "ghost");
  expect(ghost).toBeDefined();

  const ghostWidth = Number(ghost?.style?.width);
  const ghostHeight = Number(ghost?.style?.height);
  for (const state of elements.nodes.filter((node) => node.type === "state")) {
    const stateWidth = Number(state.style?.width);
    const stateHeight = Number(state.style?.height);
    const overlaps = ghost!.position.x < state.position.x + stateWidth
      && ghost!.position.x + ghostWidth > state.position.x
      && ghost!.position.y < state.position.y + stateHeight
      && ghost!.position.y + ghostHeight > state.position.y;
    expect(overlaps).toBe(false);
  }
});
