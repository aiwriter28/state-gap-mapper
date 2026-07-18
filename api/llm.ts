import type { IncomingHttpHeaders } from "node:http";

import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

import { createRequestBudget, type RequestBudget } from "../lib/budget";
import {
  decodeExtractionOutput,
  decodeOpEnvelope,
  decodeRankOutput,
  type DecodeErr,
} from "../lib/decode";
import { apiError, type ApiErrorCode } from "../lib/errors";
import { computeGaps } from "../lib/gaps";
import type {
  ExtractionOutput,
  Machine,
  OpEnvelope,
  RankOutput,
  Sentence,
} from "../lib/machine";
import {
  EXTRACTION_DEVELOPER_PROMPT,
  EXTRACTION_SCHEMA,
  RANK_DEVELOPER_PROMPT,
  RANK_SCHEMA,
} from "../lib/schemas";
import { splitSpec } from "../lib/sentences";
import {
  validateExtraction,
  validateMachineShape,
  validateRankOutput,
  type VErr,
} from "../lib/validate";

const MAX_RAW_BODY_BYTES = 64 * 1_024;
const MAX_SPEC_CHARACTERS = 4_000;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const MAX_MODEL_ATTEMPTS = 3;

const ERROR_MESSAGES = {
  method: "Only POST requests are supported.",
  contentType: "Content-Type must be application/json.",
  payloadTooLarge: "Request body must not exceed 64 KiB.",
  malformedJson: "Request body must be valid JSON.",
  badEnvelope: "Request body does not match the API contract.",
  emptySpec: "Spec must contain non-whitespace text.",
  tooLong: "Spec must be at most 4,000 characters.",
  rateLimited: "Too many requests. Try again in one minute.",
  modelRefusal: "The model declined to process this Spec.",
  modelInvalid: "The model could not produce a valid extraction.",
  rankInvalid: "The model could not produce a valid ranking.",
  upstreamFailure: "The model service is temporarily unavailable.",
} as const;

export interface ModelAttemptRequest {
  model: "gpt-5.6";
  store: false;
  input: Array<{
    role: "developer" | "user";
    content: string;
  }>;
  text: {
    format: {
      type: "json_schema";
      name: "state_gap_extraction" | "state_gap_rank";
      strict: true;
      schema: typeof EXTRACTION_SCHEMA | typeof RANK_SCHEMA;
    };
  };
}

export type ModelAttemptResponse =
  | { kind: "output"; outputText: string }
  | { kind: "refusal" };

export interface ModelTransport {
  create(
    request: ModelAttemptRequest,
    options: { timeout: number },
  ): Promise<ModelAttemptResponse>;
}

interface HandlerDependencies {
  transport?: ModelTransport;
}

interface HttpResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

interface RawBodyResult {
  tooLarge: boolean;
  text: string;
}

interface RequestSource {
  method: string | undefined;
  header(name: string): string | undefined;
  readRawBody(): Promise<RawBodyResult>;
}

interface RateBucket {
  windowStart: number;
  count: number;
}

const rateBuckets = new Map<string, RateBucket>();

export function resetLlmRateLimiterForTests(): void {
  rateBuckets.clear();
}

function errorResult(
  status: number,
  code: ApiErrorCode,
  message: string,
  headers?: Record<string, string>,
): HttpResult {
  return { status, body: apiError(code, message), ...(headers ? { headers } : {}) };
}

function upstreamFailure(): HttpResult {
  return errorResult(503, "upstream_failure", ERROR_MESSAGES.upstreamFailure);
}

function isDecodeError<T>(value: T | DecodeErr): value is DecodeErr {
  return typeof value === "object" && value !== null && "ok" in value && value.ok === false;
}

