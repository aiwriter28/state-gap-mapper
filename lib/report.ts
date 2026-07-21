import { computeGaps } from "./gaps.js";
import { holeEvidence, type DisplayHole, type Gaps, type Machine } from "./machine.js";
import type { StateGapMapperProjectV1 } from "./projectFile.js";
import { mergeRanks, orderDisplayHoles } from "./rankMerge.js";
import { uncoveredSentences } from "./selectors.js";

const BIDI_CONTROLS = new Set([
  0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2066, 0x2067, 0x2068, 0x2069,
]);

function clean(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || code === 0x0d) return character;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return "";
    return BIDI_CONTROLS.has(code) ? "" : character;
  }).join("");
}

function longestRun(value: string, character: "`" | "~"): number {
  const matches = clean(value).match(character === "`" ? /`+/g : /~+/g);
  return Math.max(0, ...(matches ?? []).map((match) => match.length));
}

export function fenced(value: string): string {
  const cleaned = clean(value);
  const length = Math.max(3, longestRun(cleaned, "`") + 1, longestRun(cleaned, "~") + 1);
  const delimiter = "`".repeat(length);
  return `${delimiter}\n${cleaned}\n${delimiter}`;
}

export function inlineCode(value: string): string {
  const cleaned = clean(value).replace(/\r\n|\r|\n/g, " ⏎ ");
  const delimiter = "`".repeat(Math.max(1, longestRun(cleaned, "`") + 1));
  return `${delimiter}${cleaned}${delimiter}`;
}

export function tableCell(value: string): string {
  const encoded = clean(value)
    .replace(/&/g, "&amp;")
    .replace(/\\/g, "&#92;")
    .replace(/\|/g, "&#124;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return inlineCode(encoded);
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function evidenceText(evidence: readonly number[]): string {
  return evidence.length === 0 ? "No Evidence" : evidence.map((index) => `S${index}`).join(", ");
}

function definedPair(machine: Machine, stateId: string, eventId: string): boolean {
  return machine.transitions.some((transition) => transition.from === stateId && transition.event === eventId);
}

function stateName(machine: Machine, id: string): string {
  return machine.states.find((state) => state.id === id)?.name ?? id;
}

function eventName(machine: Machine, id: string): string {
  return machine.events.find((event) => event.id === id)?.name ?? id;
}

function addTable(lines: string[], headers: string[], rows: string[][], empty: string): void {
  if (rows.length === 0) {
    lines.push(empty, "");
    return;
  }
  lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) lines.push(`| ${row.join(" | ")} |`);
  lines.push("");
}

interface ReportContext {
  project: StateGapMapperProjectV1;
  machine: Machine;
  gaps: Gaps;
  openHoles: DisplayHole[];
  dismissedUndefined: DisplayHole[];
}

function reportContext(project: StateGapMapperProjectV1): ReportContext {
  const machine = project.machine;
  const gaps = computeGaps(machine);
  const dismissed = new Set(project.decisions.dismissedPairs.map((pair) => `${pair.stateId}\u0000${pair.eventId}`));
  const merged = orderDisplayHoles(mergeRanks(
    gaps.missingTransitions,
    project.analysis.ranks,
    new Set(machine.states.map((state) => state.id)),
  ));
  return {
    project,
    machine,
    gaps,
    openHoles: merged.filter((hole) => !dismissed.has(`${hole.stateId}\u0000${hole.eventId}`)),
    dismissedUndefined: merged.filter((hole) => dismissed.has(`${hole.stateId}\u0000${hole.eventId}`)),
  };
}

function summaryLines(context: ReportContext): string[] {
  const { project, machine, gaps, openHoles, dismissedUndefined } = context;
  const sentences = project.sentences;
  const affectedStates = new Set([...gaps.unreachableStateIds, ...gaps.deadEndStateIds]);
  const covered = sentences.length - uncoveredSentences(machine, sentences.length).length;
  return [
    "## Summary",
    "",
    `- Sentence coverage: ${covered} of ${sentences.length}`,
    `- States: ${machine.states.length}`,
    `- Events: ${machine.events.length}`,
    `- Transitions: ${machine.transitions.length}`,
    `- Open Structural Gaps: ${openHoles.length + affectedStates.size}`,
    `- Open Missing Transitions: ${openHoles.length}`,
    `- Total Missing Transitions: ${gaps.missingTransitions.length}`,
    `- Currently dismissed Missing Transitions: ${dismissedUndefined.length}`,
    "",
  ];
}

function stateMachineLines(machine: Machine): string[] {
  const lines = [
    "## State Machine",
    "",
    "### States",
    "",
  ];

  addTable(lines, ["Id", "Name", "Initial", "Final", "Evidence", "Added by you"], machine.states.map((state) => [
    tableCell(state.id),
    tableCell(state.name),
    yesNo(state.isInitial),
    yesNo(state.isFinal),
    evidenceText(state.evidence),
    yesNo(state.userAdded === true),
  ]), "No States.");

  lines.push("### Events", "");
  addTable(lines, ["Id", "Name", "Surface forms", "Evidence", "Added by you"], machine.events.map((event) => [
    tableCell(event.id),
    tableCell(event.name),
    tableCell(event.surfaceForms.join(", ")),
    evidenceText(event.evidence),
    yesNo(event.userAdded === true),
  ]), "No Events.");

  lines.push("### Transitions", "");
  addTable(lines, ["From", "Event", "To", "Evidence", "Added by you"], machine.transitions.map((transition) => [
    tableCell(transition.from),
    tableCell(transition.event),
    tableCell(transition.to),
    evidenceText(transition.evidence),
    yesNo(transition.userAdded === true),
  ]), "No Transitions.");
  return lines;
}

function openMissingTransitionLines(project: StateGapMapperProjectV1, machine: Machine, openHoles: DisplayHole[]): string[] {
  const lines = ["### Open Missing Transitions", ""];
  if (openHoles.length === 0) lines.push("No open Missing Transitions.", "");
  for (const hole of openHoles) {
    lines.push(`- ${inlineCode(hole.stateId)} × ${inlineCode(hole.eventId)}`);
    if (hole.rank === null) {
      lines.push("  - Relevance: Unranked", `  - Evidence: ${evidenceText(holeEvidence(machine, hole))}`);
    } else {
      lines.push(
        `  - Relevance: ${hole.rank.relevance.toFixed(2)}`,
        `  - Suggested target: ${hole.rank.suggestedTargetStateId === null ? "None" : inlineCode(hole.rank.suggestedTargetStateId)}`,
        `  - Evidence: ${evidenceText(holeEvidence(machine, hole))}`,
        "  - Rationale:",
        fenced(hole.rank.rationale),
      );
    }
  }
  if (openHoles.length > 0) lines.push("");
  if (project.analysis.rankTruncated) {
    lines.push("Only the first 100 Missing Transitions received ranking metadata; the rest remain Unranked.", "");
  }
  return lines;
}

function dismissedTransitionLines(dismissedUndefined: DisplayHole[]): string[] {
  const lines = ["### Dismissed Missing Transitions That Are Currently Undefined", ""];
  if (dismissedUndefined.length === 0) lines.push("No dismissed Missing Transitions are currently undefined.", "");
  else {
    for (const hole of dismissedUndefined) lines.push(`- ${inlineCode(hole.stateId)} × ${inlineCode(hole.eventId)}`);
    lines.push("");
  }
  return lines;
}

function stateGapLines(title: "Unreachable States" | "Dead-End States", ids: string[], machine: Machine): string[] {
  const lines = [`### ${title}`, ""];
  if (ids.length === 0) lines.push(`No ${title}.`, "");
  else {
    for (const id of ids) lines.push(`- ${inlineCode(id)} (${inlineCode(stateName(machine, id))})`);
    lines.push("");
  }
  return lines;
}

function structuralGapLines(context: ReportContext): string[] {
  return [
    "## Structural Gaps",
    "",
    ...openMissingTransitionLines(context.project, context.machine, context.openHoles),
    ...dismissedTransitionLines(context.dismissedUndefined),
    ...stateGapLines("Unreachable States", context.gaps.unreachableStateIds, context.machine),
    ...stateGapLines("Dead-End States", context.gaps.deadEndStateIds, context.machine),
  ];
}

function suggestedEventLines(project: StateGapMapperProjectV1): string[] {
  const lines = ["## Suggested Events", ""];
  if (project.analysis.suggestedEvents.length === 0) lines.push("No Suggested Events.", "");
  for (const suggestion of project.analysis.suggestedEvents) {
    lines.push(
      `### ${inlineCode(suggestion.name)}`,
      "",
      `- Id: ${inlineCode(suggestion.id)}`,
      `- Confidence: ${suggestion.confidence.toFixed(2)}`,
      "- Evidence: No Evidence",
      "- Rationale:",
      fenced(suggestion.rationale),
      "",
    );
  }
  return lines;
}

function decisionLines(project: StateGapMapperProjectV1): string[] {
  const machine = project.machine;
  const lines = ["## User Decisions", "", "### Remembered Dismissals", ""];
  if (project.decisions.dismissedPairs.length === 0) lines.push("No remembered dismissals.", "");
  else {
    for (const pair of project.decisions.dismissedPairs) {
      lines.push(`- ${inlineCode(pair.stateId)} × ${inlineCode(pair.eventId)}: ${definedPair(machine, pair.stateId, pair.eventId) ? "Defined" : "Undefined"}`);
    }
    lines.push("");
  }
  lines.push("### Accepted Suggested Events", "");
  if (project.decisions.acceptedSuggestedEvents.length === 0) lines.push("No accepted Suggested Events.", "");
  else {
    const machineEvents = new Set(machine.events.map((event) => event.id));
    for (const mapping of project.decisions.acceptedSuggestedEvents) {
      lines.push(`- ${inlineCode(mapping.suggestionId)} → ${inlineCode(mapping.acceptedEventId)}: ${machineEvents.has(mapping.acceptedEventId) ? "Exists" : "Deleted from current machine"}`);
    }
    lines.push("");
  }
  return lines;
}

function testStubLines(project: StateGapMapperProjectV1): string[] {
  const machine = project.machine;
  const lines = ["## Test Stubs", ""];
  if (project.decisions.testStubs.length === 0) lines.push("No Test Stubs.", "");
  for (const [index, stub] of project.decisions.testStubs.entries()) {
    const stateExists = machine.states.some((state) => state.id === stub.stateId);
    const eventExists = machine.events.some((event) => event.id === stub.eventId);
    const targetExists = stub.targetStateId === null || machine.states.some((state) => state.id === stub.targetStateId);
    lines.push(
      `### Test Stub ${index + 1}`,
      "",
      `- State: ${inlineCode(stub.stateId)}${stateExists ? ` (${inlineCode(stateName(machine, stub.stateId))})` : " — Deleted from current machine"}`,
      `- Event: ${inlineCode(stub.eventId)}${eventExists ? ` (${inlineCode(eventName(machine, stub.eventId))})` : " — Deleted from current machine"}`,
      `- Target: ${stub.targetStateId === null ? "Not selected" : `${inlineCode(stub.targetStateId)}${targetExists ? "" : " — Deleted from current machine"}`}`,
      `- Evidence: ${evidenceText(stub.evidence)}`,
      "",
      fenced(stub.text),
      "",
    );
  }
  return lines;
}

export function renderReport(project: StateGapMapperProjectV1): string {
  const context = reportContext(project);
  const lines = [
    "# State Gap Mapper Report",
    "",
    `Generated: ${project.exportedAt}`,
    "",
    "Structural Gaps are computed deterministically; Relevance, Suggested Events, and Confidence are LLM metadata; decisions are user-authored.",
    "",
    ...summaryLines(context),
    "## Spec",
    "",
    fenced(project.spec.active),
    "",
    ...stateMachineLines(project.machine),
    ...structuralGapLines(context),
    ...suggestedEventLines(project),
    ...decisionLines(project),
    ...testStubLines(project),
    "## Method",
    "",
    "State Gap Mapper deterministically recomputes Missing Transitions, Unreachable States, Dead-End States, and Sentence coverage from the validated machine. The LLM supplies Relevance ordering and Suggested Events with Confidence, but cannot add or hide a Structural Gap. Accept, Dismiss, canvas edits, and Test Stubs are user decisions or deterministic consequences of them.",
    "",
  ];
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}
