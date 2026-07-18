import { Readable } from "node:stream";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  createLlmHandler,
  createNodeLlmHandler,
  resetLlmRateLimiterForTests,
  type ModelTransport,
} from "../api/llm";
import {
  ATTEMPT_MAX_MS,
  ATTEMPT_MIN_MS,
  REQUEST_BUDGET_MS,
  createRequestBudget,
} from "../lib/budget";
import {
  EXTRACTION_DEVELOPER_PROMPT,
  EXTRACTION_SCHEMA,
} from "../lib/schemas";
import type { Machine } from "../lib/machine";

const SPEC = "The workflow starts idle. When start occurs, it becomes done.";

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
      evidence: [2],
    },
  ],
  events: [
    {
      id: "start",
      name: "Start",
      surfaceForms: ["start occurs"],
      evidence: [2],
    },
  ],
  transitions: [
    { from: "idle", event: "start", to: "done", evidence: [2] },
  ],
});

const validExtraction = () => ({
  viability: { isSpec: true, reason: "A behavioral workflow spec." },
  machine: validMachine(),
});

const validRankMachine = (): Machine => ({
  ...validMachine(),
  events: [
    ...validMachine().events,
    {
      id: "cancel",
      name: "Cancel",
      surfaceForms: ["cancel"],
      evidence: [1],
    },
  ],
});

const validRankOutput = () => ({
  rankedHoles: [{
    stateId: "idle",
    eventId: "cancel",
    relevance: 0.93,
    rationale: "Cancellation is defined elsewhere and needs a decision here.",
    suggestedTargetStateId: "done",
  }],
  suggestedEvents: [
    {
      id: "timeout",
      name: "Timeout",
      surfaceForms: ["times out"],
      rationale: "Long-running work may time out.",
      confidence: 0.72,
    },
    {
      id: "start",
      name: "Duplicate event id",
      surfaceForms: ["starts again"],
      rationale: "Must be removed because it collides with the machine.",
      confidence: 0.5,
    },
  ],
});

const invalidDanglingExtraction = () => ({
  ...validExtraction(),
  machine: {
    ...validMachine(),
    transitions: [
      { from: "idle", event: "start", to: "missing", evidence: [2] },
    ],
  },
});

const output = (value: unknown) => ({
  kind: "output" as const,
  outputText: JSON.stringify(value),
});

function queuedTransport(...results: Array<unknown>): ModelTransport {
  return {
    create: vi.fn(async () => {
      const next = results.shift();
      if (next instanceof Error) throw next;
      if (next === undefined) throw new Error("No fake model result queued.");
      return next as Awaited<ReturnType<ModelTransport["create"]>>;
    }),
  };
}

function request(
  body: BodyInit = JSON.stringify({ op: "extract", spec: SPEC }),
  init: Omit<RequestInit, "body"> & { duplex?: "half" } = {},
): Request {
  const requestInit: RequestInit & { duplex?: "half" } = {
    method: "POST",
    headers: { "content-type": "application/json", ...init.headers },
    ...init,
    body,
  };
  return new Request("http://localhost/api/llm", requestInit);
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  resetLlmRateLimiterForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("strict extraction contract", () => {
  test("uses an object-root strict schema at every nested object", () => {
    const objects: Array<Record<string, unknown>> = [];
    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value !== "object" || value === null) return;
      const record = value as Record<string, unknown>;
      if (record.type === "object") objects.push(record);
      Object.values(record).forEach(visit);
    };
    visit(EXTRACTION_SCHEMA);

    expect(EXTRACTION_SCHEMA).toMatchObject({ type: "object" });
    expect(objects.length).toBeGreaterThan(4);
    for (const objectSchema of objects) {
      expect(objectSchema.additionalProperties).toBe(false);
      expect(objectSchema.required).toEqual(
        Object.keys(objectSchema.properties as Record<string, unknown>),
      );
    }
    const serialized = JSON.stringify(EXTRACTION_SCHEMA);
    expect(serialized).not.toContain("suggestedEvents");
    expect(serialized).not.toContain("uniqueItems");
  });

  test("prompt binds flat FSM, canonical ids, surfaceForms, Evidence, and no suggestions", () => {
    expect(EXTRACTION_DEVELOPER_PROMPT).toMatch(/flat state machine/i);
    expect(EXTRACTION_DEVELOPER_PROMPT).toMatch(/outcome event/i);
    expect(EXTRACTION_DEVELOPER_PROMPT).toMatch(/bounded repetition/i);
    expect(EXTRACTION_DEVELOPER_PROMPT).toMatch(/\^\[a-z0-9_\]\+\$/);
    expect(EXTRACTION_DEVELOPER_PROMPT).toContain("surfaceForms");
    expect(EXTRACTION_DEVELOPER_PROMPT).toMatch(/Evidence.*Sentence numbers/is);
    expect(EXTRACTION_DEVELOPER_PROMPT).toMatch(/do not suggest/i);
  });
});

