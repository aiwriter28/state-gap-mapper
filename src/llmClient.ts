import {
  API_ERROR_RETRYABLE,
  apiError,
  type ApiError,
  type ApiErrorCode,
} from "../lib/errors";
import {
  type CachedSample,
  DOMAIN_LIMITS,
  type Machine,
  type RankedHole,
  type Sentence,
  type SuggestedEvent,
} from "../lib/machine";
import {
  decodeCachedSample,
  decodeExtractionOutput,
  decodeRankOutput,
  type DecodeErr,
} from "../lib/decode";
import { computeGaps } from "../lib/gaps";
import { splitSpec } from "../lib/sentences";
import {
  validateExtraction,
  validateMachineShape,
  validateRankOutput,
} from "../lib/validate";

export type ExtractionResponse =
  | { kind: "machine"; machine: Machine; sentences: Sentence[] }
  | { kind: "not_spec"; reason: string; sentences: Sentence[] };

export interface RankResponse {
  kind: "rank";
  rankedHoles: RankedHole[];
  suggestedEvents: SuggestedEvent[];
  truncated: boolean;
  droppedSuggestions: number;
}

export interface LlmClient {
  extract(spec: string): Promise<ExtractionResponse>;
  rank(machine: Machine, sentences: Sentence[]): Promise<RankResponse>;
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const API_ERROR_CODES = new Set<ApiErrorCode>([
  "bad_request",
  "too_long",
  "payload_too_large",
  "rate_limited",
  "model_refusal",
  "model_invalid",
  "upstream_failure",
]);

const NETWORK_ERROR = apiError(
  "upstream_failure",
  "The model service is temporarily unavailable.",
);
const INVALID_RESPONSE_ERROR = apiError(
  "upstream_failure",
  "The model service returned an invalid response.",
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isDecodeError<T>(value: T | DecodeErr): value is DecodeErr {
  return isRecord(value) && value.ok === false;
}

function decodeSentences(value: unknown): Sentence[] | null {
  if (!Array.isArray(value) || value.length > DOMAIN_LIMITS.sentences) return null;
  const decoded: Sentence[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const sentence = value[index];
    if (!isRecord(sentence) || !hasExactKeys(sentence, ["index", "text"])) return null;
    if (sentence.index !== index + 1) return null;
    if (
      typeof sentence.text !== "string" ||
      sentence.text.trim().length === 0 ||
      sentence.text.length > DOMAIN_LIMITS.sentenceText
    ) {
      return null;
    }
    decoded.push({ index: index + 1, text: sentence.text });
  }
  return decoded;
}

function decodeSuccess(value: unknown): ExtractionResponse | RankResponse | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "not_spec") {
    if (!hasExactKeys(value, ["kind", "reason", "sentences"])) return null;
    const sentences = decodeSentences(value.sentences);
    const decoded = decodeExtractionOutput({
      viability: { isSpec: false, reason: value.reason },
      machine: null,
    });
    if (sentences === null || isDecodeError(decoded)) return null;
    if (validateExtraction(decoded, sentences.length).length > 0) return null;
    return { kind: "not_spec", reason: decoded.viability.reason, sentences };
  }

  if (value.kind === "machine") {
    if (!hasExactKeys(value, ["kind", "machine", "sentences"])) return null;
    const sentences = decodeSentences(value.sentences);
    const decoded = decodeExtractionOutput({
      viability: { isSpec: true, reason: "Validated API extraction." },
      machine: value.machine,
    });
    if (sentences === null || isDecodeError(decoded) || decoded.machine === null) return null;
    if (
      validateMachineShape(decoded.machine).length > 0 ||
      validateExtraction(decoded, sentences.length).length > 0
    ) {
      return null;
    }
    return { kind: "machine", machine: decoded.machine, sentences };
  }

  if (value.kind === "rank") {
    if (!hasExactKeys(value, [
      "kind",
      "rankedHoles",
      "suggestedEvents",
      "truncated",
      "droppedSuggestions",
    ])) {
      return null;
    }
    const droppedSuggestions = value.droppedSuggestions;
    const decoded = decodeRankOutput({
      rankedHoles: value.rankedHoles,
      suggestedEvents: value.suggestedEvents,
    });
    if (
      isDecodeError(decoded) ||
      validateRankOutput(decoded).length > 0 ||
      typeof value.truncated !== "boolean" ||
      typeof droppedSuggestions !== "number" ||
      !Number.isInteger(droppedSuggestions) ||
      droppedSuggestions < 0 ||
      droppedSuggestions > DOMAIN_LIMITS.suggestions
    ) {
      return null;
    }
    return {
      kind: "rank",
      rankedHoles: decoded.rankedHoles,
      suggestedEvents: decoded.suggestedEvents,
      truncated: value.truncated,
      droppedSuggestions,
    };
  }

