import { describe, expect, test } from "vitest";

import type { ExtractionOutput, Machine, RankOutput } from "../lib/machine";
import {
  validateExtraction,
  validateMachineShape,
  validateRankOutput,
} from "../lib/validate";

const validMachine = (): Machine => ({
  states: [
    {
      id: "idle",
      name: "Idle",
      isInitial: true,
      isFinal: false,
      evidence: [1],
    },
    {
      id: "done",
      name: "Done",
      isInitial: false,
      isFinal: true,
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
  transitions: [
    { from: "idle", event: "start", to: "done", evidence: [1] },
  ],
});

const tooManyTransitionsMachine = (): Machine => {
  const states = Array.from({ length: 15 }, (_, index) => ({
    id: `state_${index}`,
    name: `State ${index}`,
    isInitial: index === 0,
    isFinal: false,
    evidence: [1],
  }));
  const events = Array.from({ length: 14 }, (_, index) => ({
    id: `event_${index}`,
    name: `Event ${index}`,
    surfaceForms: [`event ${index}`],
    evidence: [1],
  }));
  const transitions = states
    .flatMap((state) =>
      events.map((event) => ({
        from: state.id,
        event: event.id,
        to: "state_0",
        evidence: [1],
      })),
    )
    .slice(0, 201);
  return { states, events, transitions };
};

const machineInvalidFixtures: Array<{
  name: string;
  machine: Machine;
  expected: { code: string; subject: string };
}> = [
  {
    name: "zero initial states",
    machine: {
      ...validMachine(),
      states: validMachine().states.map((state) => ({
        ...state,
        isInitial: false,
      })),
    },
    expected: { code: "initial_count", subject: "states" },
  },
  {
    name: "two initial states",
    machine: {
      ...validMachine(),
      states: validMachine().states.map((state) => ({
        ...state,
        isInitial: true,
      })),
    },
    expected: { code: "initial_count", subject: "states" },
  },
  {
    name: "duplicate state id",
    machine: {
      ...validMachine(),
      states: [
        validMachine().states[0],
        { ...validMachine().states[1], id: "idle" },
      ],
      transitions: [],
    },
    expected: { code: "dup_id", subject: "states[1].id" },
  },
  {
    name: "blank id",
    machine: {
      ...validMachine(),
      states: [{ ...validMachine().states[0], id: "   " }],
      transitions: [],
    },
    expected: { code: "blank_id", subject: "states[0].id" },
  },
  {
    name: "id outside canonical charset",
    machine: {
      ...validMachine(),
      states: [{ ...validMachine().states[0], id: "Idle-State" }],
      transitions: [],
    },
    expected: { code: "bad_id_charset", subject: "states[0].id" },
  },
  {
    name: "blank name",
    machine: {
      ...validMachine(),
      states: [{ ...validMachine().states[0], name: "\t " }],
      transitions: [],
    },
    expected: { code: "blank_name", subject: "states[0].name" },
  },
  {
    name: "dangling transition target",
    machine: {
      ...validMachine(),
      transitions: [
        { from: "idle", event: "start", to: "missing", evidence: [1] },
      ],
    },
    expected: { code: "dangling_ref", subject: "transitions[0].to" },
  },
  {
    name: "nondeterministic state-event pair",
    machine: {
      ...validMachine(),
      transitions: [
        validMachine().transitions[0],
        { from: "idle", event: "start", to: "idle", evidence: [1] },
      ],
    },
    expected: { code: "nondeterministic", subject: "transitions[1]" },
  },
  {
    name: "outgoing transition from final state",
    machine: {
      ...validMachine(),
      transitions: [
        { from: "done", event: "start", to: "idle", evidence: [1] },
      ],
    },
    expected: { code: "final_outgoing", subject: "transitions[0].from" },
  },
  {
    name: "31 states",
    machine: {
      states: Array.from({ length: 31 }, (_, index) => ({
        id: `state_${index}`,
        name: `State ${index}`,
        isInitial: index === 0,
        isFinal: false,
        evidence: [1],
      })),
      events: [],
      transitions: [],
    },
    expected: { code: "too_large", subject: "states" },
  },
  {
    name: "31 events",
    machine: {
      states: [validMachine().states[0]],
      events: Array.from({ length: 31 }, (_, index) => ({
        id: `event_${index}`,
        name: `Event ${index}`,
        surfaceForms: [`event ${index}`],
        evidence: [1],
      })),
      transitions: [],
    },
    expected: { code: "too_large", subject: "events" },
  },
  {
    name: "201 transitions",
    machine: tooManyTransitionsMachine(),
    expected: { code: "too_large", subject: "transitions" },
  },
];

describe("validateMachineShape", () => {
  test("the matrix contains exactly 9 codes plus 3 stated boundary fixtures", () => {
    expect(machineInvalidFixtures).toHaveLength(12);
  });

  test.each(machineInvalidFixtures)("returns the exact code and subject for $name", ({
    machine,
    expected,
  }) => {
    const identities = validateMachineShape(machine).map(({ code, subject }) => ({
      code,
      subject,
    }));
    expect(identities).toEqual([expected]);
  });

  test("accepts a valid flat machine", () => {
    expect(validateMachineShape(validMachine())).toEqual([]);
  });
});

const validExtraction = (): ExtractionOutput => ({
  viability: { isSpec: true, reason: "This is a behavioral feature spec." },
  machine: validMachine(),
});

const extractionInvalidFixtures: Array<{
  name: string;
  output: ExtractionOutput;
  sentenceCount: number;
  expected: { code: string; subject: string };
}> = [
  {
    name: "evidence index zero",
    output: {
      ...validExtraction(),
      machine: {
        ...validMachine(),
        states: [{ ...validMachine().states[0], evidence: [0] }, validMachine().states[1]],
      },
    },
    sentenceCount: 1,
    expected: { code: "evidence_range", subject: "states[0].evidence[0]" },
  },
  {
    name: "evidence index above the Sentence count",
    output: {
      ...validExtraction(),
      machine: {
        ...validMachine(),
        events: [{ ...validMachine().events[0], evidence: [2] }],
      },
    },
    sentenceCount: 1,
    expected: { code: "evidence_range", subject: "events[0].evidence[0]" },
  },
  {
    name: "empty Evidence on a model-derived element",
    output: {
      ...validExtraction(),
      machine: {
        ...validMachine(),
        states: [{ ...validMachine().states[0], evidence: [] }, validMachine().states[1]],
      },
    },
    sentenceCount: 1,
    expected: { code: "no_evidence", subject: "states[0].evidence" },
  },
  {
    name: "empty surface form list",
    output: {
      ...validExtraction(),
      machine: {
        ...validMachine(),
        events: [{ ...validMachine().events[0], surfaceForms: [] }],
      },
    },
    sentenceCount: 1,
    expected: { code: "bad_surface_forms", subject: "events[0].surfaceForms" },
  },
  {
    name: "blank surface form",
    output: {
      ...validExtraction(),
      machine: {
        ...validMachine(),
        events: [{ ...validMachine().events[0], surfaceForms: ["\t "] }],
      },
    },
    sentenceCount: 1,
    expected: { code: "bad_surface_forms", subject: "events[0].surfaceForms[0]" },
  },
  {
    name: "duplicate surface form",
    output: {
      ...validExtraction(),
      machine: {
        ...validMachine(),
        events: [{ ...validMachine().events[0], surfaceForms: ["starts", "starts"] }],
      },
    },
    sentenceCount: 1,
    expected: { code: "bad_surface_forms", subject: "events[0].surfaceForms[1]" },
  },
  {
    name: "blank viability rationale",
    output: {
      ...validExtraction(),
      viability: { isSpec: true, reason: " \n\t" },
    },
    sentenceCount: 1,
    expected: { code: "bad_rationale", subject: "viability.reason" },
  },
];

const extractionPassingFixtures: Array<{
  name: string;
  output: ExtractionOutput;
  sentenceCount: number;
}> = [
  {
    name: "user-added element with empty Evidence",
    output: (() => {
      const output = validExtraction();
      output.machine!.states[0] = {
        ...output.machine!.states[0],
        evidence: [],
        userAdded: true,
      };
      return output;
    })(),
    sentenceCount: 1,
  },
];

describe("validateExtraction", () => {
  test("the matrix contains exactly 4 codes plus 4 stated boundary fixtures", () => {
    expect(extractionInvalidFixtures.length + extractionPassingFixtures.length).toBe(8);
  });

  test.each(extractionInvalidFixtures)("returns the exact code and subject for $name", ({
    output,
    sentenceCount,
    expected,
  }) => {
    const identities = validateExtraction(output, sentenceCount).map(({ code, subject }) => ({
      code,
      subject,
    }));
    expect(identities).toEqual([expected]);
  });

  test.each(extractionPassingFixtures)("accepts $name", ({ output, sentenceCount }) => {
    expect(validateExtraction(output, sentenceCount)).toEqual([]);
  });
});

const validRankOutput = (): RankOutput => ({
  rankedHoles: [
    {
      stateId: "idle",
      eventId: "start",
      relevance: 0.8,
      rationale: "The idle/start pair has no defined transition.",
      suggestedTargetStateId: "done",
    },
  ],
  suggestedEvents: [
    {
      id: "timeout",
      name: "Timeout",
      surfaceForms: ["times out"],
      rationale: "Long-running work may time out.",
      confidence: 0.7,
    },
  ],
});

const rankInvalidFixtures: Array<{
  name: string;
  output: RankOutput;
  expected: { code: string; subject: string };
}> = [
  {
    name: "collision between two Suggested Events",
    output: {
      ...validRankOutput(),
      suggestedEvents: [
        validRankOutput().suggestedEvents[0],
        {
          ...validRankOutput().suggestedEvents[0],
          name: "A second timeout",
        },
      ],
    },
    expected: { code: "suggested_collision", subject: "suggestedEvents[1].id" },
  },
  {
    name: "confidence below zero",
    output: {
      ...validRankOutput(),
      suggestedEvents: [
        { ...validRankOutput().suggestedEvents[0], confidence: -0.1 },
      ],
    },
    expected: { code: "bad_confidence", subject: "suggestedEvents[0].confidence" },
  },
  {
    name: "confidence above one",
    output: {
      ...validRankOutput(),
      suggestedEvents: [
        { ...validRankOutput().suggestedEvents[0], confidence: 1.1 },
      ],
    },
    expected: { code: "bad_confidence", subject: "suggestedEvents[0].confidence" },
  },
  {
    name: "blank rank rationale",
    output: {
      ...validRankOutput(),
      rankedHoles: [
        { ...validRankOutput().rankedHoles[0], rationale: "\n " },
      ],
    },
    expected: { code: "bad_rationale", subject: "rankedHoles[0].rationale" },
  },
];

const rankPassingFixtures: Array<{ name: string; output: RankOutput }> = [
  {
    name: "Suggested Event id matching a machine event id",
    output: {
      ...validRankOutput(),
      suggestedEvents: [
        {
          ...validRankOutput().suggestedEvents[0],
          id: "start",
          name: "Another start",
        },
      ],
    },
  },
];

describe("validateRankOutput", () => {
  test("the matrix contains exactly 3 codes plus 2 stated boundary fixtures", () => {
    expect(rankInvalidFixtures.length + rankPassingFixtures.length).toBe(5);
  });

  test.each(rankInvalidFixtures)("returns the exact code and subject for $name", ({
    output,
    expected,
  }) => {
    const identities = validateRankOutput(output).map(({ code, subject }) => ({
      code,
      subject,
    }));
    expect(identities).toEqual([expected]);
  });

  test.each(rankPassingFixtures)("accepts $name", ({ output }) => {
    expect(validateRankOutput(output)).toEqual([]);
  });
});

test("the complete semantic matrix equals the independent literal 25-fixture inventory", () => {
  const constructedInventory = [
    ...machineInvalidFixtures.map(({ name, expected }) => ({ name, ...expected })),
    ...extractionInvalidFixtures.map(({ name, expected }) => ({ name, ...expected })),
    ...extractionPassingFixtures.map(({ name }) => ({
      name,
      code: null,
      subject: null,
    })),
    ...rankInvalidFixtures.map(({ name, expected }) => ({ name, ...expected })),
    ...rankPassingFixtures.map(({ name }) => ({
      name,
      code: null,
      subject: null,
    })),
  ];

  expect(constructedInventory).toEqual([
    { name: "zero initial states", code: "initial_count", subject: "states" },
    { name: "two initial states", code: "initial_count", subject: "states" },
    { name: "duplicate state id", code: "dup_id", subject: "states[1].id" },
    { name: "blank id", code: "blank_id", subject: "states[0].id" },
    {
      name: "id outside canonical charset",
      code: "bad_id_charset",
      subject: "states[0].id",
    },
    { name: "blank name", code: "blank_name", subject: "states[0].name" },
    {
      name: "dangling transition target",
      code: "dangling_ref",
      subject: "transitions[0].to",
    },
    {
      name: "nondeterministic state-event pair",
      code: "nondeterministic",
      subject: "transitions[1]",
    },
    {
      name: "outgoing transition from final state",
      code: "final_outgoing",
      subject: "transitions[0].from",
    },
    { name: "31 states", code: "too_large", subject: "states" },
    { name: "31 events", code: "too_large", subject: "events" },
    { name: "201 transitions", code: "too_large", subject: "transitions" },
    {
      name: "evidence index zero",
      code: "evidence_range",
      subject: "states[0].evidence[0]",
    },
    {
      name: "evidence index above the Sentence count",
      code: "evidence_range",
      subject: "events[0].evidence[0]",
    },
    {
      name: "empty Evidence on a model-derived element",
      code: "no_evidence",
      subject: "states[0].evidence",
    },
    {
      name: "empty surface form list",
      code: "bad_surface_forms",
      subject: "events[0].surfaceForms",
    },
    {
      name: "blank surface form",
      code: "bad_surface_forms",
      subject: "events[0].surfaceForms[0]",
    },
    {
      name: "duplicate surface form",
      code: "bad_surface_forms",
      subject: "events[0].surfaceForms[1]",
    },
    {
      name: "blank viability rationale",
      code: "bad_rationale",
      subject: "viability.reason",
    },
    {
      name: "user-added element with empty Evidence",
      code: null,
      subject: null,
    },
    {
      name: "collision between two Suggested Events",
      code: "suggested_collision",
      subject: "suggestedEvents[1].id",
    },
    {
      name: "confidence below zero",
      code: "bad_confidence",
      subject: "suggestedEvents[0].confidence",
    },
    {
      name: "confidence above one",
      code: "bad_confidence",
      subject: "suggestedEvents[0].confidence",
    },
    {
      name: "blank rank rationale",
      code: "bad_rationale",
      subject: "rankedHoles[0].rationale",
    },
    {
      name: "Suggested Event id matching a machine event id",
      code: null,
      subject: null,
    },
  ]);
});
