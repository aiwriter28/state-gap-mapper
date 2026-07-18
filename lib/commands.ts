import { DOMAIN_LIMITS, type Machine, type MachineEvent, type MachineState } from "./machine";
import { type VErr, validateMachineShape } from "./validate";

export type CommandResult =
  | { ok: true; machine: Machine }
  | { ok: false; error: VErr };

export interface AddStateArgs { name: string }
export interface RenameArgs { id: string; name: string }
export interface IdArgs { id: string }
export interface MergeEventsArgs { sourceId: string; targetId: string }
export interface DeleteTransitionArgs { from: string; eventId: string }
export type TransitionEvent = { kind: "existing"; id: string } | { kind: "new"; name: string };
export interface AddTransitionArgs { from: string; to: string; event: TransitionEvent }

function err(code: string, subject: string, message: string): CommandResult {
  return { ok: false, error: { code, subject, message } };
}

function unknown(subject: string): CommandResult {
  return err("unknown_id", subject, "The selected state, event, or transition no longer exists.");
}

function blank(subject: string): CommandResult {
  return err("blank_name", subject, "Names must include at least one letter or number.");
}

function cloned(machine: Machine): Machine {
  return {
    states: machine.states.map((state) => ({ ...state, evidence: [...state.evidence] })),
    events: machine.events.map((event) => ({ ...event, surfaceForms: [...event.surfaceForms], evidence: [...event.evidence] })),
    transitions: machine.transitions.map((transition) => ({ ...transition, evidence: [...transition.evidence] })),
  };
}

function success(candidate: Machine): CommandResult {
  const validation = validateMachineShape(candidate)[0];
  if (validation !== undefined) return { ok: false, error: validation };
  return { ok: true, machine: candidate };
}

function normalizedName(name: string, subject: string): string | CommandResult {
  const normalized = name.trim();
  if (normalized.length === 0) return blank(subject);
  if (normalized.length > DOMAIN_LIMITS.idOrName) {
    return err("too_large", subject, `Names must be at most ${DOMAIN_LIMITS.idOrName} characters.`);
  }
  return normalized;
}

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function uniqueSlug(name: string, existing: ReadonlySet<string>, subject: string): string | CommandResult {
  const base = slugify(name);
  if (base.length === 0) return blank(subject);
  if (base.length > DOMAIN_LIMITS.idOrName) {
    return err("too_large", subject, `Ids must be at most ${DOMAIN_LIMITS.idOrName} characters.`);
  }
  if (!existing.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (candidate.length > DOMAIN_LIMITS.idOrName) {
      return err("too_large", subject, `Ids must be at most ${DOMAIN_LIMITS.idOrName} characters including a collision suffix.`);
    }
    if (!existing.has(candidate)) return candidate;
  }
}

function addStateArgs(args: AddStateArgs | string): AddStateArgs {
  return typeof args === "string" ? { name: args } : args;
}

function renameArgs(args: RenameArgs | string, name?: string): RenameArgs {
  return typeof args === "string" ? { id: args, name: name ?? "" } : args;
}

function idArgs(args: IdArgs | string): IdArgs {
  return typeof args === "string" ? { id: args } : args;
}

function mergeArgs(args: MergeEventsArgs | string, targetId?: string): MergeEventsArgs {
  return typeof args === "string" ? { sourceId: args, targetId: targetId ?? "" } : args;
}

function deleteTransitionArgs(args: DeleteTransitionArgs | string, eventId?: string): DeleteTransitionArgs {
  return typeof args === "string" ? { from: args, eventId: eventId ?? "" } : args;
}

export function addState(machine: Machine, supplied: AddStateArgs | string): CommandResult {
  const args = addStateArgs(supplied);
  const name = normalizedName(args.name, "state.name");
  if (typeof name !== "string") return name;
  const id = uniqueSlug(name, new Set(machine.states.map((state) => state.id)), "state.id");
  if (typeof id !== "string") return id;
  const candidate = cloned(machine);
  candidate.states.push({ id, name, isInitial: false, isFinal: false, evidence: [], userAdded: true });
  return success(candidate);
}

export function renameState(machine: Machine, supplied: RenameArgs | string, directName?: string): CommandResult {
  const args = renameArgs(supplied, directName);
  const index = machine.states.findIndex((state) => state.id === args.id);
  if (index < 0) return unknown("state.id");
  const name = normalizedName(args.name, "state.name");
  if (typeof name !== "string") return name;
  const candidate = cloned(machine);
  candidate.states[index] = { ...candidate.states[index], name };
  return success(candidate);
}

export function renameEvent(machine: Machine, supplied: RenameArgs | string, directName?: string): CommandResult {
  const args = renameArgs(supplied, directName);
  const index = machine.events.findIndex((event) => event.id === args.id);
  if (index < 0) return unknown("event.id");
  const name = normalizedName(args.name, "event.name");
  if (typeof name !== "string") return name;
  const candidate = cloned(machine);
  candidate.events[index] = { ...candidate.events[index], name };
  return success(candidate);
}

function stringUnion(left: string[], right: string[]): string[] {
  return [...new Set([...left, ...right])].sort((a, b) => a.localeCompare(b));
}