  return null;
}

export function decodeApiError(value: unknown): ApiError | null {
  if (!isRecord(value) || !hasExactKeys(value, ["code", "message", "retryable"])) return null;
  if (typeof value.code !== "string" || !API_ERROR_CODES.has(value.code as ApiErrorCode)) return null;
  if (
    typeof value.message !== "string" ||
    value.message.trim().length === 0 ||
    value.message.length > 500 ||
    typeof value.retryable !== "boolean"
  ) {
    return null;
  }
  const code = value.code as ApiErrorCode;
  if (value.retryable !== API_ERROR_RETRYABLE[code]) return null;
  return { code, message: value.message, retryable: value.retryable };
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function normalizeClientError(value: unknown): ApiError {
  return decodeApiError(value) ?? NETWORK_ERROR;
}

export function decodeCachedSamplePayload(value: unknown, spec?: string): CachedSample | null {
  const decoded = decodeCachedSample(value);
  if (isDecodeError(decoded)) return null;
  if (validateMachineShape(decoded.machine).length > 0) return null;
  if (validateExtraction({
    viability: { isSpec: true, reason: "Validated cached sample." },
    machine: decoded.machine,
  }, decoded.sentences.length).length > 0) {
    return null;
  }
  if (validateRankOutput({
    rankedHoles: decoded.rankedHoles,
    suggestedEvents: decoded.suggestedEvents,
  }).length > 0) {
    return null;
  }
  if (spec !== undefined && JSON.stringify(decoded.sentences) !== JSON.stringify(splitSpec(spec))) {
    return null;
  }

  const authoritativePairs = new Set(computeGaps(decoded.machine).missingTransitions.map((hole) => (
    `${hole.stateId}\u0000${hole.eventId}`
  )));
  const rankedPairs = new Set(decoded.rankedHoles.map((hole) => (
    `${hole.stateId}\u0000${hole.eventId}`
  )));
  const stateIds = new Set(decoded.machine.states.map((state) => state.id));
  if (
    authoritativePairs.size !== decoded.rankedHoles.length ||
    rankedPairs.size !== decoded.rankedHoles.length ||
    authoritativePairs.size !== rankedPairs.size ||
    [...authoritativePairs].some((pair) => !rankedPairs.has(pair)) ||
    decoded.rankedHoles.some((hole) => (
      hole.relevance < 0 ||
      hole.relevance > 1 ||
      (hole.suggestedTargetStateId !== null && !stateIds.has(hole.suggestedTargetStateId))
    ))
  ) {
    return null;
  }

  return decoded;
}

export function createLlmClient(fetcher: FetchLike = fetch): LlmClient {
  return {
    async extract(spec) {
      let response: Response;
      try {
        response = await fetcher("/api/llm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ op: "extract", spec }),
        });
      } catch {
        throw NETWORK_ERROR;
      }

      let body: unknown;
      try {
        body = parseJson(await response.text());
      } catch {
        throw INVALID_RESPONSE_ERROR;
      }

      if (!response.ok) {
        throw decodeApiError(body) ?? INVALID_RESPONSE_ERROR;
      }

      const decoded = decodeSuccess(body);
      if (decoded === null || decoded.kind === "rank") throw INVALID_RESPONSE_ERROR;
      return decoded;
    },

    async rank(machine, sentences) {
      let response: Response;
      try {
        response = await fetcher("/api/llm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ op: "rank", machine, sentences }),
        });
      } catch {
        throw NETWORK_ERROR;
      }

      let body: unknown;
      try {
        body = parseJson(await response.text());
      } catch {
        throw INVALID_RESPONSE_ERROR;
      }

      if (!response.ok) {
        throw decodeApiError(body) ?? INVALID_RESPONSE_ERROR;
      }

      const decoded = decodeSuccess(body);
      if (decoded === null || decoded.kind !== "rank") throw INVALID_RESPONSE_ERROR;
      return decoded;
    },
  };
}

export const llmClient = createLlmClient();
