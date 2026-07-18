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

function expectDecodeSuccess(value: unknown) {
  expect(value).not.toMatchObject({ ok: false });
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

  test("accepts 4,001 Spec characters so Task 5 can return too_long", () => {
    const value = { op: "extract" as const, spec: "x".repeat(4_001) };
    expect(decodeOpEnvelope(value)).toEqual(value);
  });

  test.each([
    ["unknown operation", { op: "delete", spec: "A system starts." }, "$.op"],
    ["missing operation", { spec: "A system starts." }, "$.op"],
  ])("rejects %s", (_label, value, path) => {
    expectDecodeError(decodeOpEnvelope(value), path);
  });
});

const extractionWithStates = (length: number) => {
  const value = extractionFixture();
  return {
    ...value,
    machine: {
      ...value.machine,
      states: Array.from({ length }, (_, index) => ({
        ...value.machine.states[0],
        id: `state_${index}`,
      })),
    },
  };
};

const extractionWithEvents = (length: number) => {
  const value = extractionFixture();
  return {
    ...value,
    machine: {
      ...value.machine,
      events: Array.from({ length }, (_, index) => ({
        ...value.machine.events[0],
        id: `event_${index}`,
      })),
    },
  };
};

const extractionWithTransitions = (length: number) => {
  const value = extractionFixture();
  return {
    ...value,
    machine: {
      ...value.machine,
      transitions: Array.from({ length }, () => ({
        from: "idle",
        event: "start",
        to: "idle",
        evidence: [1],
      })),
    },
  };
};

const rankOutputWithSuggestions = (length: number) => {
  const value = rankOutputFixture();
  return {
    ...value,
    suggestedEvents: Array.from({ length }, (_, index) => ({
      ...value.suggestedEvents[0],
      id: `suggestion_${index}`,
    })),
  };
};

const rankOutputWithHoles = (length: number) => {
  const value = rankOutputFixture();
  return {
    ...value,
    rankedHoles: Array.from({ length }, (_, index) => ({
      ...value.rankedHoles[0],
      eventId: `event_${index}`,
    })),
  };
};

const rankRequestWithSentences = (length: number) => {
  const value = rankRequestFixture();
  return {
    ...value,
    sentences: Array.from({ length }, (_, index) => ({
      index: index + 1,
      text: "Sentence.",
    })),
  };
};

describe("declared hard limits", () => {
  test.each([
    {
      name: "id: 64",
      atMax: () => {
        const value = extractionFixture();
        value.machine.states[0].id = "a".repeat(64);
        return decodeExtractionOutput(value);
      },
      overMax: () => {
        const value = extractionFixture();
        value.machine.states[0].id = "a".repeat(65);
        return decodeExtractionOutput(value);
      },
      path: "$.machine.states[0].id",
    },
    {
      name: "name: 64",
      atMax: () => {
        const value = extractionFixture();
        value.machine.states[0].name = "N".repeat(64);
        return decodeExtractionOutput(value);
      },
      overMax: () => {
        const value = extractionFixture();
        value.machine.states[0].name = "N".repeat(65);
        return decodeExtractionOutput(value);
      },
      path: "$.machine.states[0].name",
    },
    {
      name: "rationale: 300",
      atMax: () => {
        const value = rankOutputFixture();
        value.rankedHoles[0].rationale = "r".repeat(300);
        return decodeRankOutput(value);
      },
      overMax: () => {
        const value = rankOutputFixture();
        value.rankedHoles[0].rationale = "r".repeat(301);
        return decodeRankOutput(value);
      },
      path: "$.rankedHoles[0].rationale",
    },
    {
      name: "surfaceForms: 10",
      atMax: () => {
        const value = extractionFixture();
        value.machine.events[0].surfaceForms = Array(10).fill("starts");
        return decodeExtractionOutput(value);
      },
      overMax: () => {
        const value = extractionFixture();
        value.machine.events[0].surfaceForms = Array(11).fill("starts");
        return decodeExtractionOutput(value);
      },
      path: "$.machine.events[0].surfaceForms",
    },
    {
      name: "Evidence: 20",
      atMax: () => {
        const value = extractionFixture();
        value.machine.states[0].evidence = Array(20).fill(1);
        return decodeExtractionOutput(value);
      },
      overMax: () => {
        const value = extractionFixture();
        value.machine.states[0].evidence = Array(21).fill(1);
        return decodeExtractionOutput(value);
      },
      path: "$.machine.states[0].evidence",
    },
    {
      name: "states: 30",
      atMax: () => decodeExtractionOutput(extractionWithStates(30)),
      overMax: () => decodeExtractionOutput(extractionWithStates(31)),
      path: "$.machine.states",
    },
    {
      name: "events: 30",
      atMax: () => decodeExtractionOutput(extractionWithEvents(30)),
      overMax: () => decodeExtractionOutput(extractionWithEvents(31)),
      path: "$.machine.events",
    },
    {
      name: "transitions: 200",
      atMax: () => decodeExtractionOutput(extractionWithTransitions(200)),
      overMax: () => decodeExtractionOutput(extractionWithTransitions(201)),
      path: "$.machine.transitions",
    },
    {
      name: "suggestions: 10",
      atMax: () => decodeRankOutput(rankOutputWithSuggestions(10)),
      overMax: () => decodeRankOutput(rankOutputWithSuggestions(11)),
      path: "$.suggestedEvents",
    },
    {
      name: "ranked holes: 100",
      atMax: () => decodeRankOutput(rankOutputWithHoles(100)),
      overMax: () => decodeRankOutput(rankOutputWithHoles(101)),
      path: "$.rankedHoles",
    },
    {
      name: "Sentences: 4,000",
      atMax: () => decodeRankRequest(rankRequestWithSentences(4_000)),
      overMax: () => decodeRankRequest(rankRequestWithSentences(4_001)),
      path: "$.sentences",
    },
    {
      name: "Sentence text: 4,000",
      atMax: () => {
        const value = rankRequestFixture();
        value.sentences = [{ index: 1, text: "x".repeat(4_000) }];
        return decodeRankRequest(value);
      },
      overMax: () => {
        const value = rankRequestFixture();
        value.sentences = [{ index: 1, text: "x".repeat(4_001) }];
        return decodeRankRequest(value);
      },
      path: "$.sentences[0].text",
    },
    {
      name: "dropped suggestions: 10",
      atMax: () =>
        decodeCachedSample({ ...cachedSampleFixture(), droppedSuggestions: 10 }),
      overMax: () =>
        decodeCachedSample({ ...cachedSampleFixture(), droppedSuggestions: 11 }),
      path: "$.droppedSuggestions",
    },
    {
      name: "absolute op Spec: 65,536 characters",
      atMax: () => decodeOpEnvelope({ op: "extract", spec: "x".repeat(65_536) }),
      overMax: () => decodeOpEnvelope({ op: "extract", spec: "x".repeat(65_537) }),
      path: "$.spec",
    },
  ])("accepts exact max and rejects max + 1 for $name", ({
    atMax,
    overMax,
    path,
  }) => {
    expectDecodeSuccess(atMax());
    expectDecodeError(overMax(), path);
  });
});

