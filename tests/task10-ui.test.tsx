// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test } from "vitest";

import type { Machine, Sentence } from "../lib/machine";
import { GapPanel } from "../src/components/GapPanel";
import { SpecPane } from "../src/components/SpecPane";
import { appStore, type ExtractionResponse } from "../src/store";
import fixture from "./fixtures/order-checkout.machine.json";

const orderMachine = fixture as Machine;
const orderSentences: Sentence[] = Array.from({ length: 6 }, (_, index) => ({
  index: index + 1,
  text: `Sentence ${index + 1}.`,
}));
const orderResponse: ExtractionResponse = {
  kind: "machine",
  machine: orderMachine,
  sentences: orderSentences,
};

beforeEach(() => {
  appStore.setState({
    sessionSeq: appStore.getState().sessionSeq + 1,
    draftSpec: orderSentences.map((sentence) => sentence.text).join(" "),
  });
  appStore.getState().applyExtraction(
    orderResponse,
    appStore.getState().sessionSeq,
    orderSentences.map((sentence) => sentence.text).join(" "),
  );
});

afterEach(() => cleanup());

test("SpecPane marks uncovered sentences and reports the mapped count", () => {
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
  appStore.setState({ machine: coverageMachine });

  render(<SpecPane />);

  expect(screen.getByText("4 of 6 sentences mapped")).not.toBeNull();
  expect(document.querySelector('[data-sentence="5"]')?.classList.contains("uncovered")).toBe(true);
  expect(document.querySelector('[data-sentence="5"]')?.getAttribute("title")).toBe(
    "This sentence did not map to any state, event, or transition.",
  );
  expect(document.querySelector('[data-sentence="4"]')?.classList.contains("uncovered")).toBe(false);
});

test("matrix drawer keeps dismissed pairs visible and labels every cell state with text", async () => {
  const user = userEvent.setup();
  render(<GapPanel />);
  expect(screen.getByRole("heading", { name: /Gaps \(10\)/ })).not.toBeNull();

  await user.click(screen.getByRole("button", { name: /Structural Gap processing x cancel/i }));
  const flagshipDismiss = screen.getAllByRole("button", { name: "Dismiss" }).find((button) =>
    button.closest("article")?.textContent?.includes("processing x cancel"),
  );
  await user.click(flagshipDismiss!);

  expect(screen.getByRole("heading", { name: /Gaps \(9\)/ })).not.toBeNull();
  const openMatrix = screen.getByRole("button", { name: "Show all 10 undefined pairs" });
  await user.click(openMatrix);

  const dialog = screen.getByRole("dialog", { name: "State x event matrix" });
  expect(within(dialog).getByRole("cell", { name: "Cart, Checkout: defined" })).not.toBeNull();
  expect(within(dialog).getByRole("cell", { name: "Processing, Cancel: dismissed" })).not.toBeNull();
  expect(within(dialog).getByRole("cell", { name: "Paid, Cancel: Missing Transition" })).not.toBeNull();
  expect(within(dialog).getByRole("cell", { name: "Cancelled, Checkout: not applicable" })).not.toBeNull();

  await user.click(within(dialog).getByRole("button", { name: "Close matrix" }));
  expect(screen.queryByRole("dialog", { name: "State x event matrix" })).toBeNull();
});