function isApplicationJson(contentType: string | undefined): boolean {
  return contentType?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function firstForwardedIp(value: string | undefined): string {
  const first = value?.split(",", 1)[0].trim();
  return first || "unknown";
}

function consumeRateLimit(ip: string, now = Date.now()): boolean {
  for (const [bucketIp, bucket] of rateBuckets) {
    if (now - bucket.windowStart >= RATE_WINDOW_MS) {
      rateBuckets.delete(bucketIp);
    }
  }

  const bucket = rateBuckets.get(ip);
  if (bucket === undefined) {
    rateBuckets.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  if (bucket.count >= RATE_LIMIT) return false;
  bucket.count += 1;
  return true;
}

function concatUtf8(chunks: Uint8Array[], totalBytes: number): string {
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(bytes);
}

async function readWebRawBody(request: Request): Promise<RawBodyResult> {
  if (request.body === null) return { tooLarge: false, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RAW_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return { tooLarge: true, text: "" };
    }
    chunks.push(value);
  }

  return { tooLarge: false, text: concatUtf8(chunks, totalBytes) };
}

type NodeRequestLike = AsyncIterable<unknown> & {
  method?: string;
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>;
};

export interface NodeResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

function nodeHeader(
  headers: NodeRequestLike["headers"],
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(",") : value;
}

async function readNodeRawBody(request: NodeRequestLike): Promise<RawBodyResult> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    let bytes: Uint8Array;
    if (typeof chunk === "string") {
      bytes = new TextEncoder().encode(chunk);
    } else if (chunk instanceof Uint8Array) {
      bytes = chunk;
    } else {
      throw new TypeError("Unsupported request body chunk.");
    }

    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_RAW_BODY_BYTES) {
      return { tooLarge: true, text: "" };
    }
    chunks.push(bytes);
  }

  return { tooLarge: false, text: concatUtf8(chunks, totalBytes) };
}

function numberedSpec(sentences: Sentence[]): string {
  return sentences.map((sentence) => `${sentence.index}. ${sentence.text}`).join("\n");
}

function buildModelRequest(
  sentences: Sentence[],
  repairIssues: string[],
): ModelAttemptRequest {
  const input: ModelAttemptRequest["input"] = [
    { role: "developer", content: EXTRACTION_DEVELOPER_PROMPT },
  ];
  if (repairIssues.length > 0) {
    input.push({
      role: "developer",
      content: `The previous extraction failed semantic validation. Return a fresh complete extraction that fixes every issue below:\n${repairIssues.map((issue) => `- ${issue}`).join("\n")}`,
    });
  }
  input.push({
    role: "user",
    content: `BEGIN NUMBERED SPEC\n${numberedSpec(sentences)}\nEND NUMBERED SPEC`,
  });

  return {
    model: "gpt-5.6",
    store: false,
    input,
    text: {
      format: {
        type: "json_schema",
        name: "state_gap_extraction",
        strict: true,
        schema: EXTRACTION_SCHEMA,
      },
    },
  };
}

function buildRankModelRequest(
  machine: Machine,
  sentences: Sentence[],
  holes: Array<{ stateId: string; eventId: string }>,
  repairIssues: string[],
): ModelAttemptRequest {
  const input: ModelAttemptRequest["input"] = [
    { role: "developer", content: RANK_DEVELOPER_PROMPT },
  ];
  if (repairIssues.length > 0) {
    input.push({
      role: "developer",
      content: `The previous ranking failed semantic validation. Return a fresh complete ranking that fixes every issue below:\n${repairIssues.map((issue) => `- ${issue}`).join("\n")}`,
    });
  }
  input.push({
    role: "user",
    content: [
      "BEGIN MACHINE",
      JSON.stringify(machine),
      "END MACHINE",
      "BEGIN NUMBERED SPEC",
      numberedSpec(sentences),
      "END NUMBERED SPEC",
      "BEGIN STRUCTURAL MISSING TRANSITIONS",
      JSON.stringify(holes),
      "END STRUCTURAL MISSING TRANSITIONS",
    ].join("\n"),
  });

  return {
    model: "gpt-5.6",
    store: false,
    input,
    text: {
      format: {
        type: "json_schema",
        name: "state_gap_rank",
        strict: true,
        schema: RANK_SCHEMA,
      },
    },
  };
}

