export interface Sentence {
  index: number;
  text: string;
}

export const DOMAIN_LIMITS = {
  idOrName: 64,
  rationale: 300,
  surfaceForms: 10,
  evidence: 20,
  states: 30,
  events: 30,
  transitions: 200,
  suggestions: 10,
  rankedHoles: 100,
  sentences: 4_000,
  sentenceText: 4_000,
  opSpecCharacters: 65_536,
} as const;

export interface MachineState {
  id: string;
  name: string;
  isInitial: boolean;
  isFinal: boolean;
  evidence: number[];
  userAdded?: boolean;
}

export interface MachineEvent {
  id: string;
  name: string;
  surfaceForms: string[];
  evidence: number[];
  userAdded?: boolean;
}

export interface Transition {
  from: string;
  event: string;
  to: string;
  evidence: number[];
  userAdded?: boolean;
}

export interface Machine {
  states: MachineState[];
  events: MachineEvent[];
  transitions: Transition[];
}

export interface MissingTransition {
  stateId: string;
  eventId: string;
}

export interface Gaps {
  missingTransitions: MissingTransition[];
  unreachableStateIds: string[];
  deadEndStateIds: string[];
}

export interface SuggestedEvent {
  id: string;
  name: string;
  surfaceForms: string[];
  rationale: string;
  confidence: number;
}

export interface RankedHole {
  stateId: string;
  eventId: string;
  relevance: number;
  rationale: string;
  suggestedTargetStateId: string | null;
}

export interface DisplayHole extends MissingTransition {
  rank: RankedHole | null;
}

export interface Viability {
  isSpec: boolean;
  reason: string;
}

export interface ExtractionOutput {
  viability: Viability;
  machine: Machine | null;
}

export interface RankOutput {
  rankedHoles: RankedHole[];
  suggestedEvents: SuggestedEvent[];
}

export interface ExtractRequest {
  op: "extract";
  spec: string;
}

export interface RankRequest {
  op: "rank";
  machine: Machine;
  sentences: Sentence[];
}

export type OpEnvelope = ExtractRequest | RankRequest;

export interface CachedSample {
  version: 1;
  sentences: Sentence[];
  machine: Machine;
  rankedHoles: RankedHole[];
  suggestedEvents: SuggestedEvent[];
  truncated: boolean;
  droppedSuggestions: number;
}
