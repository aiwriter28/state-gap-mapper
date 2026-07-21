import type {
  Machine,
  MachineEvent,
  MachineState,
  RankedHole,
  Sentence,
  SuggestedEvent,
  Transition,
} from "./machine.js";
import { DOMAIN_LIMITS } from "./machine.js";
import { validateExtraction, validateMachineShape, validateRankOutput } from "./validate.js";

export const PROJECT_FILE_BYTES = 8 * 1024 * 1024;
export const PROJECT_LIMITS = {
  dismissedPairs: 900,
  acceptedSuggestedEvents: 1_000,
  testStubs: 500,
  testStubText: 1_024,
} as const;

export interface ProjectTestStub {
  stateId: string;
  eventId: string;
  targetStateId: string | null;
  evidence: number[];
  text: string;
}

export interface StateGapMapperProjectV1 {
  format: "state-gap-mapper-project";
  version: 1;
  exportedAt: string;
  spec: { active: string; draft: string };
  sentences: Sentence[];
  machine: Machine;
  canvasEdited: boolean;
  analysis: {
    ranks: RankedHole[];
    suggestedEvents: SuggestedEvent[];
    rankTruncated: boolean;
  };
  decisions: {
    dismissedPairs: Array<{ stateId: string; eventId: string }>;
    acceptedSuggestedEvents: Array<{ suggestionId: string; acceptedEventId: string }>;
    testStubs: ProjectTestStub[];
  };
}

export interface ProjectSnapshot {
  activeSpec: string;
  draftSpec: string;
  sentences: Sentence[];
  machine: Machine;
  dirty: boolean;
  ranks: RankedHole[];
  suggestedEvents: SuggestedEvent[];
  rankTruncated: boolean;
  dismissedPairKeys: ReadonlySet<string>;
  acceptedSuggestedEventIds: ReadonlyMap<string, string>;
  stubs: ProjectTestStub[];
}

export type ProjectFailureCode = "wrong_format" | "unsupported_version" | "invalid";
export type ProjectResult =
  | { ok: true; value: StateGapMapperProjectV1 }
  | { ok: false; code: ProjectFailureCode; path: string; reason: string };
export type ProjectSerializationResult =
  | { ok: true; text: string }
  | { ok: false; code: "invalid" | "too_large" };

class DecodeIssue extends Error {
  constructor(readonly path: string, readonly reason: string) {
    super(reason);
  }
}

const fail = (path: string, reason: string): never => {
  throw new DecodeIssue(path, reason);
};

function object(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "must be an object.");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(fields);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) fail(path, `contains unexpected field ${key}.`);
  }
  return record;
}

function string(value: unknown, path: string, max: number, allowBlank = false): string {
  if (typeof value !== "string") throw new DecodeIssue(path, "must be a string.");
  const decoded = value;
  if (decoded.length > max) fail(path, `must be at most ${max} characters.`);
  if (!allowBlank && decoded.trim().length === 0) fail(path, "must contain text.");
  return decoded;
}

function id(value: unknown, path: string): string {
  const decoded = string(value, path, DOMAIN_LIMITS.idOrName);
  if (!/^[a-z0-9_]+$/.test(decoded)) {
    fail(path, "must contain only lowercase letters, digits, and underscores.");
  }
  return decoded;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new DecodeIssue(path, "must be a boolean.");
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new DecodeIssue(path, "must be a finite number.");
  return value;
}

function integer(value: unknown, path: string): number {
  const decoded = finiteNumber(value, path);
  if (!Number.isInteger(decoded)) fail(path, "must be an integer.");
  return decoded;
}

function array<T>(
  value: unknown,
  path: string,
  max: number,
  decodeItem: (item: unknown, itemPath: string) => T,
): T[] {
  if (!Array.isArray(value)) throw new DecodeIssue(path, "must be an array.");
  const decoded: unknown[] = value;
  if (decoded.length > max) fail(path, `must contain at most ${max} entries.`);
  return decoded.map((item, index) => decodeItem(item, `${path}[${index}]`));
}

function evidence(value: unknown, path: string, sentenceCount: number): number[] {
  const decoded = array(value, path, DOMAIN_LIMITS.evidence, integer);
  decoded.forEach((index, offset) => {
    if (index < 1 || index > sentenceCount) {
      fail(`${path}[${offset}]`, `must reference Sentences 1 through ${sentenceCount}.`);
    }
  });
  return decoded;
}

function optionalUserAdded(record: Record<string, unknown>, path: string): { userAdded?: boolean } {
  return "userAdded" in record ? { userAdded: boolean(record.userAdded, `${path}.userAdded`) } : {};
}

