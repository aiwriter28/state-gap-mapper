import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const configuredEndpoint = process.env.STATE_GAP_MAPPER_ENDPOINT;
const localPort = 3_000;
const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const outputDirectory = fileURLToPath(new URL("../samples/cached/", import.meta.url));
const stagingPrefix = fileURLToPath(new URL("../samples/.cache-stage-", import.meta.url));
const samples = [
  { name: "order-checkout" },
  { name: "document-approval" },
  { name: "account-signup" },
];

async function post(endpoint, body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55_000),
  });
  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`HTTP ${response.status} returned non-JSON.`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${payload?.code ?? "unknown_error"}: ${payload?.message ?? "No message."}`);
  }
  return payload;
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function waitForPort(port) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return;
    await delay(200);
  }
  throw new Error(`Timed out waiting for local Vercel on port ${port}.`);
}

async function startLocalVercel() {
  if (await isPortOpen(localPort)) {
    throw new Error(`Port ${localPort} is already in use. Stop that process or set STATE_GAP_MAPPER_ENDPOINT explicitly.`);
  }
  const child = spawn(
    "npx",
    ["vercel", "dev", "--listen", String(localPort)],
    { cwd: rootPath, env: process.env, stdio: "inherit" },
  );
  try {
    await Promise.race([
      waitForPort(localPort),
      once(child, "exit").then(([code]) => {
        throw new Error(`Local Vercel exited before becoming ready with code ${String(code)}.`);
      }),
    ]);
  } catch (error) {
    await stopChild(child);
    throw error;
  }
  return child;
}

async function stopChild(child) {
  if (child === null || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    delay(5_000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

async function runCacheOracles(stagingDirectory) {
  const child = spawn(
    "npm",
    ["test", "--", "--reporter=dot", "tests/cached-samples.test.ts"],
    {
      cwd: rootPath,
      env: { ...process.env, STATE_GAP_MAPPER_CACHE_DIR: stagingDirectory },
      stdio: "inherit",
    },
  );
  const [code] = await once(child, "exit");
  if (code !== 0) {
    throw new Error("Generated caches failed their literal oracle tests. Existing curated caches were preserved.");
  }
}

function authoritativeHoles(machine) {
  const defined = new Set(machine.transitions.map((transition) => `${transition.from}\u0000${transition.event}`));
  return machine.states.flatMap((state) => (
    state.isFinal
      ? []
      : machine.events.flatMap((event) => (
        defined.has(`${state.id}\u0000${event.id}`)
          ? []
          : [{ stateId: state.id, eventId: event.id }]
      ))
  ));
}

function orderCompleteRanks(machine, rankedHoles) {
  const ranks = new Map();
  for (const rank of rankedHoles) {
    const key = `${rank.stateId}\u0000${rank.eventId}`;
    if (!ranks.has(key)) ranks.set(key, rank);
  }
  const holes = authoritativeHoles(machine);
  const ordered = holes.map((hole) => ranks.get(`${hole.stateId}\u0000${hole.eventId}`));
  if (ordered.some((rank) => rank === undefined)) {
    throw new Error("Rank response omitted one or more authoritative Missing Transitions. Regenerate after prompt tuning; do not weaken the cache oracle.");
  }
  return ordered;
}

async function generate(endpoint) {
  const generated = [];
  for (const sample of samples) {
    const spec = await readFile(new URL(`samples/${sample.name}.txt`, root), "utf8");
    const extraction = await post(endpoint, { op: "extract", spec });
    if (extraction?.kind !== "machine") {
      throw new Error(`${sample.name}: expected machine extraction, received ${JSON.stringify(extraction?.kind)}.`);
    }
    const rank = await post(endpoint, {
      op: "rank",
      machine: extraction.machine,
      sentences: extraction.sentences,
    });
    if (rank?.kind !== "rank") {
      throw new Error(`${sample.name}: expected rank response, received ${JSON.stringify(rank?.kind)}.`);
    }
    generated.push({
      name: sample.name,
      cache: {
        version: 1,
        sentences: extraction.sentences,
        machine: extraction.machine,
        rankedHoles: orderCompleteRanks(extraction.machine, rank.rankedHoles),
        suggestedEvents: rank.suggestedEvents,
        truncated: rank.truncated,
        droppedSuggestions: rank.droppedSuggestions,
      },
    });
  }

  const stagingDirectory = await mkdtemp(stagingPrefix);
  try {
    for (const { name, cache } of generated) {
      await writeFile(join(stagingDirectory, `${name}.json`), `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    }
    await runCacheOracles(stagingDirectory);
    await mkdir(outputDirectory, { recursive: true });
    for (const { name } of generated) {
      await rename(
        join(stagingDirectory, `${name}.json`),
        join(outputDirectory, `${name}.json`),
      );
      console.log(`Wrote samples/cached/${name}.json`);
    }
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

let localServer = null;
const endpoint = configuredEndpoint ?? `http://127.0.0.1:${localPort}/api/llm`;
try {
  if (configuredEndpoint === undefined) localServer = await startLocalVercel();
  await generate(endpoint);
} finally {
  await stopChild(localServer);
}