describe("strict object allowlists", () => {
  test.each([
    {
      name: "extraction root",
      decode: () => decodeExtractionOutput({ ...extractionFixture(), extra: true }),
      path: "$",
    },
    {
      name: "viability",
      decode: () => {
        const value = extractionFixture();
        return decodeExtractionOutput({
          ...value,
          viability: { ...value.viability, extra: true },
        });
      },
      path: "$.viability",
    },
    {
      name: "machine",
      decode: () => {
        const value = extractionFixture();
        return decodeExtractionOutput({
          ...value,
          machine: { ...value.machine, extra: true },
        });
      },
      path: "$.machine",
    },
    {
      name: "state",
      decode: () => {
        const value = extractionFixture();
        return decodeExtractionOutput({
          ...value,
          machine: {
            ...value.machine,
            states: [{ ...value.machine.states[0], userAdded: false }],
          },
        });
      },
      path: "$.machine.states[0]",
    },
    {
      name: "event",
      decode: () => {
        const value = extractionFixture();
        return decodeExtractionOutput({
          ...value,
          machine: {
            ...value.machine,
            events: [{ ...value.machine.events[0], extra: true }],
          },
        });
      },
      path: "$.machine.events[0]",
    },
    {
      name: "transition",
      decode: () => {
        const value = extractionFixture();
        return decodeExtractionOutput({
          ...value,
          machine: {
            ...value.machine,
            transitions: [
              {
                from: "idle",
                event: "start",
                to: "idle",
                evidence: [1],
                extra: true,
              },
            ],
          },
        });
      },
      path: "$.machine.transitions[0]",
    },
    {
      name: "ranked hole",
      decode: () => {
        const value = rankOutputFixture();
        return decodeRankOutput({
          ...value,
          rankedHoles: [{ ...value.rankedHoles[0], extra: true }],
        });
      },
      path: "$.rankedHoles[0]",
    },
    {
      name: "suggestion",
      decode: () => {
        const value = rankOutputFixture();
        return decodeRankOutput({
          ...value,
          suggestedEvents: [{ ...value.suggestedEvents[0], evidence: [1] }],
        });
      },
      path: "$.suggestedEvents[0]",
    },
    {
      name: "rank-output root",
      decode: () => decodeRankOutput({ ...rankOutputFixture(), extra: true }),
      path: "$",
    },
    {
      name: "Sentence",
      decode: () => {
        const value = rankRequestFixture();
        return decodeRankRequest({
          ...value,
          sentences: [{ ...value.sentences[0], extra: true }],
        });
      },
      path: "$.sentences[0]",
    },
    {
      name: "cached-sample root",
      decode: () => decodeCachedSample({ ...cachedSampleFixture(), extra: true }),
      path: "$",
    },
    {
      name: "extract-op root",
      decode: () =>
        decodeOpEnvelope({ op: "extract", spec: "A system starts.", extra: true }),
      path: "$",
    },
    {
      name: "rank-op root",
      decode: () =>
        decodeOpEnvelope({
          ...rankRequestFixture(),
          holes: [{ stateId: "idle", eventId: "start" }],
        }),
      path: "$",
    },
  ])("rejects unexpected fields on $name", ({ decode, path }) => {
    expectDecodeError(decode(), path);
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
