// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test } from "vitest";

import type { Machine, RankedHole, Sentence } from "../lib/machine";
import { App } from "../src/App";
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
  const spec = orderSentences.map((sentence) => sentence.text).join(" ");
  appStore.setState({
    sessionSeq: appStore.getState().sessionSeq + 1,
    draftSpec: spec,
    suggestedEvents: [],
  });
  appStore.getState().applyExtraction(orderResponse, appStore.getState().sessionSeq, spec);
});

afterEach(() => cleanup());

test("Structural Gaps use one keyboard-expandable detail card and keep evidence selected", async () => {
  const user = userEvent.setup();
  render(<><SpecPane /><GapPanel /></>);

  expect(document.querySelectorAll(".gap-card.expanded")).toHaveLength(1);
  expect(document.querySelectorAll(".gap-card.compact")).toHaveLength(9);

  const flagship = screen.getByRole("button", { name: /Structural Gap processing x cancel/i });
  await user.click(flagship);

  expect(flagship.closest("article")?.classList.contains("expanded")).toBe(true);
  expect(document.querySelectorAll(".gap-card.expanded")).toHaveLength(1);
  expect(appStore.getState().highlightedEvidence).toEqual([2, 5]);
  expect(document.querySelector('[data-sentence="2"]')?.classList.contains("selected")).toBe(true);
  expect(document.querySelector('[data-sentence="5"]')?.classList.contains("selected")).toBe(true);

  await user.click(flagship);
  expect(appStore.getState().highlightedEvidence).toEqual([2, 5]);
});

test("ranked Structural Gaps render the approved Redline label and short Relevance meter", () => {
  const current = appStore.getState().displayHoles;
  const first = current[0];
  const rank: RankedHole = {
    stateId: first.stateId,
    eventId: first.eventId,
    relevance: 0.92,
    rationale: "The behavior should be explicit.",
    suggestedTargetStateId: "processing",
  };
  appStore.setState({ displayHoles: [{ ...first, rank }, ...current.slice(1)] });

  render(<GapPanel />);

  expect(document.querySelector(".redline-label")?.textContent).toContain("Redline");
  expect(document.querySelector(".relevance-track")).not.toBeNull();
  expect(document.querySelector(".relevance-value")?.textContent).toBe("0.92");
});

test("Suggested Events remain visually and textually distinct, and Docs is a real link", () => {
  appStore.setState({
    suggestedEvents: [{
      id: "payment_timeout",
      name: "Payment timeout",
      surfaceForms: ["payment times out"],
      rationale: "Payment attempts need an expiry path.",
      confidence: 0.71,
    }],
  });

  render(<GapPanel />);

  expect(screen.getByRole("heading", { name: "Suggested (1)" })).not.toBeNull();
  expect(document.querySelector(".suggested-card .suggested-label")?.textContent).toBe("Suggested");

  cleanup();
  appStore.setState({ machine: null });
  render(<App />);
  expect(screen.getByRole("link", { name: "Docs" }).getAttribute("href")).toContain(
    "github.com/aiwriter28/state-gap-mapper",
  );
});