describe("semantic repair loop", () => {
  test("repairs a dangling reference and returns the real decoded result", async () => {
    const transport = queuedTransport(
      output(invalidDanglingExtraction()),
      output(validExtraction()),
    );
    const response = await createLlmHandler({ transport })(request());

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      kind: "machine",
      machine: validMachine(),
      sentences: [
        { index: 1, text: "The workflow starts idle." },
        { index: 2, text: "When start occurs, it becomes done." },
      ],
    });
    expect(transport.create).toHaveBeenCalledTimes(2);
    expect(vi.mocked(transport.create).mock.calls[1][0].input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringMatching(/dangling_ref/),
        }),
      ]),
    );
  });

  test("returns model_invalid after three semantic failures", async () => {
    const transport = queuedTransport(
      output(invalidDanglingExtraction()),
      output(invalidDanglingExtraction()),
      output(invalidDanglingExtraction()),
    );
    const response = await createLlmHandler({ transport })(request());

    expect(response.status).toBe(502);
    expect(await json(response)).toEqual({
      code: "model_invalid",
      message: expect.any(String),
      retryable: true,
    });
    expect(transport.create).toHaveBeenCalledTimes(3);
  });

  test("repairs isSpec false with a non-null machine", async () => {
    const contradictory = {
      viability: { isSpec: false, reason: "Not behavioral." },
      machine: validMachine(),
    };
    const transport = queuedTransport(
      output(contradictory),
      output({
        viability: { isSpec: false, reason: "This is not a behavioral spec." },
        machine: null,
      }),
    );
    const response = await createLlmHandler({ transport })(request());

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      kind: "not_spec",
      reason: "This is not a behavioral spec.",
      sentences: expect.any(Array),
    });
    expect(transport.create).toHaveBeenCalledTimes(2);
  });

  test("repairs isSpec true with a null machine", async () => {
    const transport = queuedTransport(
      output({
        viability: { isSpec: true, reason: "A behavioral workflow spec." },
        machine: null,
      }),
      output(validExtraction()),
    );
    const response = await createLlmHandler({ transport })(request());

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ kind: "machine" });
    expect(transport.create).toHaveBeenCalledTimes(2);
  });

  test.each([
    {
      name: "malformed JSON",
      modelResult: { kind: "output" as const, outputText: "not json" },
    },
    {
      name: "strict decoder failure",
      modelResult: output({
        viability: { isSpec: true, reason: "A behavioral workflow spec." },
        machine: {
          ...validMachine(),
          states: [{ ...validMachine().states[0], id: true }],
        },
      }),
    },
  ])("returns terminal model_invalid for $name", async ({ modelResult }) => {
    const transport = queuedTransport(modelResult, output(validExtraction()));
    const response = await createLlmHandler({ transport })(request());

    expect(response.status).toBe(502);
    expect(await json(response)).toEqual({
      code: "model_invalid",
      message: "The model could not produce a valid extraction.",
      retryable: true,
    });
    expect(transport.create).toHaveBeenCalledTimes(1);
  });

  test("sends model gpt-5.6, strict schema format, and a 20s first slot", async () => {
    const transport = queuedTransport(output(validExtraction()));
    await createLlmHandler({ transport })(request());

    expect(transport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.6",
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "state_gap_extraction",
            strict: true,
            schema: EXTRACTION_SCHEMA,
          },
        },
      }),
      { timeout: 20_000 },
    );
  });
});