function semanticIssues(output: ExtractionOutput, sentenceCount: number): VErr[] {
  const issues: VErr[] = [];
  if (output.viability.isSpec && output.machine === null) {
    issues.push({
      code: "viability_machine",
      subject: "machine",
      message: "A viable Spec requires a machine.",
    });
  }
  if (!output.viability.isSpec && output.machine !== null) {
    issues.push({
      code: "viability_machine",
      subject: "machine",
      message: "A non-viable Spec requires machine to be null.",
    });
  }
  if (output.machine !== null) {
    issues.push(...validateMachineShape(output.machine));
  }
  issues.push(...validateExtraction(output, sentenceCount));
  return issues;
}

type ModelOutputValidation =
  | { kind: "valid"; output: ExtractionOutput }
  | { kind: "structural_failure" }
  | { kind: "semantic_failure"; issues: string[] };

function validateModelOutput(
  outputText: string,
  sentenceCount: number,
): ModelOutputValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText) as unknown;
  } catch {
    return { kind: "structural_failure" };
  }

  const decoded = decodeExtractionOutput(parsed);
  if (isDecodeError(decoded)) {
    return { kind: "structural_failure" };
  }

  const issues = semanticIssues(decoded, sentenceCount);
  if (issues.length > 0) {
    return {
      kind: "semantic_failure",
      issues: issues
        .slice(0, 20)
        .map((issue) => `${issue.code} at ${issue.subject}: ${issue.message}`),
    };
  }
  return { kind: "valid", output: decoded };
}

type RankModelOutputValidation =
  | { kind: "valid"; output: RankOutput }
  | { kind: "structural_failure" }
  | { kind: "semantic_failure"; issues: string[] };

function validateRankModelOutput(outputText: string): RankModelOutputValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText) as unknown;
  } catch {
    return { kind: "structural_failure" };
  }

  const decoded = decodeRankOutput(parsed);
  if (isDecodeError(decoded)) return { kind: "structural_failure" };

  const issues = validateRankOutput(decoded);
  if (issues.length > 0) {
    return {
      kind: "semantic_failure",
      issues: issues
        .slice(0, 20)
        .map((issue) => `${issue.code} at ${issue.subject}: ${issue.message}`),
    };
  }
  return { kind: "valid", output: decoded };
}

function responseHasRefusal(response: unknown): boolean {
  if (typeof response !== "object" || response === null) return false;
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return false;

  return output.some((item) => {
    if (typeof item !== "object" || item === null) return false;
    const content = (item as { content?: unknown }).content;
    return Array.isArray(content) && content.some((part) =>
      typeof part === "object" && part !== null &&
      (part as { type?: unknown }).type === "refusal"
    );
  });
}

class OpenAiTransport implements ModelTransport {
  async create(
    request: ModelAttemptRequest,
    options: { timeout: number },
  ): Promise<ModelAttemptResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new Error("OPENAI_API_KEY is missing.");
    }

    const client = new OpenAI({ apiKey, maxRetries: 0 });
    const response = await client.responses.create(
      request,
      { timeout: options.timeout, maxRetries: 0 },
    );
    if (responseHasRefusal(response)) return { kind: "refusal" };
    return { kind: "output", outputText: response.output_text };
  }
}