function numberUnion(left: number[], right: number[]): number[] {
  return [...new Set([...left, ...right])].sort((a, b) => a - b);
}

export function mergeEvents(machine: Machine, supplied: MergeEventsArgs | string, directTarget?: string): CommandResult {
  const args = mergeArgs(supplied, directTarget);
  const source = machine.events.find((event) => event.id === args.sourceId);
  const target = machine.events.find((event) => event.id === args.targetId);
  if (source === undefined) return unknown("sourceId");
  if (target === undefined) return unknown("targetId");
  if (source.id === target.id) return err("same_id", "sourceId", "Choose two different events to merge.");

  const candidate = cloned(machine);
  candidate.events = candidate.events
    .filter((event) => event.id !== source.id)
    .map((event) => event.id !== target.id ? event : {
      ...event,
      surfaceForms: stringUnion(target.surfaceForms, source.surfaceForms),
      evidence: numberUnion(target.evidence, source.evidence),
      userAdded: target.userAdded && source.userAdded ? true : undefined,
    });
  candidate.transitions = candidate.transitions.map((transition) => (
    transition.event === source.id ? { ...transition, event: target.id } : transition
  ));
  return success(candidate);
}

export function deleteState(machine: Machine, supplied: IdArgs | string): CommandResult {
  const args = idArgs(supplied);
  const state = machine.states.find((candidate) => candidate.id === args.id);
  if (state === undefined) return unknown("state.id");
  if (state.isInitial) return err("initial_required", "state.id", "The initial state cannot be deleted. Choose another initial state first.");
  const candidate = cloned(machine);
  candidate.states = candidate.states.filter((current) => current.id !== args.id);
  candidate.transitions = candidate.transitions.filter((transition) => transition.from !== args.id && transition.to !== args.id);
  return success(candidate);
}

export function setInitial(machine: Machine, supplied: IdArgs | string): CommandResult {
  const args = idArgs(supplied);
  if (!machine.states.some((state) => state.id === args.id)) return unknown("state.id");
  const candidate = cloned(machine);
  candidate.states = candidate.states.map((state) => ({ ...state, isInitial: state.id === args.id }));
  return success(candidate);
}

export function toggleFinal(machine: Machine, supplied: IdArgs | string): CommandResult {
  const args = idArgs(supplied);
  const state = machine.states.find((candidate) => candidate.id === args.id);
  if (state === undefined) return unknown("state.id");
  if (!state.isFinal && machine.transitions.some((transition) => transition.from === args.id)) {
    return err("final_outgoing", "state.id", "Remove outgoing transitions before making this state final.");
  }
  const candidate = cloned(machine);
  candidate.states = candidate.states.map((current) => current.id === args.id
    ? { ...current, isFinal: !current.isFinal }
    : current);
  return success(candidate);
}

export function addTransition(machine: Machine, args: AddTransitionArgs): CommandResult {
  const from = machine.states.find((state) => state.id === args.from);
  if (from === undefined) return unknown("from");
  if (!machine.states.some((state) => state.id === args.to)) return unknown("to");
  if (from.isFinal) return err("final_outgoing", "from", `Final state ${from.id} cannot have outgoing transitions.`);

  let eventId: string;
  let newEvent: MachineEvent | undefined;
  if (args.event.kind === "existing") {
    const existingId = args.event.id;
    if (!machine.events.some((event) => event.id === existingId)) return unknown("event.id");
    eventId = existingId;
  } else {
    const name = normalizedName(args.event.name, "event.name");
    if (typeof name !== "string") return name;
    const id = uniqueSlug(name, new Set(machine.events.map((event) => event.id)), "event.id");
    if (typeof id !== "string") return id;
    eventId = id;
    newEvent = { id, name, surfaceForms: [name], evidence: [], userAdded: true };
  }
  if (machine.transitions.some((transition) => transition.from === args.from && transition.event === eventId)) {
    return err("nondeterministic", "transition", `State ${args.from} already has a transition for ${eventId}.`);
  }
  const candidate = cloned(machine);
  if (newEvent !== undefined) candidate.events.push(newEvent);
  candidate.transitions.push({ from: args.from, to: args.to, event: eventId, evidence: [], userAdded: true });
  return success(candidate);
}

export function deleteTransition(machine: Machine, supplied: DeleteTransitionArgs | string, directEvent?: string): CommandResult {
  const args = deleteTransitionArgs(supplied, directEvent);
  if (!machine.states.some((state) => state.id === args.from)) return unknown("from");
  if (!machine.events.some((event) => event.id === args.eventId)) return unknown("eventId");
  if (!machine.transitions.some((transition) => transition.from === args.from && transition.event === args.eventId)) {
    return unknown("transition");
  }
  const candidate = cloned(machine);
  candidate.transitions = candidate.transitions.filter((transition) => transition.from !== args.from || transition.event !== args.eventId);
  return success(candidate);
}

export type MachineCommand =
  | typeof addState
  | typeof renameState
  | typeof renameEvent
  | typeof mergeEvents
  | typeof deleteState
  | typeof setInitial
  | typeof toggleFinal
  | typeof addTransition
  | typeof deleteTransition;

export type { MachineState };
