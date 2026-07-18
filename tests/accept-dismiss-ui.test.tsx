// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { Machine } from "../lib/machine";
import { GapPanel } from "../src/components/GapPanel";
import { StubsPanel } from "../src/components/StubsPanel";
import { appStore, type ExtractionResponse } from "../src/store";
import fixture from "./fixtures/order-checkout.machine.json";

const orderMachine = fixture as Machine;
const orderResponse: ExtractionResponse = { kind: "machine", machine: orderMachine, sentences: [] };

beforeEach(() => {
  appStore.setState({ sessionSeq: appStore.getState().sessionSeq + 1, draftSpec: "Sample 1" });
  appStore.getState().applyExtraction(orderResponse, appStore.getState().sessionSeq, "Sample 1");
});

afterEach(() => cleanup());

test("Accept opens a keyboard-operable target picker and Dismiss is a real button", async () => {
  const user = userEvent.setup();
  render(<GapPanel />);
  const accept = screen.getAllByRole("button", { name: "Accept" }).find((button) =>
    button.closest("article")?.textContent?.includes("processing x cancel"),
  );
  const dismiss = screen.getAllByRole("button", { name: "Dismiss" }).find((button) =>
    button.closest("article")?.textContent?.includes("processing x cancel"),
  );
  expect(accept).toBeDefined();
  expect(dismiss).toBeDefined();

  await user.click(accept!);
  const dialog = screen.getByRole("dialog", { name: "Accept Missing Transition" });
  const existingTarget = screen.getByRole("radio", { name: "Existing state" });
  existingTarget.focus();
  await user.keyboard("{Shift>}{Tab}{/Shift}");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  const confirm = screen.getByRole("button", { name: "Confirm Accept" }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  await user.selectOptions(screen.getByRole("combobox", { name: "Target state" }), "cancelled");
  expect(confirm.disabled).toBe(false);
  await user.keyboard("{Enter}");
  expect(screen.queryByRole("dialog", { name: "Accept Missing Transition" })).toBeNull();
  expect(appStore.getState().stubs).toHaveLength(1);

  const nextDismiss = screen.getAllByRole("button", { name: "Dismiss" })[0];
  await user.click(nextDismiss);
  expect(screen.getByRole("heading", { name: "Dismissed" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Undo cart x payment_succeeded" })).not.toBeNull();
});

test("Escape closes the accept picker and Copy reports success or its selectable-text fallback", async () => {
  const user = userEvent.setup();
  render(<GapPanel />);
  const accept = screen.getAllByRole("button", { name: "Accept" })[0];
  await user.click(accept);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();

  appStore.setState({
    stubs: [{
      stateId: "processing",
      eventId: "cancel",
      targetStateId: "cancelled",
      evidence: [2, 5],
      text: "# Evidence: sentences 2, 5\nGiven the system is in state Processing\nWhen cancel occurs\nThen the system moves to Cancelled",
    }],
  });
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<StubsPanel />);
  expect(document.querySelector(".stub-code")?.textContent).toBe(
    "# Evidence: sentences 2, 5\nGiven the system is in state Processing\nWhen cancel occurs\nThen the system moves to Cancelled",
  );
  await user.click(screen.getByRole("button", { name: "Copy Test Stub" }));
  expect(screen.getByRole("status").textContent).toBe("Copied");

  writeText.mockRejectedValueOnce(new Error("blocked"));
  await user.click(screen.getByRole("button", { name: "Copy Test Stub" }));
  expect(screen.getByRole("status").textContent).toBe("Copy failed, select the text manually");
});
