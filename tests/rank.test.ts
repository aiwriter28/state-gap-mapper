import { describe, expect, test } from "vitest";

import { mergeRanks } from "../lib/rankMerge";
import type { MissingTransition, RankedHole } from "../lib/machine";

describe("mergeRanks", () => {
  test("preserves the authoritative set under adversarial rank output", () => {
    const authoritative: MissingTransition[] = [
      { stateId: "processing", eventId: "cancel" },
      { stateId: "cart", eventId: "payment_succeeded" },
      { stateId: "paid", eventId: "cancel" },
      { stateId: "paid", eventId: "checkout" },
    ];
    const ranked: RankedHole[] = [
      {
        stateId: "ghost",
        eventId: "cancel",
        relevance: 0.8,
        rationale: "Fabricated pair.",
        suggestedTargetStateId: null,
      },
      {
        stateId: "processing",
        eventId: "cancel",
        relevance: 0.9,
        rationale: "The user may need to cancel while payment is pending.",
        suggestedTargetStateId: "cancelled",
      },
      {
        stateId: "processing",
        eventId: "cancel",
        relevance: 0.1,
        rationale: "Later duplicate must not win.",
        suggestedTargetStateId: null,
      },
      {
        stateId: "cart",
        eventId: "payment_succeeded",
        relevance: 1.7,
        rationale: "Payment completion needs a destination.",
        suggestedTargetStateId: "paid",
      },
      {
        stateId: "paid",
        eventId: "cancel",
        relevance: 0.4,
        rationale: "Cancellation after payment is still worth reviewing.",
        suggestedTargetStateId: "ghost",
      },
    ];

    const output = mergeRanks(
      authoritative,
      ranked,
      new Set(["cart", "processing", "paid", "cancelled", "shipped"]),
    );

    const tuples = output.map((hole) => [hole.stateId, hole.eventId]).sort();
    expect(tuples).toEqual(authoritative.map((hole) => [hole.stateId, hole.eventId]).sort());
    expect(output.find((hole) => hole.stateId === "processing")?.rank?.relevance).toBe(0.9);
    expect(output.find((hole) => hole.stateId === "processing")?.rank?.suggestedTargetStateId)
      .toBe("cancelled");
    expect(output.find((hole) => hole.stateId === "cart")?.rank?.relevance).toBe(1);
    expect(output.find((hole) => hole.stateId === "paid" && hole.eventId === "cancel")?.rank
      ?.suggestedTargetStateId).toBeNull();
    expect(output.find((hole) => hole.stateId === "paid" && hole.eventId === "checkout")?.rank)
      .toBeNull();
  });
});
