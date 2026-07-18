import { createStore, type StoreApi } from "zustand/vanilla";

import { apiError, type ApiError } from "../lib/errors";
import { computeGaps } from "../lib/gaps";
import {
  holeEvidence,
  type DisplayHole,
  type Gaps,
  type Machine,
  type MissingTransition,
  type RankedHole,
  type Sentence,
  type SuggestedEvent,
} from "../lib/machine";
import {
  llmClient,
  normalizeClientError,
  type ExtractionResponse,
  type LlmClient,
} from "./llmClient";

export type { ExtractionResponse, LlmClient } from "./llmClient";

export type ExtractionPhase = "idle" | "extracting";

export interface TestStub {
  stateId: string;
  eventId: string;
  targetStateId: string | null;
  evidence: number[];
}

export interface AppState {
  draftSpec: string;
  activeSpec: string;
  sentences: Sentence[];
  machine: Machine | null;
  gaps: Gaps;
  ranks: RankedHole[];
  suggestedEvents: SuggestedEvent[];
  displayHoles: DisplayHole[];
  rankTruncated: boolean;
  stubs: TestStub[];
  dismissedPairKeys: Set<string>;
  selectedHoleKey: string | null;
  highlightedEvidence: number[];
  viabilityRefusal: string | null;
  phase: ExtractionPhase;
  error: ApiError | null;
  sessionSeq: number;
  rankSeq: number;
  machineRev: number;
  dirty: boolean;
}

export interface AppActions {
  setDraftSpec(spec: string): void;
  selectSample(spec: string): void;
  extract(): Promise<void>;
  applyExtraction(payload: ExtractionResponse, seq: number, submittedSpec?: string): void;
  selectHole(hole: MissingTransition | null): void;
}

export type AppStore = AppState & AppActions;

const EMPTY_GAPS: Gaps = {
  missingTransitions: [],
  unreachableStateIds: [],
  deadEndStateIds: [],
};

function initialState(): AppState {
  return {
    draftSpec: "",
    activeSpec: "",
    sentences: [],
    machine: null,
    gaps: EMPTY_GAPS,
    ranks: [],
    suggestedEvents: [],
    displayHoles: [],
    rankTruncated: false,
    stubs: [],
    dismissedPairKeys: new Set(),
    selectedHoleKey: null,
    highlightedEvidence: [],
    viabilityRefusal: null,
    phase: "idle",
    error: null,
    sessionSeq: 0,
    rankSeq: 0,
    machineRev: 0,
    dirty: false,
  };
}

function unrankedHoles(gaps: Gaps): DisplayHole[] {
  return gaps.missingTransitions.map((hole) => ({ ...hole, rank: null }));
}

function stateCreator(client: LlmClient) {
  return (
    set: StoreApi<AppStore>["setState"],
    get: StoreApi<AppStore>["getState"],
  ): AppStore => ({
    ...initialState(),

    setDraftSpec: (draftSpec) => set({ draftSpec }),

    selectSample: (draftSpec) => {
      set((state) => ({
        draftSpec,
        sessionSeq: state.sessionSeq + 1,
        phase: "idle",
        error: null,
      }));
    },

    applyExtraction: (payload, seq, submittedSpec = get().draftSpec) => {
      if (seq !== get().sessionSeq) return;

      if (payload.kind === "not_spec") {
        set({ viabilityRefusal: payload.reason, error: null });
        return;
      }

      const gaps = computeGaps(payload.machine);
      set((state) => ({
        activeSpec: submittedSpec,
        sentences: payload.sentences,
        machine: payload.machine,
        gaps,
        ranks: [],
        suggestedEvents: [],
        displayHoles: unrankedHoles(gaps),
        rankTruncated: false,
        stubs: [],
        dismissedPairKeys: new Set(),
        selectedHoleKey: null,
        highlightedEvidence: [],
        viabilityRefusal: null,
        error: null,
        machineRev: state.machineRev + 1,
        dirty: false,
      }));
    },

    extract: async () => {
      const submittedSpec = get().draftSpec;
      if (submittedSpec.trim().length === 0) {
        set({
          phase: "idle",
          error: apiError("bad_request", "Spec must contain non-whitespace text."),
        });
        return;
      }
      if (submittedSpec.length > 4_000) {
        set({
          phase: "idle",
          error: apiError("too_long", "Spec must be at most 4,000 characters."),
        });
        return;
      }

      const seq = get().sessionSeq + 1;
      set({ sessionSeq: seq, phase: "extracting", error: null });
      try {
        const payload = await client.extract(submittedSpec);
        if (seq !== get().sessionSeq) return;
        get().applyExtraction(payload, seq, submittedSpec);
      } catch (error) {
        if (seq !== get().sessionSeq) return;
        set({ error: normalizeClientError(error) });
      } finally {
        if (seq === get().sessionSeq) set({ phase: "idle" });
      }
    },

    selectHole: (hole) => {
      const machine = get().machine;
      set({
        selectedHoleKey: hole === null ? null : `${hole.stateId}\u0000${hole.eventId}`,
        highlightedEvidence:
          hole === null || machine === null ? [] : holeEvidence(machine, hole),
      });
    },
  });
}

export function createAppStore(client: LlmClient = llmClient): StoreApi<AppStore> {
  return createStore<AppStore>()(stateCreator(client));
}

export const appStore = createAppStore();