function surfaceForms(value: unknown, path: string): string[] {
  const forms = array(value, path, DOMAIN_LIMITS.surfaceForms, (item, itemPath) => (
    string(item, itemPath, DOMAIN_LIMITS.idOrName)
  ));
  if (forms.length === 0) fail(path, "must contain at least one entry.");
  if (new Set(forms.map((form) => form.trim())).size !== forms.length) {
    fail(path, "must contain unique entries.");
  }
  return forms;
}

function state(value: unknown, path: string, sentenceCount: number): MachineState {
  const record = object(value, path, ["id", "name", "isInitial", "isFinal", "evidence", "userAdded"]);
  return {
    id: id(record.id, `${path}.id`),
    name: string(record.name, `${path}.name`, DOMAIN_LIMITS.idOrName),
    isInitial: boolean(record.isInitial, `${path}.isInitial`),
    isFinal: boolean(record.isFinal, `${path}.isFinal`),
    evidence: evidence(record.evidence, `${path}.evidence`, sentenceCount),
    ...optionalUserAdded(record, path),
  };
}

function event(value: unknown, path: string, sentenceCount: number): MachineEvent {
  const record = object(value, path, ["id", "name", "surfaceForms", "evidence", "userAdded"]);
  return {
    id: id(record.id, `${path}.id`),
    name: string(record.name, `${path}.name`, DOMAIN_LIMITS.idOrName),
    surfaceForms: surfaceForms(record.surfaceForms, `${path}.surfaceForms`),
    evidence: evidence(record.evidence, `${path}.evidence`, sentenceCount),
    ...optionalUserAdded(record, path),
  };
}

function transition(value: unknown, path: string, sentenceCount: number): Transition {
  const record = object(value, path, ["from", "event", "to", "evidence", "userAdded"]);
  return {
    from: id(record.from, `${path}.from`),
    event: id(record.event, `${path}.event`),
    to: id(record.to, `${path}.to`),
    evidence: evidence(record.evidence, `${path}.evidence`, sentenceCount),
    ...optionalUserAdded(record, path),
  };
}

function rankedHole(value: unknown, path: string): RankedHole {
  const record = object(value, path, ["stateId", "eventId", "relevance", "rationale", "suggestedTargetStateId"]);
  return {
    stateId: id(record.stateId, `${path}.stateId`),
    eventId: id(record.eventId, `${path}.eventId`),
    relevance: finiteNumber(record.relevance, `${path}.relevance`),
    rationale: string(record.rationale, `${path}.rationale`, DOMAIN_LIMITS.rationale),
    suggestedTargetStateId: record.suggestedTargetStateId === null
      ? null
      : id(record.suggestedTargetStateId, `${path}.suggestedTargetStateId`),
  };
}

function suggestedEvent(value: unknown, path: string): SuggestedEvent {
  const record = object(value, path, ["id", "name", "surfaceForms", "rationale", "confidence"]);
  return {
    id: string(record.id, `${path}.id`, DOMAIN_LIMITS.idOrName),
    name: string(record.name, `${path}.name`, DOMAIN_LIMITS.idOrName),
    surfaceForms: surfaceForms(record.surfaceForms, `${path}.surfaceForms`),
    rationale: string(record.rationale, `${path}.rationale`, DOMAIN_LIMITS.rationale),
    confidence: finiteNumber(record.confidence, `${path}.confidence`),
  };
}

const V1_SENTENCE_BOUNDARY = /(?:\r?\n)+|(?<=[!?])\s+|(?<!e\.g\.)(?<=[.])\s+/i;

export function splitProjectSpecV1(text: string): Sentence[] {
  return text
    .split(V1_SENTENCE_BOUNDARY)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((text, index) => ({ index: index + 1, text }));
}

function sameSentences(left: Sentence[], right: Sentence[]): boolean {
  return left.length === right.length && left.every((sentence, index) => (
    sentence.index === right[index]?.index && sentence.text === right[index]?.text
  ));
}

