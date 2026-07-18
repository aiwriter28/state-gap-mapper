import { describe, expect, test } from "vitest";

import {
  decodeCachedSample,
  decodeExtractionOutput,
  decodeOpEnvelope,
  decodeRankOutput,
  decodeRankRequest,
} from "../lib/decode";
import { apiError } from "../lib/errors";

const extractionFixture = () => ({
  viability: { isSpec: true, reason: "A behavioral feature spec." },
  machine: {
    states: [
      {
        id: "idle",
        name: "Idle",
        isInitial: true,
        isFinal: false,
        evidence: [1],
      },
    ],
    events: [
      {
        id: "start",
        name: "Start",
        surfaceForms: ["starts"],
        evidence: [1],
      },
    ],
    transitions: [],
  },
});

const rankOutputFixture = () => ({
  rankedHoles: [
    {
      stateId: "idle",
      eventId: "start",
      relevance: 0.8,
      rationale: "Starting while idle needs a defined outcome.",
      suggestedTargetStateId: "idle",
    },
  ],
  suggestedEvents: [
    {
      id: "timeout",
      name: "Timeout",
      surfaceForms: ["times out"],
      rationale: "A delayed operation may time out.",
      confidence: 0.6,
    },
  ],
});

const sentencesFixture = () => [{ index: 1, text: "The system starts." }];

const rankRequestFixture = () => ({
  op: "rank" as const,
  machine: extractionFixture().machine,
  sentences: sentencesFixture(),
});

const cachedSampleFixture = () => ({
  version: 1,
  sentences: sentencesFixture(),
  machine: extractionFixture().machine,
  ...rankOutputFixture(),
  truncated: false,
  droppedSuggestions: 0,
});

function expectDecodeError(value: unknown, path: string) {
  expect(value).toMatchObject({ ok: false, path });
}

describe("decodeExtractionOutput", () => {
  test.each([
    ["null root", null, "$"],
    ["missing state array", (() => {
      const value = extractionFixture();
      return {
        ...value,
        machine: {
          events: value.machine.events,
          transitions: value.machine.transitions,
        },
      };
    })(), "$.machine.states"],
    ["boolean id", (() => {
      const value = extractionFixture();
      return {
        ...value,
        machine: {
          ...value.machine,
          states: [{ ...value.machine.states[0], id: true }],
        },
      };
    })(), "$.machine.states[0].id"],
    ["string evidence entry", (() => {
      const value = extractionFixture();
      return {
        ...value,
        machine: {
          ...value.machine,
          events: [{ ...value.machine.events[0], evidence: ["1"] }],
        },
      };
    })(), "$.machine.events[0].evidence[0]"],
    ["unexpected extraction field", { ...extractionFixture(), extra: true }, "$"],
    ["unexpected userAdded from model", (() => {
      const value = extractionFixture();
      return {
        ...value,
        machine: {
          ...value.machine,
          states: [{ ...value.machine.states[0], userAdded: false }],
        },
      };
    })(), "$.machine.states[0]"],
    ["65-character id", (() => {
      const value = extractionFixture();
      return {
        ...value,
        machine: {
          ...value.machine,
          states: [{ ...value.machine.states[0], id: "x".repeat(65) }],
        },
      };
    })(), "$.machine.states[0].id"],
    ["21 evidence entries", (() => {
      const value = extractionFixture();
      return {
        ...value,
        machine: {
          ...value.machine,
          states: [{ ...value.machine.states[0], evidence: Array(21).fill(1) }],
        },
      };
    })(), "$.machine.states[0].evidence"],
    ["11 surface forms", (() => {
      const value = extractionFixture();
      return {
        ...value,
        machine: {
          ...value.machine,
          events: [{ ...value.machine.events[0], surfaceForms: Array(11).fill("starts") }],
        },
      };
    })(), "$.machine.events[0].surfaceForms"],
    ["31 states", (() => {
      const value = extractionFixture();
      return {
        ...value,
        machine: {
          ...value.machine,
          states: Array.from({ length: 31 }, (_, index) => ({
            ...value.machine.states[0],
            id: `state_${index}`,
          })),
        },
      };
    })(), "$.machine.states"],
  ])("rejects %s", (_label, value, path) => {
    expectDecodeError(decodeExtractionOutput(value), path);
  });

  test("accepts a bounded strict extraction and preserves its values", () => {
    expect(decodeExtractionOutput(extractionFixture())).toEqual(extractionFixture());
  });
});