describe("rank operation", () => {
  const rankRequest = (machine: Machine = validRankMachine()) => request(JSON.stringify({
    op: "rank",
    machine,
    sentences: [
      { index: 1, text: "The workflow starts idle." },
      { index: 2, text: "When start occurs, it becomes done." },
    ],
  }));

  test("recomputes holes server-side, limits the model input, and drops machine id collisions", async () => {
    const transport = queuedTransport(output(validRankOutput()));
    const response = await createLlmHandler({ transport })(rankRequest());

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      kind: "rank",
      rankedHoles: validRankOutput().rankedHoles,
      suggestedEvents: [validRankOutput().suggestedEvents[0]],
      truncated: false,
      droppedSuggestions: 1,
    });
    expect(transport.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(transport.create).mock.calls[0][0].input.at(-1)?.content).toContain(
      '"stateId":"idle"',
    );
  });

  test.each([
    [100, false],
    [101, true],
  ])("sets truncation at the %i hole boundary", async (holeCount, truncated) => {
    const events = Array.from({ length: 26 }, (_, index) => ({
      id: `event_${index}`,
      name: `Event ${index}`,
      surfaceForms: [`event ${index}`],
      evidence: [1],
    }));
    const machine: Machine = {
      states: Array.from({ length: 4 }, (_, index) => ({
        id: `state_${index}`,
        name: `State ${index}`,
        isInitial: index === 0,
        isFinal: false,
        evidence: [1],
      })),
      events,
      transitions: Array.from({ length: 104 - holeCount }, (_, index) => ({
        from: "state_0",
        event: events[index].id,
        to: "state_0",
        evidence: [1],
      })),
    };
    const transport = queuedTransport(output({ rankedHoles: [], suggestedEvents: [] }));
    const response = await createLlmHandler({ transport })(rankRequest(machine));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ kind: "rank", truncated });
    const modelInput = vi.mocked(transport.create).mock.calls[0][0].input.at(-1)?.content;
    const sentHoles = JSON.parse(
      modelInput?.match(/BEGIN STRUCTURAL MISSING TRANSITIONS\n(.+)\nEND/s)?.[1] ?? "[]",
    ) as unknown[];
    expect(sentHoles).toHaveLength(100);
  });

  test("rejects an invalid machine before a rank model call", async () => {
    const invalid = validRankMachine();
    invalid.transitions[0] = { ...invalid.transitions[0], to: "ghost" };
    const transport = queuedTransport(output(validRankOutput()));
    const response = await createLlmHandler({ transport })(rankRequest(invalid));

    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ code: "bad_request", retryable: false });
    expect(transport.create).not.toHaveBeenCalled();
  });

  test.each([
    ["refusal", { kind: "refusal" as const }, 422, "model_refusal"],
    ["structural output", { kind: "output" as const, outputText: "not json" }, 502, "model_invalid"],
    ["transport", new Error("network down"), 503, "upstream_failure"],
  ])("maps rank $0 to the prescribed error", async (_label, result, status, code) => {
    const transport = queuedTransport(result);
    const response = await createLlmHandler({ transport })(rankRequest());

    expect(response.status).toBe(status);
    expect(await json(response)).toMatchObject({ code });
  });

  test("repairs rank semantic failures but keeps structural failures terminal", async () => {
    const invalid = validRankOutput();
    invalid.rankedHoles[0].rationale = " \n";
    const transport = queuedTransport(output(invalid), output(validRankOutput()));
    const response = await createLlmHandler({ transport })(rankRequest());

    expect(response.status).toBe(200);
    expect(transport.create).toHaveBeenCalledTimes(2);
    expect(vi.mocked(transport.create).mock.calls[1][0].input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: expect.stringMatching(/bad_rationale/) }),
      ]),
    );
  });

  test("returns model_invalid after three rank semantic failures", async () => {
    const invalid = validRankOutput();
    invalid.suggestedEvents[0].confidence = 1.1;
    const transport = queuedTransport(output(invalid), output(invalid), output(invalid));
    const response = await createLlmHandler({ transport })(rankRequest());

    expect(response.status).toBe(502);
    expect(await json(response)).toMatchObject({ code: "model_invalid", retryable: true });
    expect(transport.create).toHaveBeenCalledTimes(3);
  });
});

