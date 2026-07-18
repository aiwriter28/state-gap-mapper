import { readFileSync } from "node:fs";

import { describe, expect, test, vi } from "vitest";

import { apiError } from "../lib/errors";
import { computeGaps } from "../lib/gaps";
import type { Machine } from "../lib/machine";
import { splitSpec } from "../lib/sentences";
import {
  createAppStore,
  type ExtractionResponse,
  type LlmClient,
  type RankResponse,
} from "../src/store";
import fixture from "./fixtures/order-checkout.machine.json";

const orderMachine = fixture as Machine;
const orderSpec = readFileSync("samples/order-checkout.txt", "utf8").trim();
const orderResponse: ExtractionResponse = {
  kind: "machine",
  machine: orderMachine,
  sentences: splitSpec(orderSpec),
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function fakeClient(...requests: Array<ReturnType<typeof deferred<ExtractionResponse>>>): LlmClient {
  return {
    extract: vi.fn(() => {
      const request = requests.shift();
      if (request === undefined) throw new Error("No deferred request queued.");
      return request.promise;
    }),
    rank: vi.fn(() => new Promise<RankResponse>(() => undefined)),
  };
}

const rankResponse: RankResponse = {
  kind: "rank",
  rankedHoles: [{
    stateId: "processing",
    eventId: "cancel",
    relevance: 0.95,
    rationale: "Cancellation is already defined from Cart and needs a path here.",
    suggestedTargetStateId: "cancelled",
  }],
  suggestedEvents: [{
    id: "timeout",
    name: "Timeout",
    surfaceForms: ["times out"],
    rationale: "A payment attempt can time out.",
    confidence: 0.7,
  }],
  truncated: false,
  droppedSuggestions: 0,
};

describe("extraction store", () => {
  test("applyExtraction turns the literal Sample 1 fixture into ten display holes", () => {
    const store = createAppStore(fakeClient());
    store.setState({ sessionSeq: 1, draftSpec: orderSpec });

    store.getState().applyExtraction(orderResponse, 1, orderSpec);

    expect(store.getState().machine?.states).toHaveLength(5);
    expect(store.getState().gaps.missingTransitions).toHaveLength(10);
    expect(store.getState().displayHoles).toHaveLength(10);
    expect(store.getState().displayHoles).toContainEqual({
      stateId: "processing",
      eventId: "cancel",
      rank: null,
    });
    expect(store.getState().activeSpec).toBe(orderSpec);
  });

  test("A then B: B resolves first and remains authoritative after A resolves late", async () => {
    const a = deferred<ExtractionResponse>();
    const b = deferred<ExtractionResponse>();
    const store = createAppStore(fakeClient(a, b));

    store.getState().setDraftSpec("Spec A");
    const extractA = store.getState().extract();
    store.getState().setDraftSpec(orderSpec);
    const extractB = store.getState().extract();
    b.resolve(orderResponse);
    await extractB;
    a.resolve({ kind: "not_spec", reason: "A is stale.", sentences: [{ index: 1, text: "Spec A" }] });
    await extractA;

    expect(store.getState()).toMatchObject({
      activeSpec: orderSpec,
      machine: orderMachine,
      viabilityRefusal: null,
      phase: "idle",
      error: null,
      sessionSeq: 2,
    });
  });

  test("A rejecting after B succeeds cannot touch B or show a stale error", async () => {
    const a = deferred<ExtractionResponse>();
    const b = deferred<ExtractionResponse>();
    const store = createAppStore(fakeClient(a, b));

    store.getState().setDraftSpec("Spec A");
    const extractA = store.getState().extract();
    store.getState().setDraftSpec(orderSpec);
    const extractB = store.getState().extract();
    b.resolve(orderResponse);
    await extractB;
    a.reject(apiError("upstream_failure", "Stale failure."));
    await extractA;

    expect(store.getState()).toMatchObject({
      activeSpec: orderSpec,
      machine: orderMachine,
      phase: "idle",
      error: null,
    });
  });

  test("current failure clears extracting via finally, exposes ApiError, and preserves machine", async () => {
    const first = deferred<ExtractionResponse>();
    const failure = deferred<ExtractionResponse>();
    const store = createAppStore(fakeClient(first, failure));
    store.getState().setDraftSpec(orderSpec);
    const initialExtract = store.getState().extract();
    first.resolve(orderResponse);
    await initialExtract;

    const machineBefore = store.getState().machine;
    store.getState().setDraftSpec("Another behavioral spec.");
    const failedExtract = store.getState().extract();
    failure.reject(apiError("rate_limited", "Too many requests. Try again in one minute."));
    await failedExtract;

    expect(store.getState()).toMatchObject({
      machine: machineBefore,
      activeSpec: orderSpec,
      phase: "idle",
      error: apiError("rate_limited", "Too many requests. Try again in one minute."),
    });
  });

  test("not_spec sets refusal and preserves any prior successful machine and artifacts", async () => {
    const good = deferred<ExtractionResponse>();
    const refused = deferred<ExtractionResponse>();
    const client = fakeClient(good, refused);
    const store = createAppStore(client);
    store.getState().setDraftSpec(orderSpec);
    const initialExtract = store.getState().extract();
    good.resolve(orderResponse);
    await initialExtract;
    expect(client.rank).toHaveBeenCalledTimes(1);
    store.setState({
      ranks: [{
        stateId: "processing",
        eventId: "cancel",
        relevance: 0.92,
        rationale: "Important.",
        suggestedTargetStateId: "cancelled",
      }],
      rankTruncated: true,
      suggestedEvents: [{
        id: "timeout",
        name: "Timeout",
        surfaceForms: ["times out"],
        rationale: "Plausible.",
        confidence: 0.7,
      }],
      stubs: [{ stateId: "processing", eventId: "cancel", targetStateId: null, evidence: [2, 5] }],
      dismissedPairKeys: new Set(["paid\u0000cancel"]),
      selectedHoleKey: "processing\u0000cancel",
      highlightedEvidence: [2, 5],
    });
    const before = store.getState();

    store.getState().setDraftSpec("Mix flour and bake for 20 minutes.");
    const refusedExtract = store.getState().extract();
    refused.resolve({
      kind: "not_spec",
      reason: "Describe states and what events change them.",
      sentences: [{ index: 1, text: "Mix flour and bake for 20 minutes." }],
    });
    await refusedExtract;

    expect(store.getState()).toMatchObject({
      machine: before.machine,
      activeSpec: before.activeSpec,
      sentences: before.sentences,
      ranks: before.ranks,
      rankTruncated: before.rankTruncated,
      suggestedEvents: before.suggestedEvents,
      stubs: before.stubs,
      selectedHoleKey: before.selectedHoleKey,
      highlightedEvidence: before.highlightedEvidence,
      viabilityRefusal: "Describe states and what events change them.",
      phase: "idle",
      error: null,
    });
    expect(store.getState().dismissedPairKeys).toEqual(before.dismissedPairKeys);
    expect(client.rank).toHaveBeenCalledTimes(1);
  });

  test("first not_spec response sets refusal while machine remains null", async () => {
    const request = deferred<ExtractionResponse>();
    const store = createAppStore(fakeClient(request));
    store.getState().setDraftSpec("Cookie recipe.");
    const extraction = store.getState().extract();
    request.resolve({
      kind: "not_spec",
      reason: "This is a recipe, not a behavioral Spec.",
      sentences: [{ index: 1, text: "Cookie recipe." }],
    });
    await extraction;

    expect(store.getState()).toMatchObject({
      machine: null,
      viabilityRefusal: "This is a recipe, not a behavioral Spec.",
      phase: "idle",
    });
  });

  test("a successful extraction atomically resets every session artifact", () => {
    const store = createAppStore(fakeClient());
    store.setState({
      sessionSeq: 7,
      rankSeq: 11,
      draftSpec: orderSpec,
      ranks: [{
        stateId: "old",
        eventId: "event",
        relevance: 0.5,
        rationale: "Old.",
        suggestedTargetStateId: null,
      }],
      rankTruncated: true,
      suggestedEvents: [{
        id: "timeout",
        name: "Timeout",
        surfaceForms: ["times out"],
        rationale: "Old.",
        confidence: 0.7,
      }],
      stubs: [{ stateId: "old", eventId: "event", targetStateId: null, evidence: [1] }],
      dismissedPairKeys: new Set(["old\u0000event"]),
      selectedHoleKey: "old\u0000event",
      highlightedEvidence: [1],
      viabilityRefusal: "Old refusal.",
      dirty: true,
    });

    store.getState().applyExtraction(orderResponse, 7, orderSpec);

    expect(store.getState()).toMatchObject({
      ranks: [],
      rankTruncated: false,
      suggestedEvents: [],
      stubs: [],
      selectedHoleKey: null,
      highlightedEvidence: [],
      viabilityRefusal: null,
      rankSeq: 11,
      dirty: false,
    });
    expect(store.getState().dismissedPairKeys.size).toBe(0);
  });

  test("4,001 characters are rejected inline without a client call", async () => {
    const client = fakeClient();
    const store = createAppStore(client);
    store.getState().setDraftSpec("x".repeat(4_001));

    await store.getState().extract();

    expect(client.extract).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({
      phase: "idle",
      error: apiError("too_long", "Spec must be at most 4,000 characters."),
      sessionSeq: 0,
    });
  });

  test("blank input is rejected inline without a client call", async () => {
    const client = fakeClient();
    const store = createAppStore(client);
    store.getState().setDraftSpec(" \n\t ");

    await store.getState().extract();

    expect(client.extract).not.toHaveBeenCalled();
    expect(store.getState().error).toEqual(
      apiError("bad_request", "Spec must contain non-whitespace text."),
    );
  });

  test("editing draft after a submit never relabels the active machine", async () => {
    const request = deferred<ExtractionResponse>();
    const store = createAppStore(fakeClient(request));
    store.getState().setDraftSpec(orderSpec);
    const extraction = store.getState().extract();
    store.getState().setDraftSpec("Unsaved next draft");
    request.resolve(orderResponse);
    await extraction;

    expect(store.getState().draftSpec).toBe("Unsaved next draft");
    expect(store.getState().activeSpec).toBe(orderSpec);
  });

  test("selecting a sample draft invalidates an in-flight live extraction", async () => {
    const request = deferred<ExtractionResponse>();
    const store = createAppStore(fakeClient(request));
    store.getState().setDraftSpec("Live spec");
    const extraction = store.getState().extract();

    store.getState().selectSample(orderSpec);
    request.resolve({
      kind: "not_spec",
      reason: "Stale response.",
      sentences: [{ index: 1, text: "Live spec" }],
    });
    await extraction;

    expect(store.getState()).toMatchObject({
      draftSpec: orderSpec,
      activeSpec: "",
      machine: null,
      viabilityRefusal: null,
      phase: "idle",
      sessionSeq: 2,
    });
  });
});

describe("deferred rank store", () => {
  test("renders extracted graph and Structural Gaps before deferred rank, then applies rank metadata", async () => {
    const extraction = deferred<ExtractionResponse>();
    const ranking = deferred<RankResponse>();
    const client: LlmClient = {
      extract: vi.fn(() => extraction.promise),
      rank: vi.fn(() => ranking.promise),
    };
    const store = createAppStore(client);
    store.getState().setDraftSpec(orderSpec);

    const submitted = store.getState().extract();
    extraction.resolve(orderResponse);
    await submitted;

    expect(store.getState().machine).toEqual(orderMachine);
    expect(store.getState().displayHoles).toHaveLength(10);
    expect(store.getState().displayHoles.every((hole) => hole.rank === null)).toBe(true);
    expect(client.rank).toHaveBeenCalledWith(orderMachine, orderResponse.sentences);

    ranking.resolve(rankResponse);
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState()).toMatchObject({
      rankTruncated: false,
      suggestedEvents: rankResponse.suggestedEvents,
      rankError: null,
    });
    expect(store.getState().displayHoles.find(
      (hole) => hole.stateId === "processing" && hole.eventId === "cancel",
    )?.rank).toEqual(rankResponse.rankedHoles[0]);
  });

  test("rank failure keeps Structural Gaps visible and unranked with a rank-only error", async () => {
    const extraction = deferred<ExtractionResponse>();
    const ranking = deferred<RankResponse>();
    const store = createAppStore({
      extract: vi.fn(() => extraction.promise),
      rank: vi.fn(() => ranking.promise),
    });
    store.getState().setDraftSpec(orderSpec);

    const submitted = store.getState().extract();
    extraction.resolve(orderResponse);
    await submitted;
    ranking.reject(apiError("upstream_failure", "The model service is temporarily unavailable."));
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().displayHoles).toHaveLength(10);
    expect(store.getState().displayHoles.every((hole) => hole.rank === null)).toBe(true);
    expect(store.getState().rankError).toEqual(
      apiError("upstream_failure", "The model service is temporarily unavailable."),
    );
    expect(store.getState().error).toBeNull();
  });

  test("rank after a newer extraction is discarded", async () => {
    const extractionA = deferred<ExtractionResponse>();
    const extractionB = deferred<ExtractionResponse>();
    const rankA = deferred<RankResponse>();
    const rankB = deferred<RankResponse>();
    let extractionIndex = 0;
    let rankIndex = 0;
    const store = createAppStore({
      extract: vi.fn(() => {
        const next = [extractionA, extractionB][extractionIndex];
        extractionIndex += 1;
        return next?.promise ?? Promise.reject(new Error("Unexpected extraction."));
      }),
      rank: vi.fn(() => {
        const next = [rankA, rankB][rankIndex];
        rankIndex += 1;
        return next?.promise ?? Promise.reject(new Error("Unexpected rank."));
      }),
    });

    store.getState().setDraftSpec("Spec A");
    const a = store.getState().extract();
    extractionA.resolve(orderResponse);
    await a;
    store.getState().setDraftSpec("Spec B");
    const b = store.getState().extract();
    extractionB.resolve(orderResponse);
    await b;

    rankA.resolve(rankResponse);
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().ranks).toEqual([]);
    expect(store.getState().suggestedEvents).toEqual([]);
  });

  test("rank after an edit applies only ranks for authoritative surviving holes", async () => {
    const extraction = deferred<ExtractionResponse>();
    const ranking = deferred<RankResponse>();
    const store = createAppStore({
      extract: vi.fn(() => extraction.promise),
      rank: vi.fn(() => ranking.promise),
    });
    store.getState().setDraftSpec(orderSpec);
    const submitted = store.getState().extract();
    extraction.resolve(orderResponse);
    await submitted;

    const editedMachine: Machine = {
      ...orderMachine,
      transitions: [
        ...orderMachine.transitions,
        { from: "processing", event: "cancel", to: "cancelled", evidence: [5], userAdded: true },
      ],
    };
    const editedGaps = computeGaps(editedMachine);
    const revisionBeforeEdit = store.getState().machineRev;
    store.setState({
      machine: editedMachine,
      gaps: editedGaps,
      displayHoles: editedGaps.missingTransitions.map((hole) => ({ ...hole, rank: null })),
      machineRev: revisionBeforeEdit + 1,
    });

    ranking.resolve({
      ...rankResponse,
      rankedHoles: [
        {
          stateId: "cart",
          eventId: "payment_succeeded",
          relevance: 0.8,
          rationale: "Payment success needs a destination from Cart.",
          suggestedTargetStateId: "paid",
        },
        rankResponse.rankedHoles[0],
      ],
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().displayHoles.find(
      (hole) => hole.stateId === "cart" && hole.eventId === "payment_succeeded",
    )?.rank?.relevance).toBe(0.8);
    expect(store.getState().displayHoles.find(
      (hole) => hole.stateId === "processing" && hole.eventId === "cancel",
    )).toBeUndefined();
    expect(store.getState().suggestedEvents).toEqual([]);
  });

  test("same-session reranks keep the second result when it resolves before the first", async () => {
    const first = deferred<RankResponse>();
    const second = deferred<RankResponse>();
    let rankCall = 0;
    const store = createAppStore({
      extract: vi.fn(),
      rank: vi.fn(() => [first, second][rankCall++].promise),
    });
    store.setState({ sessionSeq: 1, draftSpec: orderSpec });
    store.getState().applyExtraction(orderResponse, 1, orderSpec);

    const firstRerank = store.getState().rank();
    const secondRerank = store.getState().rank();
    second.resolve({
      ...rankResponse,
      rankedHoles: [{ ...rankResponse.rankedHoles[0], relevance: 0.8 }],
    });
    await secondRerank;
    first.reject(apiError("upstream_failure", "First result is stale."));
    await firstRerank;

    expect(store.getState().ranks).toEqual([
      expect.objectContaining({ stateId: "processing", eventId: "cancel", relevance: 0.8 }),
    ]);
    expect(store.getState().rankError).toBeNull();
    expect(store.getState().rankPending).toBe(false);
  });
});
