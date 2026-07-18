import { describe, expect, test } from "vitest";

import { renderStub } from "../lib/teststub";

describe("renderStub", () => {
  test("renders the exact accepted-target template with supplied capitalization", () => {
    expect(renderStub({
      stateName: "Processing",
      eventName: "cancel",
      targetName: "Cancelled",
      evidence: [2, 5],
    })).toBe(
      "# Evidence: sentences 2, 5\nGiven the system is in state Processing\nWhen cancel occurs\nThen the system moves to Cancelled",
    );
  });

  test("renders the exact unresolved-target template", () => {
    expect(renderStub({
      stateName: "Cart",
      eventName: "checkout",
      targetName: null,
      evidence: [1],
    })).toBe(
      "# Evidence: sentences 1\nGiven the system is in state Cart\nWhen checkout occurs\nThen define the expected outcome",
    );
  });
});