describe("terminal model failures", () => {
  test("maps a refusal to 422 without repair", async () => {
    const transport = queuedTransport({ kind: "refusal" });
    const response = await createLlmHandler({ transport })(request());

    expect(response.status).toBe(422);
    expect(await json(response)).toEqual({
      code: "model_refusal",
      message: expect.any(String),
      retryable: false,
    });
    expect(transport.create).toHaveBeenCalledTimes(1);
  });

  test("maps a transport throw to 503 without leaking its message", async () => {
    const transport = queuedTransport(new Error("secret upstream detail"));
    const response = await createLlmHandler({ transport })(request());
    const body = await json(response);

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: "upstream_failure",
      message: expect.any(String),
      retryable: true,
    });
    expect(JSON.stringify(body)).not.toContain("secret upstream detail");
    expect(transport.create).toHaveBeenCalledTimes(1);
  });

  test("maps a missing process credential to upstream_failure", async () => {
    const oldKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const response = await createLlmHandler()(request());
      expect(response.status).toBe(503);
      expect(await json(response)).toMatchObject({
        code: "upstream_failure",
        retryable: true,
      });
    } finally {
      if (oldKey !== undefined) process.env.OPENAI_API_KEY = oldKey;
    }
  });
});

describe("ordered raw request gates", () => {
  test("method gate returns 405 before content type and model", async () => {
    const transport = queuedTransport(output(validExtraction()));
    const response = await createLlmHandler({ transport })(
      new Request("http://localhost/api/llm", { method: "GET" }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(await json(response)).toMatchObject({ code: "bad_request" });
    expect(transport.create).not.toHaveBeenCalled();
  });

  test("content-type gate accepts JSON parameters and rejects text/plain", async () => {
    const rejectedTransport = queuedTransport(output(validExtraction()));
    const rejected = await createLlmHandler({ transport: rejectedTransport })(
      request("{}", { headers: { "content-type": "text/plain" } }),
    );
    expect(rejected.status).toBe(415);
    expect(await json(rejected)).toMatchObject({ code: "bad_request" });
    expect(rejectedTransport.create).not.toHaveBeenCalled();

    const acceptedTransport = queuedTransport(output(validExtraction()));
    const accepted = await createLlmHandler({ transport: acceptedTransport })(
      request(JSON.stringify({ op: "extract", spec: SPEC }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );
    expect(accepted.status).toBe(200);
  });

  test("64 KiB exactly passes the byte gate and 64 KiB plus one is rejected", async () => {
    const encoded = JSON.stringify({ op: "extract", spec: SPEC });
    const exact = encoded + " ".repeat(65_536 - Buffer.byteLength(encoded));
    expect(Buffer.byteLength(exact)).toBe(65_536);

    const exactTransport = queuedTransport(output(validExtraction()));
    const exactResponse = await createLlmHandler({ transport: exactTransport })(
      request(exact),
    );
    expect(exactResponse.status).toBe(200);
    expect(exactTransport.create).toHaveBeenCalledTimes(1);

    const tooLargeTransport = queuedTransport(output(validExtraction()));
    const tooLargeResponse = await createLlmHandler({ transport: tooLargeTransport })(
      request(`${exact} `),
    );
    expect(tooLargeResponse.status).toBe(413);
    expect(await json(tooLargeResponse)).toMatchObject({
      code: "payload_too_large",
      retryable: false,
    });
    expect(tooLargeTransport.create).not.toHaveBeenCalled();
  });

  test("counts UTF-8 bytes when a multibyte character straddles the limit", async () => {
    const straddled = " ".repeat(65_535) + "é";
    expect(straddled.length).toBe(65_536);
    expect(Buffer.byteLength(straddled)).toBe(65_537);
    const transport = queuedTransport(output(validExtraction()));

    const response = await createLlmHandler({ transport })(request(straddled));

    expect(response.status).toBe(413);
    expect(transport.create).not.toHaveBeenCalled();
  });

  test("malformed JSON returns 400 before envelope decode and model", async () => {
    const transport = queuedTransport(output(validExtraction()));
    const response = await createLlmHandler({ transport })(request("{"));

    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ code: "bad_request" });
    expect(transport.create).not.toHaveBeenCalled();
  });

  test("invalid op envelope returns 400 before the limiter and model", async () => {
    const transport: ModelTransport = {
      create: vi.fn(async () => output(validExtraction())),
    };
    const handler = createLlmHandler({ transport });
    const invalid = await handler(request(JSON.stringify({ op: "delete" })));
    expect(invalid.status).toBe(400);

    for (let index = 0; index < 10; index += 1) {
      const response = await handler(request());
      expect(response.status).toBe(200);
    }
    expect(transport.create).toHaveBeenCalledTimes(10);
  });

  test("rejects whitespace and 4,001 characters without a model call", async () => {
    for (const [spec, code] of [
      [" \n\t ", "bad_request"],
      ["x".repeat(4_001), "too_long"],
    ] as const) {
      resetLlmRateLimiterForTests();
      const transport = queuedTransport(output(validExtraction()));
      const response = await createLlmHandler({ transport })(
        request(JSON.stringify({ op: "extract", spec })),
      );
      expect(response.status).toBe(400);
      expect(await json(response)).toMatchObject({ code, retryable: false });
      expect(transport.create).not.toHaveBeenCalled();
    }
  });

  test("normalizes an unexpected raw stream error to 503", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("private stream failure"));
      },
    });
    const transport = queuedTransport(output(validExtraction()));
    const response = await createLlmHandler({ transport })(request(stream, { duplex: "half" }));
    const body = await json(response);

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ code: "upstream_failure", retryable: true });
    expect(JSON.stringify(body)).not.toContain("private stream failure");
  });
});