function decodeV1(root: Record<string, unknown>): StateGapMapperProjectV1 {
  object(root, "$", ["format", "version", "exportedAt", "spec", "sentences", "machine", "canvasEdited", "analysis", "decisions"]);
  const exportedAt = string(root.exportedAt, "$.exportedAt", 24);
  let canonicalTimestamp = "";
  try {
    canonicalTimestamp = new Date(exportedAt).toISOString();
  } catch {
    fail("$.exportedAt", "must be an exact UTC ISO 8601 timestamp.");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(exportedAt) || canonicalTimestamp !== exportedAt) {
    fail("$.exportedAt", "must be an exact UTC ISO 8601 timestamp.");
  }

  const specRecord = object(root.spec, "$.spec", ["active", "draft"]);
  const active = string(specRecord.active, "$.spec.active", 4_000);
  const draft = string(specRecord.draft, "$.spec.draft", 4_000, true);
  const sentenceValues = array(root.sentences, "$.sentences", DOMAIN_LIMITS.sentences, (value, path): Sentence => {
    const record = object(value, path, ["index", "text"]);
    return {
      index: integer(record.index, `${path}.index`),
      text: string(record.text, `${path}.text`, DOMAIN_LIMITS.sentenceText),
    };
  });
  sentenceValues.forEach((sentence, index) => {
    if (sentence.index !== index + 1) fail(`$.sentences[${index}].index`, `must equal ${index + 1}.`);
  });
  if (!sameSentences(sentenceValues, splitProjectSpecV1(active))) {
    fail("$.sentences", "must exactly match the active Spec.");
  }

  const machineRecord = object(root.machine, "$.machine", ["states", "events", "transitions"]);
  const machine: Machine = {
    states: array(machineRecord.states, "$.machine.states", DOMAIN_LIMITS.states, (value, path) => state(value, path, sentenceValues.length)),
    events: array(machineRecord.events, "$.machine.events", DOMAIN_LIMITS.events, (value, path) => event(value, path, sentenceValues.length)),
    transitions: array(machineRecord.transitions, "$.machine.transitions", DOMAIN_LIMITS.transitions, (value, path) => transition(value, path, sentenceValues.length)),
  };
  const machineError = validateMachineShape(machine)[0]
    ?? validateExtraction({ viability: { isSpec: true, reason: "Restored project." }, machine }, sentenceValues.length)[0];
  if (machineError !== undefined) fail(`$.machine.${machineError.subject}`, machineError.message);

  const analysisRecord = object(root.analysis, "$.analysis", ["ranks", "suggestedEvents", "rankTruncated"]);
  const ranks = array(analysisRecord.ranks, "$.analysis.ranks", DOMAIN_LIMITS.rankedHoles, rankedHole);
  const suggestions = array(analysisRecord.suggestedEvents, "$.analysis.suggestedEvents", DOMAIN_LIMITS.suggestions, suggestedEvent);
  const rankError = validateRankOutput({ rankedHoles: ranks, suggestedEvents: suggestions })[0];
  if (rankError !== undefined) fail(`$.analysis.${rankError.subject}`, rankError.message);

  const decisionsRecord = object(root.decisions, "$.decisions", ["dismissedPairs", "acceptedSuggestedEvents", "testStubs"]);
  const stateIds = new Set(machine.states.map((item) => item.id));
  const eventById = new Map(machine.events.map((item) => [item.id, item]));
  const dismissedSeen = new Set<string>();
  const dismissedPairs = array(decisionsRecord.dismissedPairs, "$.decisions.dismissedPairs", PROJECT_LIMITS.dismissedPairs, (value, path) => {
    const record = object(value, path, ["stateId", "eventId"]);
    const pair = { stateId: id(record.stateId, `${path}.stateId`), eventId: id(record.eventId, `${path}.eventId`) };
    const key = `${pair.stateId}\u0000${pair.eventId}`;
    if (dismissedSeen.has(key)) fail(path, "must not repeat a dismissed pair.");
    if (!stateIds.has(pair.stateId) || !eventById.has(pair.eventId)) fail(path, "must reference the imported machine.");
    dismissedSeen.add(key);
    return pair;
  });

  const acceptedSeen = new Set<string>();
  const acceptedSuggestedEvents = array(
    decisionsRecord.acceptedSuggestedEvents,
    "$.decisions.acceptedSuggestedEvents",
    PROJECT_LIMITS.acceptedSuggestedEvents,
    (value, path) => {
      const record = object(value, path, ["suggestionId", "acceptedEventId"]);
      const mapping = {
        suggestionId: string(record.suggestionId, `${path}.suggestionId`, DOMAIN_LIMITS.idOrName),
        acceptedEventId: id(record.acceptedEventId, `${path}.acceptedEventId`),
      };
      if (acceptedSeen.has(mapping.suggestionId)) fail(path, "must not repeat a suggestion id.");
      const acceptedEvent = eventById.get(mapping.acceptedEventId);
      if (acceptedEvent !== undefined && acceptedEvent.userAdded !== true) {
        fail(`${path}.acceptedEventId`, "must refer to an event added by the user.");
      }
      acceptedSeen.add(mapping.suggestionId);
      return mapping;
    },
  );

  const testStubs = array(decisionsRecord.testStubs, "$.decisions.testStubs", PROJECT_LIMITS.testStubs, (value, path): ProjectTestStub => {
    const record = object(value, path, ["stateId", "eventId", "targetStateId", "evidence", "text"]);
    return {
      stateId: id(record.stateId, `${path}.stateId`),
      eventId: id(record.eventId, `${path}.eventId`),
      targetStateId: record.targetStateId === null ? null : id(record.targetStateId, `${path}.targetStateId`),
      evidence: evidence(record.evidence, `${path}.evidence`, sentenceValues.length),
      text: string(record.text, `${path}.text`, PROJECT_LIMITS.testStubText),
    };
  });

  const machineEventIds = new Set(machine.events.map((item) => item.id));
  return {
    format: "state-gap-mapper-project",
    version: 1,
    exportedAt,
    spec: { active, draft },
    sentences: sentenceValues,
    machine,
    canvasEdited: boolean(root.canvasEdited, "$.canvasEdited"),
    analysis: {
      ranks,
      suggestedEvents: suggestions.filter((suggestion) => !machineEventIds.has(suggestion.id)),
      rankTruncated: boolean(analysisRecord.rankTruncated, "$.analysis.rankTruncated"),
    },
    decisions: { dismissedPairs, acceptedSuggestedEvents, testStubs },
  };
}

