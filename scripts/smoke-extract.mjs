// fallow-ignore-file unused-file
import { readFile } from "node:fs/promises";

const endpoint = process.env.STATE_GAP_MAPPER_ENDPOINT ??
  "http://localhost:3000/api/llm";
const sampleUrl = new URL("../samples/order-checkout.txt", import.meta.url);
const spec = await readFile(sampleUrl, "utf8");

const expectedStates = new Set([
  "cart",
  "processing",
  "paid",
  "cancelled",
  "shipped",
]);
const expectedTransitions = new Set([
  "cart checkout processing",
  "processing payment_succeeded paid",
  "processing payment_failed cart",
  "cart cancel cancelled",
  "paid handed_to_courier shipped",
]);

const fail = (message) => {
  console.error(`Smoke check failed: ${message}`);
  process.exitCode = 1;
};

const evidenceArrays = (machine) => [
  ...machine.states.map((state) => state.evidence),
  ...machine.events.map((event) => event.evidence),
  ...machine.transitions.map((transition) => transition.evidence),
];

const started = performance.now();
let response;
try {
  response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "extract", spec }),
    signal: AbortSignal.timeout(55_000),
  });
} catch (error) {
  fail(
    `could not reach ${endpoint}. Start "npm run dev" with OPENAI_API_KEY in the server environment. ${error instanceof Error ? error.message : "Network error."}`,
  );
  process.exit();
}

const elapsedMs = Math.round(performance.now() - started);
const raw = await response.text();
let payload;
try {
  payload = JSON.parse(raw);
} catch {
  fail(`server returned non-JSON with HTTP ${response.status}.`);
  process.exit();
}

if (!response.ok) {
  const code = typeof payload?.code === "string" ? payload.code : "unknown_error";
  const message = typeof payload?.message === "string" ? payload.message : "No message.";
  fail(`HTTP ${response.status} ${code}: ${message}`);
  process.exit();
}

if (payload?.kind !== "machine" || typeof payload.machine !== "object" || payload.machine === null) {
  fail(`expected a machine response, received ${JSON.stringify(payload?.kind)}.`);
  process.exit();
}

const { machine, sentences } = payload;
if (!Array.isArray(machine.states) || !Array.isArray(machine.events) ||
    !Array.isArray(machine.transitions) || !Array.isArray(sentences)) {
  fail("response is missing machine arrays or numbered Sentences.");
  process.exit();
}

const stateIds = new Set(machine.states.map((state) => state.id));
const transitions = new Set(
  machine.transitions.map(({ from, event, to }) => `${from} ${event} ${to}`),
);
const missingStates = [...expectedStates].filter((id) => !stateIds.has(id));
const missingTransitions = [...expectedTransitions].filter((edge) => !transitions.has(edge));
const evidenceInRange = evidenceArrays(machine).every(
  (evidence) => Array.isArray(evidence) && evidence.length > 0 &&
    evidence.every((index) => Number.isInteger(index) && index >= 1 && index <= sentences.length),
);

console.log(`Extraction completed in ${elapsedMs} ms (${response.status}).`);
console.table(machine.states.map(({ id, isInitial, isFinal, evidence }) => ({
  state: id,
  initial: isInitial,
  final: isFinal,
  evidence: evidence.join(","),
})));
console.table(machine.transitions.map(({ from, event, to, evidence }) => ({
  from,
  event,
  to,
  evidence: evidence.join(","),
})));

if (missingStates.length > 0) {
  fail(`hand-derived states absent: ${missingStates.join(", ")}.`);
}
if (missingTransitions.length > 0) {
  fail(`hand-derived transitions absent: ${missingTransitions.join(", ")}.`);
}
if (!evidenceInRange) {
  fail(`Evidence must be non-empty and within Sentence range 1..${sentences.length}.`);
}
if (process.exitCode !== 1) {
  console.log("Smoke check passed: machine matches the hand-derived Sample 1 table and all Evidence is in range.");
}