describe("one shared per-IP rate limiter", () => {
  const rankEnvelope = () => ({
    op: "rank",
    machine: validMachine(),
    sentences: [
      { index: 1, text: "The workflow starts idle." },
      { index: 2, text: "When start occurs, it becomes done." },
    ],
  });

  test("the 11th valid request across mixed operations returns 429 before transport", async () => {
    const transport: ModelTransport = {
      create: vi.fn(async () => output(validExtraction())),
    };
    const handler = createLlmHandler({ transport });
    const headers = {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
    };

    for (let index = 0; index < 10; index += 1) {
      const body = index % 2 === 0
        ? { op: "extract", spec: SPEC }
        : rankEnvelope();
      await handler(request(JSON.stringify(body), { headers }));
    }
    expect(transport.create).toHaveBeenCalledTimes(10);

    const response = await handler(
      request(JSON.stringify({ op: "extract", spec: SPEC }), { headers }),
    );
    expect(response.status).toBe(429);
    expect(await json(response)).toEqual({
      code: "rate_limited",
      message: expect.any(String),
      retryable: true,
    });
    expect(transport.create).toHaveBeenCalledTimes(10);
  });

  test("prunes expired minute buckets", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T10:00:00Z"));
    const transport: ModelTransport = {
      create: vi.fn(async () => output(validExtraction())),
    };
    const handler = createLlmHandler({ transport });

    for (let index = 0; index < 10; index += 1) {
      expect((await handler(request())).status).toBe(200);
    }
    vi.advanceTimersByTime(60_000);

    expect((await handler(request())).status).toBe(200);
    expect(transport.create).toHaveBeenCalledTimes(11);
  });
});

