import {
  DOMAIN_LIMITS,
  type CachedSample,
  type ExtractionOutput,
  type Machine,
  type MachineEvent,
  type MachineState,
  type OpEnvelope,
  type RankOutput,
  type RankRequest,
  type RankedHole,
  type Sentence,
  type SuggestedEvent,
  type Transition,
  type Viability,
} from "./machine";

/*
 * Decoding intentionally checks only representation, primitive types, and hard
 * resource bounds. Domain meaning (for example blank names and score ranges)
 * belongs to lib/validate.ts.
 */
export interface DecodeErr {
  ok: false;
  path: string;
  message: string;
}

class DecodeFailure extends Error {
  constructor(readonly path: string, message: string) {
    super(message);
  }
}

type Decoder<T> = (value: unknown, path: string) => T;

const fail = (path: string, message: string): never => {
  throw new DecodeFailure(path, message);
};

function decode<T>(value: unknown, decoder: Decoder<T>): T | DecodeErr {
  try {
    return decoder(value, "$");
  } catch (error) {
    if (error instanceof DecodeFailure) {
      return { ok: false, path: error.path, message: error.message };
    }
    throw error;
  }
}

function object(
  value: unknown,
  path: string,
  fields: readonly string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "Expected an object.");
  }

  const record = value as Record<string, unknown>;
  const allowed = new Set(fields);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      return fail(path, `Unexpected field ${key}.`);
    }
  }
  return record;
}

function string(value: unknown, path: string, maxLength?: number): string {
  if (typeof value !== "string") {
    return fail(path, "Expected a string.");
  }
  if (maxLength !== undefined && value.length > maxLength) {
    return fail(path, `Expected at most ${maxLength} characters.`);
  }
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    return fail(path, "Expected a boolean.");
  }
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(path, "Expected a finite number.");
  }
  return value;
}

function integer(value: unknown, path: string): number {
  const decoded = finiteNumber(value, path);
  if (!Number.isInteger(decoded)) {
    return fail(path, "Expected an integer.");
  }
  return decoded;
}

function nonNegativeInteger(value: unknown, path: string): number {
  const decoded = integer(value, path);
  if (decoded < 0) {
    return fail(path, "Expected a non-negative integer.");
  }
  return decoded;
}

function array<T>(
  value: unknown,
  path: string,
  maxLength: number,
  itemDecoder: Decoder<T>,
): T[] {
  if (!Array.isArray(value)) {
    return fail(path, "Expected an array.");
  }
  if (value.length > maxLength) {
    return fail(path, `Expected at most ${maxLength} entries.`);
  }
  return value.map((item, index) => itemDecoder(item, `${path}[${index}]`));
}

const idOrName: Decoder<string> = (value, path) =>
  string(value, path, DOMAIN_LIMITS.idOrName);

const rationale: Decoder<string> = (value, path) =>
  string(value, path, DOMAIN_LIMITS.rationale);

const evidence: Decoder<number[]> = (value, path) =>
  array(value, path, DOMAIN_LIMITS.evidence, integer);

const surfaceForms: Decoder<string[]> = (value, path) =>
  array(value, path, DOMAIN_LIMITS.surfaceForms, idOrName);

function optionalUserAdded(
  record: Record<string, unknown>,
  path: string,
): Pick<MachineState, "userAdded"> {
  if (!("userAdded" in record)) return {};
  return { userAdded: boolean(record.userAdded, `${path}.userAdded`) };
}

function machineState(
  value: unknown,
  path: string,
  allowUserAdded: boolean,
): MachineState {
  const fields = ["id", "name", "isInitial", "isFinal", "evidence"];
  if (allowUserAdded) fields.push("userAdded");
  const record = object(value, path, fields);
  return {
    id: idOrName(record.id, `${path}.id`),
    name: idOrName(record.name, `${path}.name`),
    isInitial: boolean(record.isInitial, `${path}.isInitial`),
    isFinal: boolean(record.isFinal, `${path}.isFinal`),
    evidence: evidence(record.evidence, `${path}.evidence`),
    ...(allowUserAdded ? optionalUserAdded(record, path) : {}),
  };
}

function machineEvent(
  value: unknown,
  path: string,
  allowUserAdded: boolean,
): MachineEvent {
  const fields = ["id", "name", "surfaceForms", "evidence"];
  if (allowUserAdded) fields.push("userAdded");
  const record = object(value, path, fields);
  return {
    id: idOrName(record.id, `${path}.id`),
    name: idOrName(record.name, `${path}.name`),
    surfaceForms: surfaceForms(record.surfaceForms, `${path}.surfaceForms`),
    evidence: evidence(record.evidence, `${path}.evidence`),
    ...(allowUserAdded ? optionalUserAdded(record, path) : {}),
  };
}

function transition(
  value: unknown,
  path: string,
  allowUserAdded: boolean,
): Transition {
  const fields = ["from", "event", "to", "evidence"];
  if (allowUserAdded) fields.push("userAdded");
  const record = object(value, path, fields);
  return {
    from: idOrName(record.from, `${path}.from`),
    event: idOrName(record.event, `${path}.event`),
    to: idOrName(record.to, `${path}.to`),
    evidence: evidence(record.evidence, `${path}.evidence`),
    ...(allowUserAdded ? optionalUserAdded(record, path) : {}),
  };
}

function machine(
  value: unknown,
  path: string,
  allowUserAdded: boolean,
): Machine {
  const record = object(value, path, ["states", "events", "transitions"]);
  return {
    states: array(
      record.states,
      `${path}.states`,
      DOMAIN_LIMITS.states,
      (item, itemPath) => machineState(item, itemPath, allowUserAdded),
    ),
    events: array(
      record.events,
      `${path}.events`,
      DOMAIN_LIMITS.events,
      (item, itemPath) => machineEvent(item, itemPath, allowUserAdded),
    ),
    transitions: array(
      record.transitions,
      `${path}.transitions`,
      DOMAIN_LIMITS.transitions,
      (item, itemPath) => transition(item, itemPath, allowUserAdded),
    ),
  };
}

