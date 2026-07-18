// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { Machine } from "../lib/machine";
import { Canvas } from "../src/components/Canvas";
import { appStore, type ExtractionResponse } from "../src/store";
import fixture from "./fixtures/order-checkout.machine.json";

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    BaseEdge: () => null,
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => children,
    Handle: () => null,
    MarkerType: { ArrowClosed: "arrowclosed" },
    Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
    ReactFlow: ({
      nodes,
      nodeTypes,
      onNodeDoubleClick,
    }: {
      nodes: Array<{ id: string; type?: string; data: { label?: string } }>;
      nodeTypes?: Record<string, React.ComponentType<{ data: { label?: string } }>>;
      onNodeDoubleClick?: (event: React.MouseEvent, node: { id: string }) => void;
    }) => {
      const ghost = nodes.find((node) => node.type === "ghost");
      const GhostNode = nodeTypes?.ghost;
      return React.createElement(
        "div",
        { "aria-label": "Editable state machine" },
        nodes.filter((node) => node.type === "state").map((node) => React.createElement(
          "button",
          {
            key: node.id,
            type: "button",
            onDoubleClick: (event: React.MouseEvent) => onNodeDoubleClick?.(event, node),
          },
          node.data.label,
        )),
        React.createElement("output", { "data-testid": "active-ghost" }, ghost?.id ?? "none"),
        ghost !== undefined && GhostNode !== undefined
          ? React.createElement(GhostNode, { data: ghost.data })
          : null,
      );
    },
    getBezierPath: () => [""],
    getSmoothStepPath: () => ["", 0, 0],
  };
});

const orderMachine = fixture as Machine;
const orderResponse: ExtractionResponse = {
  kind: "machine",
  machine: orderMachine,
  sentences: [],
};

beforeEach(() => {
  appStore.setState({ sessionSeq: appStore.getState().sessionSeq + 1, draftSpec: "Sample 1" });
  appStore.getState().applyExtraction(orderResponse, appStore.getState().sessionSeq, "Sample 1");
});

afterEach(() => cleanup());

test("the canvas follows the selected gap and otherwise shows the highest-ranked visible gap", () => {
  const displayHoles = appStore.getState().displayHoles;
  const fallback = displayHoles.find((hole) => hole.stateId === "paid" && hole.eventId === "checkout");
  expect(fallback).toBeDefined();
  appStore.setState({
    displayHoles: [fallback!, ...displayHoles.filter((hole) => hole !== fallback)],
    selectedHoleKey: null,
  });
  render(<Canvas />);

  expect(screen.getByTestId("active-ghost").textContent).toBe("ghost-paid-checkout");

  act(() => appStore.getState().selectHole({ stateId: "cart", eventId: "payment_succeeded" }));
  expect(screen.getByTestId("active-ghost").textContent).toBe("ghost-cart-payment_succeeded");
  expect(screen.getByText("Target state missing")).not.toBeNull();
});

test("double-clicking a Sample 1 node opens rename with its full name focused and selected", async () => {
  const user = userEvent.setup();
  render(<Canvas />);

  await user.dblClick(screen.getByRole("button", { name: "Processing" }));

  const stateName = screen.getByRole("textbox", { name: "State name" }) as HTMLInputElement;
  expect(document.activeElement).toBe(stateName);
  expect(stateName.value).toBe("Processing");
  expect(stateName.selectionStart).toBe(0);
  expect(stateName.selectionEnd).toBe("Processing".length);
});

test("the inspector-only keyboard path renames a state through validated store dispatch", async () => {
  const user = userEvent.setup();
  render(<Canvas />);

  await user.click(screen.getByRole("button", { name: "Edit machine" }));
  const stateName = screen.getByRole("textbox", { name: "State name" }) as HTMLInputElement;
  stateName.focus();
  await user.keyboard("{Control>}a{/Control}Shopping cart");
  const rename = screen.getByRole("button", { name: "Rename state" });
  rename.focus();
  await user.keyboard("{Enter}");

  expect(appStore.getState().machine?.states.find((state) => state.id === "cart")?.name).toBe("Shopping cart");
});
