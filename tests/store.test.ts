import { readFileSync } from "node:fs";

import { describe, expect, test, vi } from "vitest";

import { apiError } from "../lib/errors";
import { computeGaps } from "../lib/gaps";
import { addTransition, deleteTransition } from "../lib/commands";
import type { CachedSample, Machine, SuggestedEvent } from "../lib/machine";
import { splitSpec } from "../lib/sentences";
import { selectActiveGapCount } from "../lib/selectors";
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

const orderCache: CachedSample = {
  version: 1,
  sentences: orderResponse.sentences,
  machine: orderMachine,
  rankedHoles: computeGaps(orderMachine).missingTransitions.map((hole) => (
    hole.stateId === "processing" && hole.eventId === "cancel"
      ? rankResponse.rankedHoles[0]
      : {
        ...hole,
        relevance: 0.4,
        rationale: "This authoritative hole has a cached rank.",
        suggestedTargetStateId: "cart",
      }
  )),
  suggestedEvents: rankResponse.suggestedEvents,
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
      stubs: [{ stateId: "processing", eventId: "cancel", targetStateId: null, evidence: [2, 5], text: "" }],
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
      stubs: [{ stateId: "old", eventId: "event", targetStateId: null, evidence: [1], text: "" }],
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

  test("selecting a validated cached sample hydrates the full pipeline instantly with zero API calls", () => {
    const client = fakeClient();
    const store = createAppStore(client);

    store.getState().selectSample(orderSpec, orderCache);

    expect(client.extract).not.toHaveBeenCalled();
    expect(client.rank).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({
      draftSpec: orderSpec,
      activeSpec: orderSpec,
      machine: orderMachine,
      sentences: orderResponse.sentences,
      suggestedEvents: rankResponse.suggestedEvents,
      dirty: false,
      phase: "idle",
      rankPending: false,
    });
    expect(store.getState().displayHoles.find((hole) => (
      hole.stateId === "processing" && hole.eventId === "cancel"
    ))?.rank).toEqual(rankResponse.rankedHoles[0]);
  });
});