describe("request attempt budget", () => {
  test("uses the exact 50s deadline, 20s cap, and 15s minimum", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00Z"));
    const start = Date.now();
    const budget = createRequestBudget();

    expect(REQUEST_BUDGET_MS).toBe(50_000);
    expect(ATTEMPT_MAX_MS).toBe(20_000);
    expect(ATTEMPT_MIN_MS).toBe(15_000);
    expect(budget.deadline).toBe(start + 50_000);
    expect(budget.nextAttemptTimeout()).toBe(20_000);

    vi.advanceTimersByTime(20_000);
    expect(budget.nextAttemptTimeout()).toBe(20_000);
    vi.advanceTimersByTime(15_000);
    expect(budget.nextAttemptTimeout()).toBe(15_000);
    vi.advanceTimersByTime(1);
    expect(budget.nextAttemptTimeout()).toBeNull();
  });

  test("two slow semantic failures exhaust the budget as model_invalid", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00Z"));
    const transport: ModelTransport = {
      create: vi.fn(async () => {
        vi.advanceTimersByTime(20_000);
        return output(invalidDanglingExtraction());
      }),
    };

    const response = await createLlmHandler({ transport })(request());

    expect(response.status).toBe(502);
    expect(await json(response)).toMatchObject({ code: "model_invalid" });
    expect(transport.create).toHaveBeenCalledTimes(2);
    expect(vi.mocked(transport.create).mock.calls.map((call) => call[1].timeout)).toEqual([
      20_000,
      20_000,
    ]);
  });

  test("starts the 50-second deadline before raw request processing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00Z"));
    const encoded = new TextEncoder().encode(JSON.stringify({ op: "extract", spec: SPEC }));
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) {
          controller.close();
          return;
        }
        sent = true;
        vi.advanceTimersByTime(36_000);
        controller.enqueue(encoded);
      },
    });
    const transport = queuedTransport(output(validExtraction()));

    const response = await createLlmHandler({ transport })(request(stream, { duplex: "half" }));

    expect(response.status).toBe(503);
    expect(await json(response)).toMatchObject({ code: "upstream_failure" });
    expect(transport.create).not.toHaveBeenCalled();
  });

  test("shrinks a third attempt to the remaining 15-second slot", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00Z"));
    let call = 0;
    const transport: ModelTransport = {
      create: vi.fn(async () => {
        call += 1;
        if (call === 1) vi.advanceTimersByTime(15_000);
        if (call === 2) vi.advanceTimersByTime(20_000);
        return call < 3
          ? output(invalidDanglingExtraction())
          : output(validExtraction());
      }),
    };

    const response = await createLlmHandler({ transport })(request());

    expect(response.status).toBe(200);
    expect(vi.mocked(transport.create).mock.calls.map((modelCall) => modelCall[1].timeout)).toEqual([
      20_000,
      20_000,
      15_000,
    ]);
  });
});

describe("raw Node adapter", () => {
  test("reads the IncomingMessage stream instead of request.body", async () => {
    const transport = queuedTransport(output(validExtraction()));
    const nodeHandler = createNodeLlmHandler({ transport });
    const raw = Readable.from([
      Buffer.from(JSON.stringify({ op: "extract", spec: SPEC }), "utf8"),
    ]) as Readable & {
      method?: string;
      headers: Record<string, string>;
      body?: unknown;
    };
    raw.method = "POST";
    raw.headers = { "content-type": "application/json" };
    Object.defineProperty(raw, "body", {
      get() {
        throw new Error("lazy body parser must not be touched");
      },
    });

    let status = 0;
    let payload = "";
    const response = {
      statusCode: 200,
      setHeader: vi.fn(),
      end(value?: string) {
        status = this.statusCode;
        payload = value ?? "";
      },
    };
    await nodeHandler(raw, response);

    expect(status).toBe(200);
    expect(JSON.parse(payload)).toMatchObject({ kind: "machine" });
    expect(transport.create).toHaveBeenCalledTimes(1);
  });
});