const viability: Decoder<Viability> = (value, path) => {
  const record = object(value, path, ["isSpec", "reason"]);
  return {
    isSpec: boolean(record.isSpec, `${path}.isSpec`),
    reason: rationale(record.reason, `${path}.reason`),
  };
};

const extractionOutput: Decoder<ExtractionOutput> = (value, path) => {
  const record = object(value, path, ["viability", "machine"]);
  return {
    viability: viability(record.viability, `${path}.viability`),
    machine:
      record.machine === null
        ? null
        : machine(record.machine, `${path}.machine`, false),
  };
};

const rankedHole: Decoder<RankedHole> = (value, path) => {
  const record = object(value, path, [
    "stateId",
    "eventId",
    "relevance",
    "rationale",
    "suggestedTargetStateId",
  ]);
  const target = record.suggestedTargetStateId;
  return {
    stateId: idOrName(record.stateId, `${path}.stateId`),
    eventId: idOrName(record.eventId, `${path}.eventId`),
    relevance: finiteNumber(record.relevance, `${path}.relevance`),
    rationale: rationale(record.rationale, `${path}.rationale`),
    suggestedTargetStateId:
      target === null
        ? null
        : idOrName(target, `${path}.suggestedTargetStateId`),
  };
};

const suggestedEvent: Decoder<SuggestedEvent> = (value, path) => {
  const record = object(value, path, [
    "id",
    "name",
    "surfaceForms",
    "rationale",
    "confidence",
  ]);
  return {
    id: idOrName(record.id, `${path}.id`),
    name: idOrName(record.name, `${path}.name`),
    surfaceForms: surfaceForms(record.surfaceForms, `${path}.surfaceForms`),
    rationale: rationale(record.rationale, `${path}.rationale`),
    confidence: finiteNumber(record.confidence, `${path}.confidence`),
  };
};

const rankOutput: Decoder<RankOutput> = (value, path) => {
  const record = object(value, path, ["rankedHoles", "suggestedEvents"]);
  return {
    rankedHoles: array(
      record.rankedHoles,
      `${path}.rankedHoles`,
      DOMAIN_LIMITS.rankedHoles,
      rankedHole,
    ),
    suggestedEvents: array(
      record.suggestedEvents,
      `${path}.suggestedEvents`,
      DOMAIN_LIMITS.suggestions,
      suggestedEvent,
    ),
  };
};

function sentences(value: unknown, path: string): Sentence[] {
  const decoded = array(
    value,
    path,
    Number.MAX_SAFE_INTEGER,
    (item, itemPath): Sentence => {
      const record = object(item, itemPath, ["index", "text"]);
      return {
        index: integer(record.index, `${itemPath}.index`),
        text: string(record.text, `${itemPath}.text`),
      };
    },
  );
  decoded.forEach((sentence, index) => {
    const expected = index + 1;
    if (sentence.index !== expected) {
      fail(`${path}[${index}].index`, `Expected sequential index ${expected}.`);
    }
  });
  return decoded;
}

const rankRequest: Decoder<RankRequest> = (value, path) => {
  const record = object(value, path, ["op", "machine", "sentences"]);
  if (record.op !== "rank") {
    return fail(`${path}.op`, 'Expected "rank".');
  }
  return {
    op: "rank",
    machine: machine(record.machine, `${path}.machine`, true),
    sentences: sentences(record.sentences, `${path}.sentences`),
  };
};

const cachedSample: Decoder<CachedSample> = (value, path) => {
  const record = object(value, path, [
    "version",
    "sentences",
    "machine",
    "rankedHoles",
    "suggestedEvents",
    "truncated",
    "droppedSuggestions",
  ]);
  if (record.version !== 1) {
    return fail(`${path}.version`, "Expected cache version 1.");
  }
  const decodedRank = rankOutput(
    {
      rankedHoles: record.rankedHoles,
      suggestedEvents: record.suggestedEvents,
    },
    path,
  );
  return {
    version: 1,
    sentences: sentences(record.sentences, `${path}.sentences`),
    machine: machine(record.machine, `${path}.machine`, false),
    ...decodedRank,
    truncated: boolean(record.truncated, `${path}.truncated`),
    droppedSuggestions: nonNegativeInteger(
      record.droppedSuggestions,
      `${path}.droppedSuggestions`,
    ),
  };
};

const opEnvelope: Decoder<OpEnvelope> = (value, path) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "Expected an object.");
  }
  const op = (value as Record<string, unknown>).op;
  if (op === "rank") return rankRequest(value, path);
  if (op === "extract") {
    const record = object(value, path, ["op", "spec"]);
    return { op: "extract", spec: string(record.spec, `${path}.spec`) };
  }
  return fail(`${path}.op`, 'Expected "extract" or "rank".');
};

export function decodeExtractionOutput(
  value: unknown,
): ExtractionOutput | DecodeErr {
  return decode(value, extractionOutput);
}

export function decodeRankOutput(value: unknown): RankOutput | DecodeErr {
  return decode(value, rankOutput);
}

export function decodeRankRequest(value: unknown): RankRequest | DecodeErr {
  return decode(value, rankRequest);
}

export function decodeCachedSample(value: unknown): CachedSample | DecodeErr {
  return decode(value, cachedSample);
}

export function decodeOpEnvelope(value: unknown): OpEnvelope | DecodeErr {
  return decode(value, opEnvelope);
}
