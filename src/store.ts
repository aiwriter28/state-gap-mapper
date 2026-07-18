import { createStore, type StoreApi } from "zustand/vanilla";

import { apiError, type ApiError } from "../lib/errors";
import { computeGaps } from "../lib/gaps";
import { mergeRanks } from "../lib/rankMerge";
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
  type RankResponse,
} from "./llmClient";

export type { ExtractionResponse, LlmClient, RankResponse } from "./llmClient";

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
  rankError: ApiError | null;
  rankPending: boolean;
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
  rank(): Promise<void>;
  applyRank(payload: RankResponse, sessionSeq: number, rankSeq: number, machineRev: number): void;
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
    rankError: null,
    rankPending: false,
    sessionSeq: 0,
    rankSeq: 0,
    machineRev: 0,
    dirty: false,
  };
}

function unrankedHoles(gaps: Gaps): DisplayHole[] {
  return gaps.missingTransitions.map((hole) => ({ ...hole, rank: null }));
}

function orderDisplayHoles(holes: DisplayHole[]): DisplayHole[] {
  return [...holes].sort((left, right) => {
    if (left.rank === null && right.rank !== null) return -1;
    if (left.rank !== null && right.rank === null) return 1;
    if (left.rank === null || right.rank === null) return 0;
    return right.rank.relevance - left.rank.relevance;
  });
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
        rankError: null,
        rankPending: false,
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
        rankError: null,
        rankPending: false,
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
      set({
        sessionSeq: seq,
        phase: "extracting",
        error: null,
        rankError: null,
        rankPending: false,
      });
      try {
        const payload = await client.extract(submittedSpec);
        if (seq !== get().sessionSeq) return;
        get().applyExtraction(payload, seq, submittedSpec);
        if (get().sessionSeq === seq && get().machine !== null) {
          void get().rank();
        }
      } catch (error) {
        if (seq !== get().sessionSeq) return;
        set({ error: normalizeClientError(error) });
      } finally {
        if (seq === get().sessionSeq) set({ phase: "idle" });
      }
    },

    rank: async () => {
      const snapshot = get();
      if (snapshot.machine === null) return;

      const sessionSeq = snapshot.sessionSeq;
      const machineRev = snapshot.machineRev;
      const rankSeq = snapshot.rankSeq + 1;
      const machine = snapshot.machine;
      const sentences = snapshot.sentences;
      set({ rankSeq, rankPending: true, rankError: null });

      try {
        const payload = await client.rank(machine, sentences);
        const current = get();
        if (
          current.sessionSeq !== sessionSeq ||
          current.rankSeq !== rankSeq ||
          current.machineRev !== machineRev
        ) {
          return;
        }
        get().applyRank(payload, sessionSeq, rankSeq, machineRev);
      } catch (error) {
        const current = get();
        if (
          current.sessionSeq !== sessionSeq ||
          current.rankSeq !== rankSeq ||
          current.machineRev !== machineRev
        ) {
          return;
        }
        set({ rankError: normalizeClientError(error) });
      } finally {
        const current = get();
        if (
          current.sessionSeq === sessionSeq &&
          current.rankSeq === rankSeq &&
          current.machineRev === machineRev
        ) {
          set({ rankPending: false });
        }
      }
    },

    applyRank: (payload, sessionSeq, rankSeq, machineRev) => {
      const current = get();
      if (
        current.machine === null ||
        current.sessionSeq !== sessionSeq ||
        current.rankSeq !== rankSeq ||
        current.machineRev !== machineRev
      ) {
        return;
      }

      const gaps = computeGaps(current.machine);
      const displayHoles = orderDisplayHoles(mergeRanks(
        gaps.missingTransitions,
        payload.rankedHoles,
        new Set(current.machine.states.map((state) => state.id)),
      ));
      set({
        gaps,
        ranks: displayHoles.flatMap((hole) => hole.rank === null ? [] : [hole.rank]),
        suggestedEvents: payload.suggestedEvents,
        displayHoles,
        rankTruncated: payload.truncated,
        rankError: null,
      });
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