describe("decodeRankOutput", () => {
  test.each([
    ["missing ranked holes", { suggestedEvents: [] }, "$.rankedHoles"],
    ["301-character rationale", (() => {
      const value = rankOutputFixture();
      return {
        ...value,
        rankedHoles: [{ ...value.rankedHoles[0], rationale: "r".repeat(301) }],
      };
    })(), "$.rankedHoles[0].rationale"],
    ["non-finite relevance", (() => {
      const value = rankOutputFixture();
      return {
        ...value,
        rankedHoles: [{ ...value.rankedHoles[0], relevance: Number.NaN }],
      };
    })(), "$.rankedHoles[0].relevance"],
    ["non-null non-string target", (() => {
      const value = rankOutputFixture();
      return {
        ...value,
        rankedHoles: [{ ...value.rankedHoles[0], suggestedTargetStateId: false }],
      };
    })(), "$.rankedHoles[0].suggestedTargetStateId"],
    ["101 ranked holes", (() => {
      const value = rankOutputFixture();
      return {
        ...value,
        rankedHoles: Array.from({ length: 101 }, (_, index) => ({
          ...value.rankedHoles[0],
          eventId: `event_${index}`,
        })),
      };
    })(), "$.rankedHoles"],
    ["11 suggestions", (() => {
      const value = rankOutputFixture();
      return {
        ...value,
        suggestedEvents: Array.from({ length: 11 }, (_, index) => ({
          ...value.suggestedEvents[0],
          id: `suggestion_${index}`,
        })),
      };
    })(), "$.suggestedEvents"],
    ["unexpected suggestion field", (() => {
      const value = rankOutputFixture();
      return {
        ...value,
        suggestedEvents: [{ ...value.suggestedEvents[0], evidence: [1] }],
      };
    })(), "$.suggestedEvents[0]"],
  ])("rejects %s", (_label, value, path) => {
    expectDecodeError(decodeRankOutput(value), path);
  });

  test("accepts structurally valid out-of-range semantic scores", () => {
    const value = rankOutputFixture();
    value.suggestedEvents[0].confidence = -0.1;
    expect(decodeRankOutput(value)).toEqual(value);
  });
});

describe("decodeRankRequest", () => {
  test("rejects non-sequential sentence indices", () => {
    const value = rankRequestFixture();
    value.sentences = [{ index: 2, text: "The system starts." }];
    expectDecodeError(decodeRankRequest(value), "$.sentences[0].index");
  });

  test.each([
    ["31 events", (() => {
      const value = rankRequestFixture();
      return {
        ...value,
        machine: {
          ...value.machine,
          events: Array.from({ length: 31 }, (_, index) => ({
            ...value.machine.events[0],
            id: `event_${index}`,
          })),
        },
      };
    })(), "$.machine.events"],
    ["201 transitions", (() => {
      const value = rankRequestFixture();
      return {
        ...value,
        machine: {
          ...value.machine,
          transitions: Array.from({ length: 201 }, () => ({
            from: "idle",
            event: "start",
            to: "idle",
            evidence: [1],
          })),
        },
      };
    })(), "$.machine.transitions"],
    ["unexpected caller-supplied holes", {
      ...rankRequestFixture(),
      holes: [{ stateId: "idle", eventId: "start" }],
    }, "$"],
  ])("rejects %s", (_label, value, path) => {
    expectDecodeError(decodeRankRequest(value), path);
  });

  test("accepts caller-owned userAdded fields without weakening strict objects", () => {
    const base = rankRequestFixture();
    const value = {
      ...base,
      machine: {
        ...base.machine,
        states: [
          {
            ...base.machine.states[0],
            evidence: [],
            userAdded: true,
          },
        ],
      },
    };
    expect(decodeRankRequest(value)).toEqual(value);
  });
});

describe("decodeCachedSample", () => {
  test.each([
    ["unsupported version", { ...cachedSampleFixture(), version: 2 }, "$.version"],
    ["non-sequential sentences", {
      ...cachedSampleFixture(),
      sentences: [
        { index: 1, text: "First." },
        { index: 3, text: "Third." },
      ],
    }, "$.sentences[1].index"],
    ["unexpected cache field", { ...cachedSampleFixture(), generatedAt: "today" }, "$"],
    ["negative dropped count", {
      ...cachedSampleFixture(),
      droppedSuggestions: -1,
    }, "$.droppedSuggestions"],
  ])("rejects %s", (_label, value, path) => {
    expectDecodeError(decodeCachedSample(value), path);
  });

  test("accepts the exact versioned cache schema", () => {
    expect(decodeCachedSample(cachedSampleFixture())).toEqual(cachedSampleFixture());
  });
});

describe("decodeOpEnvelope", () => {
  test("accepts the exact extract request", () => {
    expect(decodeOpEnvelope({ op: "extract", spec: "A system starts." })).toEqual({
      op: "extract",
      spec: "A system starts.",
    });
  });

  test("delegates the complete rank request boundary", () => {
    expect(decodeOpEnvelope(rankRequestFixture())).toEqual(rankRequestFixture());
  });

  test.each([
    ["unknown operation", { op: "delete", spec: "A system starts." }, "$.op"],
    ["missing operation", { spec: "A system starts." }, "$.op"],
    ["extra extract field", { op: "extract", spec: "A system starts.", extra: 1 }, "$"],
  ])("rejects %s", (_label, value, path) => {
    expectDecodeError(decodeOpEnvelope(value), path);
  });

  test("leaves malformed JSON handling to the caller", () => {
    expect(() => JSON.parse('{"op":"extract"')).toThrow(SyntaxError);
  });
});

describe("ApiError retryability", () => {
  test.each([
    ["bad_request", false],
    ["too_long", false],
    ["payload_too_large", false],
    ["rate_limited", true],
    ["model_refusal", false],
    ["model_invalid", true],
    ["upstream_failure", true],
  ] as const)("fixes %s retryability to %s", (code, retryable) => {
    expect(apiError(code, "Safe public message.")).toEqual({
      code,
      message: "Safe public message.",
      retryable,
    });
  });
});
