import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { decodeCachedSample, type DecodeErr } from "../lib/decode";
import { computeGaps } from "../lib/gaps";
import type { CachedSample, Machine, MissingTransition } from "../lib/machine";
import { splitSpec } from "../lib/sentences";
import { validateExtraction, validateMachineShape, validateRankOutput } from "../lib/validate";

interface SampleOracle {
  name: string;
  specPath: string;
  cachePath: string;
  stateIds: string[];
  eventIds: string[];
  transitions: Machine["transitions"];
  holes: MissingTransition[];
  expectedTopThree: MissingTransition;
  requiresExpirySuggestion?: boolean;
}

const cacheDirectory = process.env.STATE_GAP_MAPPER_CACHE_DIR ?? "samples/cached";

const samples: SampleOracle[] = [
  {
    name: "order checkout",
    specPath: "samples/order-checkout.txt",
    cachePath: join(cacheDirectory, "order-checkout.json"),
    stateIds: ["cart", "processing", "paid", "cancelled", "shipped"],
    eventIds: ["checkout", "payment_succeeded", "payment_failed", "cancel", "handed_to_courier"],
    transitions: [
      { from: "cart", event: "checkout", to: "processing", evidence: [2] },
      { from: "processing", event: "payment_succeeded", to: "paid", evidence: [3] },
      { from: "processing", event: "payment_failed", to: "cart", evidence: [4] },
      { from: "cart", event: "cancel", to: "cancelled", evidence: [5] },
      { from: "paid", event: "handed_to_courier", to: "shipped", evidence: [6] },
    ],
    holes: [
      { stateId: "cart", eventId: "payment_succeeded" },
      { stateId: "cart", eventId: "payment_failed" },
      { stateId: "cart", eventId: "handed_to_courier" },
      { stateId: "processing", eventId: "checkout" },
      { stateId: "processing", eventId: "cancel" },
      { stateId: "processing", eventId: "handed_to_courier" },
      { stateId: "paid", eventId: "checkout" },
      { stateId: "paid", eventId: "payment_succeeded" },
      { stateId: "paid", eventId: "payment_failed" },
      { stateId: "paid", eventId: "cancel" },
    ],
    expectedTopThree: { stateId: "processing", eventId: "cancel" },
  },
  {
    name: "document approval",
    specPath: "samples/document-approval.txt",
    cachePath: join(cacheDirectory, "document-approval.json"),
    stateIds: ["draft", "in_review", "approved", "published", "archived"],
    eventIds: ["submit", "approve", "request_changes", "publish", "archive"],
    transitions: [
      { from: "draft", event: "submit", to: "in_review", evidence: [2] },
      { from: "in_review", event: "approve", to: "approved", evidence: [3] },
      { from: "in_review", event: "request_changes", to: "draft", evidence: [4] },
      { from: "approved", event: "publish", to: "published", evidence: [5] },
      { from: "draft", event: "archive", to: "archived", evidence: [6] },
    ],
    holes: [
      { stateId: "draft", eventId: "approve" },
      { stateId: "draft", eventId: "request_changes" },
      { stateId: "draft", eventId: "publish" },
      { stateId: "in_review", eventId: "submit" },
      { stateId: "in_review", eventId: "publish" },
      { stateId: "in_review", eventId: "archive" },
      { stateId: "approved", eventId: "submit" },
      { stateId: "approved", eventId: "approve" },
      { stateId: "approved", eventId: "request_changes" },
      { stateId: "approved", eventId: "archive" },
    ],
    expectedTopThree: { stateId: "approved", eventId: "request_changes" },
  },
  {
    name: "account signup",
    specPath: "samples/account-signup.txt",
    cachePath: join(cacheDirectory, "account-signup.json"),
    stateIds: ["unverified", "active", "locked", "deactivated"],
    eventIds: ["code_correct", "code_incorrect_3x", "unlock", "deactivate"],
    transitions: [
      { from: "unverified", event: "code_correct", to: "active", evidence: [2] },
      { from: "unverified", event: "code_incorrect_3x", to: "locked", evidence: [3] },
      { from: "locked", event: "unlock", to: "unverified", evidence: [4] },
      { from: "active", event: "deactivate", to: "deactivated", evidence: [5] },
    ],
    holes: [
      { stateId: "unverified", eventId: "unlock" },
      { stateId: "unverified", eventId: "deactivate" },
      { stateId: "active", eventId: "code_correct" },
      { stateId: "active", eventId: "code_incorrect_3x" },
      { stateId: "active", eventId: "unlock" },
      { stateId: "locked", eventId: "code_correct" },
      { stateId: "locked", eventId: "code_incorrect_3x" },
      { stateId: "locked", eventId: "deactivate" },
    ],
    expectedTopThree: { stateId: "unverified", eventId: "deactivate" },
    requiresExpirySuggestion: true,
  },
];

function isDecodeError(value: CachedSample | DecodeErr): value is DecodeErr {
  return "ok" in value && value.ok === false;
}

function readCache(path: string): CachedSample {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  const decoded = decodeCachedSample(raw);
  expect(isDecodeError(decoded)).toBe(false);
  if (isDecodeError(decoded)) throw new Error(`Invalid cache ${path}: ${decoded.path}`);
  return decoded;
}

describe.each(samples)("$name cached sample", (sample) => {
  test("matches the independent canonical machine and complete literal hole oracle", () => {
    const spec = readFileSync(sample.specPath, "utf8");
    const cache = readCache(sample.cachePath);

    expect(cache.version).toBe(1);
    expect(cache.sentences).toEqual(splitSpec(spec));
    expect(validateMachineShape(cache.machine)).toEqual([]);
    expect(validateExtraction({
      viability: { isSpec: true, reason: "Validated cached sample." },
      machine: cache.machine,
    }, cache.sentences.length)).toEqual([]);
    expect(validateRankOutput({
      rankedHoles: cache.rankedHoles,
      suggestedEvents: cache.suggestedEvents,
    })).toEqual([]);
    expect(cache.machine.states.map((state) => state.id)).toEqual(sample.stateIds);
    expect(cache.machine.events.map((event) => event.id)).toEqual(sample.eventIds);
    expect(cache.machine.transitions).toEqual(sample.transitions);
    expect(cache.rankedHoles.map(({ stateId, eventId }) => ({ stateId, eventId }))).toEqual(sample.holes);
    expect(computeGaps(cache.machine).missingTransitions).toEqual(sample.holes);
  });

  test("contains bounded useful ranks, valid targets, and the required demo signal", () => {
    const cache = readCache(sample.cachePath);
    const stateIds = new Set(cache.machine.states.map((state) => state.id));
    expect(cache.rankedHoles.every((hole) => (
      hole.rationale.trim().length > 0 &&
      hole.relevance >= 0 &&
      hole.relevance <= 1 &&
      hole.suggestedTargetStateId !== null &&
      stateIds.has(hole.suggestedTargetStateId)
    ))).toBe(true);

    const topThree = [...cache.rankedHoles]
      .sort((left, right) => right.relevance - left.relevance)
      .slice(0, 3)
      .map(({ stateId, eventId }) => ({ stateId, eventId }));
    expect(topThree).toContainEqual(sample.expectedTopThree);
    if (sample.requiresExpirySuggestion) {
      expect(cache.suggestedEvents.some((event) => /expir/i.test(`${event.id} ${event.name}`))).toBe(true);
    }
  });
});