describe("editable machine store", () => {
  test("accepts a flagship Missing Transition atomically and stores its Test Stub", () => {
    const store = createAppStore(fakeClient());
    store.setState({ sessionSeq: 1, draftSpec: orderSpec });
    store.getState().applyExtraction(orderResponse, 1, orderSpec);

    const result = store.getState().acceptHole(
      { stateId: "processing", eventId: "cancel" },
      { kind: "existing", stateId: "cancelled" },
    );

    expect(result).toMatchObject({ ok: true });
    expect(store.getState().displayHoles).not.toContainEqual(expect.objectContaining({
      stateId: "processing", eventId: "cancel",
    }));
    expect(store.getState().stubs).toEqual([expect.objectContaining({
      stateId: "processing",
      eventId: "cancel",
      targetStateId: "cancelled",
      text: "# Evidence: sentences 2, 5\nGiven the system is in state Processing\nWhen Cancel occurs\nThen the system moves to Cancelled",
    })]);
  });

  test("dismissal is session-scoped, survives a defined-then-reappearing pair, supports undo, and drops stale ids", () => {
    const store = createAppStore(fakeClient());
    store.setState({ sessionSeq: 1, draftSpec: orderSpec });
    store.getState().applyExtraction(orderResponse, 1, orderSpec);
    const hole = { stateId: "processing", eventId: "cancel" };

    store.getState().dismissHole(hole);
    expect(store.getState().displayHoles).not.toContainEqual(expect.objectContaining(hole));
    store.getState().applyCommand(addTransition, {
      from: "processing", to: "cancelled", event: { kind: "existing", id: "cancel" },
    });
    store.getState().applyCommand(deleteTransition, { from: "processing", eventId: "cancel" });
    expect(store.getState().displayHoles).not.toContainEqual(expect.objectContaining(hole));

    store.getState().undoDismiss(hole);
    expect(store.getState().displayHoles).toContainEqual(expect.objectContaining(hole));
    store.getState().dismissHole({ stateId: "paid", eventId: "cancel" });
    store.getState().applyCommand((machine) => ({
      ok: true,
      machine: {
        ...machine,
        states: machine.states.filter((state) => state.id !== "paid"),
        transitions: machine.transitions.filter((transition) => transition.from !== "paid" && transition.to !== "paid"),
      },
    }), undefined);
    expect(store.getState().dismissedPairKeys).not.toContain("paid\u0000cancel");

    store.setState({ sessionSeq: 2 });
    store.getState().applyExtraction(orderResponse, 2, orderSpec);
    expect(store.getState().dismissedPairKeys.size).toBe(0);
  });

  test("active gap count decreases on dismiss and returns on undo", () => {
    const store = createAppStore(fakeClient());
    store.setState({ sessionSeq: 1, draftSpec: orderSpec });
    store.getState().applyExtraction(orderResponse, 1, orderSpec);
    const hole = { stateId: "processing", eventId: "cancel" };

    expect(selectActiveGapCount(store.getState())).toBe(10);
    store.getState().dismissHole(hole);
    expect(selectActiveGapCount(store.getState())).toBe(9);
    store.getState().undoDismiss(hole);
    expect(selectActiveGapCount(store.getState())).toBe(10);
  });

  test("accepting an expiry Suggested Event adds exactly three new Missing Transitions and records provenance", () => {
    const signupMachine: Machine = {
      states: [
        { id: "unverified", name: "Unverified", isInitial: true, isFinal: false, evidence: [1] },
        { id: "active", name: "Active", isInitial: false, isFinal: false, evidence: [2] },
        { id: "locked", name: "Locked", isInitial: false, isFinal: false, evidence: [3] },
        { id: "deactivated", name: "Deactivated", isInitial: false, isFinal: true, evidence: [4] },
      ],
      events: [
        { id: "code_correct", name: "Code correct", surfaceForms: ["correct code"], evidence: [1] },
        { id: "code_incorrect_3x", name: "Code incorrect 3x", surfaceForms: ["incorrect code"], evidence: [2] },
        { id: "unlock", name: "Unlock", surfaceForms: ["unlock"], evidence: [3] },
        { id: "deactivate", name: "Deactivate", surfaceForms: ["deactivate"], evidence: [4] },
      ],
      transitions: [
        { from: "unverified", event: "code_correct", to: "active", evidence: [1] },
        { from: "unverified", event: "code_incorrect_3x", to: "locked", evidence: [2] },
        { from: "active", event: "deactivate", to: "deactivated", evidence: [4] },
        { from: "locked", event: "unlock", to: "unverified", evidence: [3] },
      ],
    };
    const expiry: SuggestedEvent = {
      id: "code_expired",
      name: "Code expired",
      surfaceForms: ["code expires"],
      rationale: "Codes can expire.",
      confidence: 0.8,
    };
    const store = createAppStore(fakeClient());
    store.setState({ sessionSeq: 1, draftSpec: "Account signup" });
    store.getState().applyExtraction({ kind: "machine", machine: signupMachine, sentences: [] }, 1, "Account signup");
    store.setState({ suggestedEvents: [expiry] });
    const before = store.getState().gaps.missingTransitions.length;

    const result = store.getState().acceptSuggestedEvent(expiry);

    expect(result).toMatchObject({ ok: true, acceptedEventId: "code_expired" });
    expect(store.getState().gaps.missingTransitions).toHaveLength(before + 3);
    expect(store.getState().acceptedSuggestedEventIds.get("code_expired")).toBe("code_expired");
  });
  test("applies a validated command atomically, increments revision, refreshes gaps, and marks user edits dirty", () => {
    const store = createAppStore(fakeClient());
    store.setState({ sessionSeq: 1, draftSpec: orderSpec });
    store.getState().applyExtraction(orderResponse, 1, orderSpec);
    const revision = store.getState().machineRev;

    const result = store.getState().applyCommand(addTransition, {
      from: "processing",
      to: "cancelled",
      event: { kind: "existing", id: "cancel" },
    });

    expect(result).toMatchObject({ ok: true });
    expect(store.getState()).toMatchObject({ machineRev: revision + 1, dirty: true });
    expect(store.getState().gaps.missingTransitions).not.toContainEqual({
      stateId: "processing",
      eventId: "cancel",
    });
    expect(store.getState().displayHoles.find(
      (hole) => hole.stateId === "processing" && hole.eventId === "cancel",
    )).toBeUndefined();

    const machine = store.getState().machine;
    const failed = store.getState().applyCommand(deleteTransition, {
      from: "processing",
      eventId: "missing",
    });
    expect(failed).toMatchObject({ ok: false, error: { code: "unknown_id" } });
    expect(store.getState().machine).toEqual(machine);
    expect(store.getState().machineRev).toBe(revision + 1);
  });

  test("dirty extraction asks for exact confirmation and cancellation preserves the edit", async () => {
    const replacement = deferred<ExtractionResponse>();
    const client = fakeClient(replacement);
    const store = createAppStore(client);
    store.setState({ sessionSeq: 1, draftSpec: orderSpec });
    store.getState().applyExtraction(orderResponse, 1, orderSpec);
    store.getState().applyCommand(addTransition, {
      from: "processing",
      to: "cancelled",
      event: { kind: "existing", id: "cancel" },
    });
    store.getState().setDraftSpec("A different behavioral spec.");

    await store.getState().extract();

    expect(client.extract).not.toHaveBeenCalled();
    expect(store.getState().replacementConfirmation).toBe(
      "Extracting again will replace your edits. Continue?",
    );
    const edited = store.getState().machine;
    store.getState().cancelReplacement();
    expect(store.getState().machine).toEqual(edited);
    expect(store.getState().replacementConfirmation).toBeNull();

    await store.getState().extract();
    const confirmed = store.getState().confirmReplacement();
    replacement.resolve(orderResponse);
    await confirmed;
    expect(client.extract).toHaveBeenCalledWith("A different behavioral spec.");
    expect(store.getState().dirty).toBe(false);
  });

  test("dirty sample confirmation runs one authorized replacement extraction and clears dirty only on success", async () => {
    const replacement = deferred<ExtractionResponse>();
    const client = fakeClient(replacement);
    const store = createAppStore(client);
    store.setState({ sessionSeq: 1, draftSpec: orderSpec });
    store.getState().applyExtraction(orderResponse, 1, orderSpec);
    store.getState().applyCommand(addTransition, {
      from: "processing",
      to: "cancelled",
      event: { kind: "existing", id: "cancel" },
    });

    store.getState().selectSample("Cached sample");
    expect(store.getState().replacementConfirmation).toBe(
      "Extracting again will replace your edits. Continue?",
    );
    expect(store.getState().draftSpec).toBe(orderSpec);
    store.getState().cancelReplacement();
    expect(store.getState().draftSpec).toBe(orderSpec);
    expect(store.getState().dirty).toBe(true);

    store.getState().selectSample("Cached sample");
    const confirmed = store.getState().confirmReplacement();
    expect(client.extract).toHaveBeenCalledTimes(1);
    expect(client.extract).toHaveBeenCalledWith("Cached sample");
    expect(store.getState().dirty).toBe(true);
    expect(store.getState().machine?.transitions).toHaveLength(6);

    replacement.resolve(orderResponse);
    await confirmed;
    expect(store.getState()).toMatchObject({
      draftSpec: "Cached sample",
      activeSpec: "Cached sample",
      dirty: false,
      replacementConfirmation: null,
      machine: orderMachine,
    });
  });

  test("dirty cached sample replacement hydrates only after confirmation and makes zero API calls", async () => {
    const client = fakeClient();
    const store = createAppStore(client);
    store.setState({ sessionSeq: 1, draftSpec: orderSpec });
    store.getState().applyExtraction(orderResponse, 1, orderSpec);
    store.getState().applyCommand(addTransition, {
      from: "processing",
      to: "cancelled",
      event: { kind: "existing", id: "cancel" },
    });

    store.getState().selectSample(orderSpec, orderCache);
    expect(store.getState().dirty).toBe(true);
    expect(store.getState().machine?.transitions).toHaveLength(6);

    await store.getState().confirmReplacement();

    expect(client.extract).not.toHaveBeenCalled();
    expect(client.rank).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({
      activeSpec: orderSpec,
      machine: orderMachine,
      dirty: false,
      replacementConfirmation: null,
    });
  });

  test("failed dirty sample replacement preserves the edited machine and remains dirty", async () => {
    const replacement = deferred<ExtractionResponse>();
    const client = fakeClient(replacement);
    const store = createAppStore(client);
    store.setState({ sessionSeq: 1, draftSpec: orderSpec });
    store.getState().applyExtraction(orderResponse, 1, orderSpec);
    store.getState().applyCommand(addTransition, {
      from: "processing",
      to: "cancelled",
      event: { kind: "existing", id: "cancel" },
    });
    const editedMachine = store.getState().machine;

    store.getState().selectSample("Cached sample");
    const confirmed = store.getState().confirmReplacement();
    replacement.reject(apiError("upstream_failure", "Replacement failed."));
    await confirmed;

    expect(client.extract).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({
      draftSpec: "Cached sample",
      activeSpec: orderSpec,
      machine: editedMachine,
      dirty: true,
      phase: "idle",
      error: apiError("upstream_failure", "Replacement failed."),
      replacementConfirmation: null,
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