async function extract(
  spec: string,
  transport: ModelTransport,
  budget: RequestBudget,
): Promise<HttpResult> {
  if (spec.trim().length === 0) {
    return errorResult(400, "bad_request", ERROR_MESSAGES.emptySpec);
  }
  if (spec.length > MAX_SPEC_CHARACTERS) {
    return errorResult(400, "too_long", ERROR_MESSAGES.tooLong);
  }

  const sentences = splitSpec(spec);
  let semanticFailureCount = 0;
  let repairIssues: string[] = [];

  for (let attempt = 0; attempt < MAX_MODEL_ATTEMPTS; attempt += 1) {
    const timeout = budget.nextAttemptTimeout();
    if (timeout === null) {
      return semanticFailureCount > 0
        ? errorResult(502, "model_invalid", ERROR_MESSAGES.modelInvalid)
        : upstreamFailure();
    }

    let modelResponse: ModelAttemptResponse;
    try {
      modelResponse = await transport.create(
        buildModelRequest(sentences, repairIssues),
        { timeout },
      );
    } catch {
      return upstreamFailure();
    }

    if (modelResponse.kind === "refusal") {
      return errorResult(422, "model_refusal", ERROR_MESSAGES.modelRefusal);
    }

    const validation = validateModelOutput(modelResponse.outputText, sentences.length);
    if (validation.kind === "structural_failure") {
      return errorResult(502, "model_invalid", ERROR_MESSAGES.modelInvalid);
    }
    if (validation.kind === "semantic_failure") {
      semanticFailureCount += 1;
      repairIssues = validation.issues;
      continue;
    }

    if (validation.output.viability.isSpec) {
      return {
        status: 200,
        body: {
          kind: "machine",
          machine: validation.output.machine,
          sentences,
        },
      };
    }
    return {
      status: 200,
      body: {
        kind: "not_spec",
        reason: validation.output.viability.reason,
        sentences,
      },
    };
  }

  return errorResult(502, "model_invalid", ERROR_MESSAGES.modelInvalid);
}

function rankRequestIssues(machine: Machine, sentences: Sentence[]): VErr[] {
  const issues = [
    ...validateMachineShape(machine),
    ...validateExtraction({
      viability: { isSpec: true, reason: "Rank request machine." },
      machine,
    }, sentences.length),
  ];
  if (sentences.length === 0) {
    issues.push({
      code: "no_sentences",
      subject: "sentences",
      message: "A rank request requires numbered sentences.",
    });
  }
  sentences.forEach((sentence, index) => {
    if (sentence.text.trim().length === 0) {
      issues.push({
        code: "blank_sentence",
        subject: `sentences[${index}].text`,
        message: "Sentence text must not be blank.",
      });
    }
  });
  return issues;
}

function dropMachineIdCollisions(
  suggestions: RankOutput["suggestedEvents"],
  machine: Machine,
): { suggestedEvents: RankOutput["suggestedEvents"]; droppedSuggestions: number } {
  const machineIds = new Set([
    ...machine.states.map((state) => state.id),
    ...machine.events.map((event) => event.id),
  ]);
  const suggestedEvents = suggestions.filter((suggestion) => !machineIds.has(suggestion.id));
  return {
    suggestedEvents,
    droppedSuggestions: suggestions.length - suggestedEvents.length,
  };
}

async function rank(
  machine: Machine,
  sentences: Sentence[],
  transport: ModelTransport,
  budget: RequestBudget,
): Promise<HttpResult> {
  if (rankRequestIssues(machine, sentences).length > 0) {
    return errorResult(400, "bad_request", ERROR_MESSAGES.badEnvelope);
  }

  const holes = computeGaps(machine).missingTransitions;
  const rankableHoles = holes.slice(0, 100);
  let semanticFailureCount = 0;
  let repairIssues: string[] = [];

  for (let attempt = 0; attempt < MAX_MODEL_ATTEMPTS; attempt += 1) {
    const timeout = budget.nextAttemptTimeout();
    if (timeout === null) {
      return semanticFailureCount > 0
        ? errorResult(502, "model_invalid", ERROR_MESSAGES.rankInvalid)
        : upstreamFailure();
    }

    let modelResponse: ModelAttemptResponse;
    try {
      modelResponse = await transport.create(
        buildRankModelRequest(machine, sentences, rankableHoles, repairIssues),
        { timeout },
      );
    } catch {
      return upstreamFailure();
    }

    if (modelResponse.kind === "refusal") {
      return errorResult(422, "model_refusal", ERROR_MESSAGES.modelRefusal);
    }

    const validation = validateRankModelOutput(modelResponse.outputText);
    if (validation.kind === "structural_failure") {
      return errorResult(502, "model_invalid", ERROR_MESSAGES.rankInvalid);
    }
    if (validation.kind === "semantic_failure") {
      semanticFailureCount += 1;
      repairIssues = validation.issues;
      continue;
    }

    const filtered = dropMachineIdCollisions(validation.output.suggestedEvents, machine);
    return {
      status: 200,
      body: {
        kind: "rank",
        rankedHoles: validation.output.rankedHoles,
        suggestedEvents: filtered.suggestedEvents,
        truncated: holes.length > rankableHoles.length,
        droppedSuggestions: filtered.droppedSuggestions,
      },
    };
  }

  return errorResult(502, "model_invalid", ERROR_MESSAGES.rankInvalid);
}