export function decodeProject(value: unknown): ProjectResult {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { ok: false, code: "wrong_format", path: "$", reason: "is not a State Gap Mapper project." };
    }
    const root = value as Record<string, unknown>;
    if (root.format !== "state-gap-mapper-project") {
      return { ok: false, code: "wrong_format", path: "$.format", reason: "is not the project discriminator." };
    }
    if (typeof root.version !== "number" || !Number.isInteger(root.version)) {
      return { ok: false, code: "invalid", path: "$.version", reason: "must be an integer." };
    }
    if (root.version !== 1) {
      return { ok: false, code: "unsupported_version", path: "$.version", reason: "is unsupported." };
    }
    return { ok: true, value: decodeV1(root) };
  } catch (error) {
    if (error instanceof DecodeIssue) {
      return { ok: false, code: "invalid", path: error.path, reason: error.reason };
    }
    return { ok: false, code: "invalid", path: "$", reason: "could not be decoded." };
  }
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function createProject(snapshot: ProjectSnapshot, exportedAt: Date): ProjectResult {
  const stateOrder = new Map(snapshot.machine.states.map((state, index) => [state.id, index]));
  const eventOrder = new Map(snapshot.machine.events.map((event, index) => [event.id, index]));
  const dismissedPairs = [...snapshot.dismissedPairKeys].map((key) => {
    const [stateId = "", eventId = ""] = key.split("\u0000");
    return { stateId, eventId };
  }).sort((left, right) => (
    (stateOrder.get(left.stateId) ?? Number.MAX_SAFE_INTEGER) - (stateOrder.get(right.stateId) ?? Number.MAX_SAFE_INTEGER)
    || (eventOrder.get(left.eventId) ?? Number.MAX_SAFE_INTEGER) - (eventOrder.get(right.eventId) ?? Number.MAX_SAFE_INTEGER)
  ));
  const machineEventIds = new Set(snapshot.machine.events.map((event) => event.id));
  return decodeProject({
    format: "state-gap-mapper-project",
    version: 1,
    exportedAt: exportedAt.toISOString(),
    spec: { active: snapshot.activeSpec, draft: snapshot.draftSpec },
    sentences: snapshot.sentences,
    machine: snapshot.machine,
    canvasEdited: snapshot.dirty,
    analysis: {
      ranks: snapshot.ranks,
      suggestedEvents: snapshot.suggestedEvents.filter((suggestion) => !machineEventIds.has(suggestion.id)),
      rankTruncated: snapshot.rankTruncated,
    },
    decisions: {
      dismissedPairs,
      acceptedSuggestedEvents: [...snapshot.acceptedSuggestedEventIds]
        .map(([suggestionId, acceptedEventId]) => ({ suggestionId, acceptedEventId }))
        .sort((left, right) => codeUnitCompare(left.suggestionId, right.suggestionId)),
      testStubs: snapshot.stubs,
    },
  });
}

export function serializeProject(project: StateGapMapperProjectV1): ProjectSerializationResult {
  const decoded = decodeProject(project);
  if (!decoded.ok) return { ok: false, code: "invalid" };
  try {
    const text = `${JSON.stringify(decoded.value, null, 2)}\n`;
    if (new TextEncoder().encode(text).byteLength > PROJECT_FILE_BYTES) {
      return { ok: false, code: "too_large" };
    }
    return { ok: true, text };
  } catch {
    return { ok: false, code: "invalid" };
  }
}
