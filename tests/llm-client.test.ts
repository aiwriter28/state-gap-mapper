import { afterEach, describe, expect, test, vi } from "vitest";

import { apiError } from "../lib/errors";
import type { Machine } from "../lib/machine";
import { createLlmClient } from "../src/llmClient";
import fixture from "./fixtures/order-checkout.machine.json";

const machine = fixture as Machine;
const sentences = [
  { index: 1, text: "A new order starts in the Cart state." },
  {
    index: 2,
    text: "When the customer checks out, the order moves from Cart to Processing while payment is attempted.",
  },
  {
    index: 3,
    text: "If payment succeeds, the order moves from Processing to Paid.",
  },
  {
    index: 4,
    text: "If payment fails, the order returns from Processing to Cart so the customer can try again.",
  },
  {
    index: 5,
    text: "The customer can cancel the order from the Cart, which moves it to Cancelled.",
  },
  {
    index: 6,
    text: "Once a Paid order is handed to the courier, it moves to Shipped.",
  },
];

afterEach(() => vi.restoreAllMocks());

describe("llmClient unknown boundary", () => {
  test("returns a strictly decoded and semantically validated machine response", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ kind: "machine", machine, sentences }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(createLlmClient(fetcher).extract("literal spec")).resolves.toEqual({
      kind: "machine",
      machine,
      sentences,
    });
    expect(fetcher).toHaveBeenCalledWith("/api/llm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "extract", spec: "literal spec" }),
    });
  });

  test("returns a strictly decoded not_spec response", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          kind: "not_spec",
          reason: "Describe states and what events change them.",
          sentences: [{ index: 1, text: "Bake for 20 minutes." }],
        }),
        { status: 200 },
      ),
    );

    await expect(createLlmClient(fetcher).extract("Bake for 20 minutes.")).resolves.toEqual({
      kind: "not_spec",
      reason: "Describe states and what events change them.",
      sentences: [{ index: 1, text: "Bake for 20 minutes." }],
    });
  });

  test("returns only the exact strictly decoded rank DTO", async () => {
    const rankedHoles = [{
      stateId: "processing",
      eventId: "cancel",
      relevance: 0.92,
      rationale: "Cancellation is handled elsewhere in this workflow.",
      suggestedTargetStateId: "cancelled",
    }];
    const suggestedEvents = [{
      id: "timeout",
      name: "Timeout",
      surfaceForms: ["times out"],
      rationale: "A payment attempt can time out.",
      confidence: 0.7,
    }];
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      kind: "rank",
      rankedHoles,
      suggestedEvents,
      truncated: false,
      droppedSuggestions: 0,
    }), { status: 200 }));

    await expect(createLlmClient(fetcher).rank(machine, sentences)).resolves.toEqual({
      kind: "rank",
      rankedHoles,
      suggestedEvents,
      truncated: false,
      droppedSuggestions: 0,
    });
    expect(fetcher).toHaveBeenCalledWith("/api/llm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "rank", machine, sentences }),
    });
  });

  test("rejects unknown rank DTO fields at the client boundary", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      kind: "rank",
      rankedHoles: [],
      suggestedEvents: [],
      truncated: false,
      droppedSuggestions: 0,
      trusted: true,
    }), { status: 200 }));

    await expect(createLlmClient(fetcher).rank(machine, sentences)).rejects.toEqual(
      apiError("upstream_failure", "The model service returned an invalid response."),
    );
  });

  test.each([
    ["malformed JSON", "not json"],
    ["HTML", "<!doctype html><title>proxy failure</title>"],
    [
      "unknown success fields",
      JSON.stringify({ kind: "machine", machine, sentences, trusted: true }),
    ],
    [
      "invalid machine semantics",
      JSON.stringify({
        kind: "machine",
        machine: { ...machine, states: machine.states.map((state) => ({ ...state, isInitial: false })) },
        sentences,
      }),
    ],
  ])("normalizes %s success bodies to synthetic upstream_failure", async (_, body) => {
    const fetcher = vi.fn(async () => new Response(body, { status: 200 }));

    await expect(createLlmClient(fetcher).extract("spec")).rejects.toEqual(
      apiError("upstream_failure", "The model service returned an invalid response."),
    );
  });

  test("passes through only a strict, internally consistent ApiError", async () => {
    const expected = apiError("rate_limited", "Too many requests. Try again in one minute.");
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(expected), { status: 429 }),
    );

    await expect(createLlmClient(fetcher).extract("spec")).rejects.toEqual(expected);
  });

  test.each([
    ["invalid error DTO", JSON.stringify({ code: "rate_limited", message: "Wait", retryable: false })],
    ["non-JSON error", "gateway unavailable"],
  ])("normalizes %s to synthetic upstream_failure", async (_, body) => {
    const fetcher = vi.fn(async () => new Response(body, { status: 503 }));

    await expect(createLlmClient(fetcher).extract("spec")).rejects.toEqual(
      apiError("upstream_failure", "The model service returned an invalid response."),
    );
  });

  test("normalizes network rejection to synthetic upstream_failure", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(createLlmClient(fetcher).extract("spec")).rejects.toEqual(
      apiError("upstream_failure", "The model service is temporarily unavailable."),
    );
  });
});
