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
      data: { selected: true },
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