async function dispatch(
  envelope: OpEnvelope,
  transport: ModelTransport,
  budget: RequestBudget,
): Promise<HttpResult> {
  if (envelope.op === "extract") return extract(envelope.spec, transport, budget);
  return rank(envelope.machine, envelope.sentences, transport, budget);
}

async function handleRequestSource(
  source: RequestSource,
  transport: ModelTransport,
): Promise<HttpResult> {
  const budget = createRequestBudget();
  try {
    if (source.method !== "POST") {
      return errorResult(
        405,
        "bad_request",
        ERROR_MESSAGES.method,
        { Allow: "POST" },
      );
    }
    if (!isApplicationJson(source.header("content-type"))) {
      return errorResult(415, "bad_request", ERROR_MESSAGES.contentType);
    }

    const rawBody = await source.readRawBody();
    if (rawBody.tooLarge) {
      return errorResult(413, "payload_too_large", ERROR_MESSAGES.payloadTooLarge);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.text) as unknown;
    } catch {
      return errorResult(400, "bad_request", ERROR_MESSAGES.malformedJson);
    }

    const envelope = decodeOpEnvelope(parsed);
    if (isDecodeError(envelope)) {
      return errorResult(400, "bad_request", ERROR_MESSAGES.badEnvelope);
    }

    const ip = firstForwardedIp(source.header("x-forwarded-for"));
    if (!consumeRateLimit(ip)) {
      return errorResult(
        429,
        "rate_limited",
        ERROR_MESSAGES.rateLimited,
        { "Retry-After": "60" },
      );
    }

    return await dispatch(envelope, transport, budget);
  } catch {
    return upstreamFailure();
  }
}

function webResponse(result: HttpResult): Response {
  const headers = new Headers(result.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers,
  });
}

export function createLlmHandler(
  dependencies: HandlerDependencies = {},
): (request: Request) => Promise<Response> {
  const transport = dependencies.transport ?? new OpenAiTransport();
  return async (request) => webResponse(await handleRequestSource({
    method: request.method,
    header: (name) => request.headers.get(name) ?? undefined,
    readRawBody: () => readWebRawBody(request),
  }, transport));
}

export function createNodeLlmHandler(
  dependencies: HandlerDependencies = {},
): (request: NodeRequestLike, response: NodeResponseLike) => Promise<void> {
  const transport = dependencies.transport ?? new OpenAiTransport();
  return async (request, response) => {
    const result = await handleRequestSource({
      method: request.method,
      header: (name) => nodeHeader(request.headers, name),
      readRawBody: () => readNodeRawBody(request),
    }, transport);
    response.statusCode = result.status;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    for (const [name, value] of Object.entries(result.headers ?? {})) {
      response.setHeader(name, value);
    }
    response.end(JSON.stringify(result.body));
  };
}

const nodeHandler = createNodeLlmHandler();
const webHandler = createLlmHandler();

function handler(request: Request): Promise<Response>;
function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void>;
function handler(
  request: Request | VercelRequest,
  response?: VercelResponse,
): Promise<Response> | Promise<void> {
  if (response === undefined) return webHandler(request as Request);
  return nodeHandler(request as VercelRequest, response);
}

export default handler;
