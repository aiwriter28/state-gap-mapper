import { createStore, type StoreApi } from "zustand/vanilla";

import { apiError, type ApiError } from "../lib/errors";
import {
  acceptHole as acceptHoleCommand,
  acceptSuggestedEvent as acceptSuggestedEventCommand,
  type AcceptHoleResult,
  type AcceptSuggestedEventResult,
  type CommandResult,
  type HoleTarget,
} from "../lib/commands";
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
import type { VErr } from "../lib/validate";
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
  text: string;
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
  acceptedSuggestedEventIds: Map<string, string>;
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
  commandError: VErr | null;
  replacementConfirmation: string | null;
  replacementIntent: ReplacementIntent | null;
}

type ReplacementIntent =
  | { kind: "extract"; spec: string }
  | { kind: "sample"; spec: string };

export const DIRTY_REPLACEMENT_COPY = "Extracting again will replace your edits. Continue?";

export interface AppActions {
  setDraftSpec(spec: string): void;
  selectSample(spec: string): void;
  extract(): Promise<void>;
  applyExtraction(payload: ExtractionResponse, seq: number, submittedSpec?: string): void;
  rank(): Promise<void>;
  applyRank(payload: RankResponse, sessionSeq: number, rankSeq: number, machineRev: number): void;
  selectHole(hole: MissingTransition | null): void;
  acceptHole(hole: MissingTransition, target: HoleTarget): AcceptHoleResult;
  acceptSuggestedEvent(suggestion: SuggestedEvent): AcceptSuggestedEventResult;
  dismissHole(hole: MissingTransition): void;
  undoDismiss(hole: MissingTransition): void;
  clearCommandError(): void;
  applyCommand<TArgs>(
    command: (machine: Machine, args: TArgs) => CommandResult,
    args: TArgs,
  ): CommandResult;
  confirmReplacement(): Promise<void>;
  cancelReplacement(): void;
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
    acceptedSuggestedEventIds: new Map(),
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
    commandError: null,
    replacementConfirmation: null,
    replacementIntent: null,
  };
}

function unrankedHoles(gaps: Gaps): DisplayHole[] {
  return gaps.missingTransitions.map((hole) => ({ ...hole, rank: null }));
}

function pairKey(hole: MissingTransition): string {
  return `${hole.stateId}\u0000${hole.eventId}`;
}

function pruneDismissedPairKeys(machine: Machine, dismissedPairKeys: ReadonlySet<string>): Set<string> {
  const stateIds = new Set(machine.states.map((state) => state.id));
  const eventIds = new Set(machine.events.map((event) => event.id));
  return new Set([...dismissedPairKeys].filter((key) => {
    const [stateId, eventId] = key.split("\u0000");
    return stateIds.has(stateId) && eventIds.has(eventId);
  }));
}

function visibleDisplayHoles(
  machine: Machine,
  gaps: Gaps,
  ranks: RankedHole[],
  dismissedPairKeys: ReadonlySet<string>,
): DisplayHole[] {
  return orderDisplayHoles(mergeRanks(
    gaps.missingTransitions,
    ranks,
    new Set(machine.states.map((state) => state.id)),
  )).filter((hole) => !dismissedPairKeys.has(pairKey(hole)));
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
  ): AppStore => {
    const selectSampleNow = (draftSpec: string) => {
      set((state) => ({
        draftSpec,
        sessionSeq: state.sessionSeq + 1,
        phase: "idle",
        error: null,
        rankError: null,
        rankPending: false,
        dirty: false,
        replacementConfirmation: null,
        replacementIntent: null,
      }));
    };

    const runExtraction = async (submittedSpec: string) => {
      const seq = get().sessionSeq + 1;
      set({
        sessionSeq: seq,
        phase: "extracting",
        error: null,
        rankError: null,
        rankPending: false,
        replacementConfirmation: null,
        replacementIntent: null,
      });
      try {
        const payload = await client.extract(submittedSpec);
        if (seq !== get().sessionSeq) return;
        get().applyExtraction(payload, seq, submittedSpec);
        if (payload.kind === "machine" && get().sessionSeq === seq && get().machine !== null) {
          void get().rank();
        }
      } catch (error) {
        if (seq !== get().sessionSeq) return;
        set({ error: normalizeClientError(error) });
      } finally {
        if (seq === get().sessionSeq) set({ phase: "idle" });
      }
    };

    return {
    ...initialState(),

    setDraftSpec: (draftSpec) => set({ draftSpec }),

    selectSample: (draftSpec) => {
      if (get().dirty) {
        set({
          replacementConfirmation: DIRTY_REPLACEMENT_COPY,
          replacementIntent: { kind: "sample", spec: draftSpec },
        });
        return;
      }
      selectSampleNow(draftSpec);
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
        acceptedSuggestedEventIds: new Map(),
        selectedHoleKey: null,
        highlightedEvidence: [],
        viabilityRefusal: null,
        error: null,
        rankError: null,
        rankPending: false,
        machineRev: state.machineRev + 1,
        dirty: false,
        commandError: null,
        replacementConfirmation: null,
        replacementIntent: null,
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
      if (get().dirty) {
        set({
          replacementConfirmation: DIRTY_REPLACEMENT_COPY,
          replacementIntent: { kind: "extract", spec: submittedSpec },
        });
        return;
      }
      await runExtraction(submittedSpec);
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
          current.rankSeq !== rankSeq
        ) {
          return;
        }
        get().applyRank(payload, sessionSeq, rankSeq, machineRev);
      } catch (error) {
        const current = get();
        if (
          current.sessionSeq !== sessionSeq ||
          current.rankSeq !== rankSeq
        ) {
          return;
        }
        if (current.machineRev === machineRev) {
          set({ rankError: normalizeClientError(error) });
        }
      } finally {
        const current = get();
        if (
          current.sessionSeq === sessionSeq &&
          current.rankSeq === rankSeq
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
        current.rankSeq !== rankSeq
      ) {
        return;
      }

      const revisionChanged = current.machineRev !== machineRev;
      const gaps = computeGaps(current.machine);
      const dismissedPairKeys = pruneDismissedPairKeys(current.machine, current.dismissedPairKeys);
      const displayHoles = visibleDisplayHoles(
        current.machine,
        gaps,
        payload.rankedHoles,
        dismissedPairKeys,
      );
      set({
        gaps,
        ranks: displayHoles.flatMap((hole) => hole.rank === null ? [] : [hole.rank]),
        suggestedEvents: revisionChanged ? [] : payload.suggestedEvents,
        displayHoles,
        dismissedPairKeys,
        rankTruncated: revisionChanged ? false : payload.truncated,
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
    acceptHole: (hole, target) => {
      set({ commandError: null });
      const current = get().machine;
      if (current === null) {
        const result: AcceptHoleResult = {
          ok: false,
          error: { code: "unknown_id", subject: "machine", message: "There is no machine to edit." },
        };
        set({ commandError: result.error });
        return result;
      }
      const result = acceptHoleCommand(current, hole, target);
      if (!result.ok) {
        set({ commandError: result.error });
        return result;
      }
      const targetStateId = result.machine.transitions.find((transition) => (
        transition.from === hole.stateId && transition.event === hole.eventId
      ))?.to ?? null;
      const gaps = computeGaps(result.machine);
      set((state) => {
        const dismissedPairKeys = pruneDismissedPairKeys(result.machine, state.dismissedPairKeys);
        const displayHoles = visibleDisplayHoles(result.machine, gaps, state.ranks, dismissedPairKeys);
        const acceptedKey = pairKey(hole);
        return {
          machine: result.machine,
          gaps,
          ranks: displayHoles.flatMap((displayHole) => displayHole.rank === null ? [] : [displayHole.rank]),
          displayHoles,
          dismissedPairKeys,
          stubs: [...state.stubs, {
            stateId: hole.stateId,
            eventId: hole.eventId,
            targetStateId,
            evidence: holeEvidence(current, hole),
            text: result.stub,
          }],
          selectedHoleKey: state.selectedHoleKey === acceptedKey ? null : state.selectedHoleKey,
          highlightedEvidence: state.selectedHoleKey === acceptedKey ? [] : state.highlightedEvidence,
          machineRev: state.machineRev + 1,
          dirty: true,
          commandError: null,
        };
      });
      return result;
    },
    acceptSuggestedEvent: (suggestion) => {
      set({ commandError: null });
      const current = get().machine;
      if (current === null) {
        const result: AcceptSuggestedEventResult = {
          ok: false,
          error: { code: "unknown_id", subject: "machine", message: "There is no machine to edit." },
        };
        set({ commandError: result.error });
        return result;
      }
      const result = acceptSuggestedEventCommand(current, suggestion, get().acceptedSuggestedEventIds);
      if (!result.ok) {
        set({ commandError: result.error });
        return result;
      }
      const changed = result.machine !== current;
      const gaps = computeGaps(result.machine);
      set((state) => {
        const dismissedPairKeys = pruneDismissedPairKeys(result.machine, state.dismissedPairKeys);
        const displayHoles = visibleDisplayHoles(result.machine, gaps, state.ranks, dismissedPairKeys);
        const acceptedSuggestedEventIds = new Map(state.acceptedSuggestedEventIds);
        acceptedSuggestedEventIds.set(suggestion.id, result.acceptedEventId);
        return {
          machine: result.machine,
          gaps,
          ranks: displayHoles.flatMap((displayHole) => displayHole.rank === null ? [] : [displayHole.rank]),
          displayHoles,
          dismissedPairKeys,
          acceptedSuggestedEventIds,
          suggestedEvents: state.suggestedEvents.filter((event) => event.id !== suggestion.id),
          machineRev: state.machineRev + (changed ? 1 : 0),
          dirty: state.dirty || changed,
          commandError: null,
        };
      });
      return result;
    },
    dismissHole: (hole) => {
      const machine = get().machine;
      if (machine === null) return;
      set((state) => {
        const dismissedPairKeys = pruneDismissedPairKeys(machine, state.dismissedPairKeys);
        dismissedPairKeys.add(pairKey(hole));
        return {
          dismissedPairKeys,
          displayHoles: visibleDisplayHoles(machine, state.gaps, state.ranks, dismissedPairKeys),
          selectedHoleKey: state.selectedHoleKey === pairKey(hole) ? null : state.selectedHoleKey,
          highlightedEvidence: state.selectedHoleKey === pairKey(hole) ? [] : state.highlightedEvidence,
        };
      });
    },
    undoDismiss: (hole) => {
      const machine = get().machine;
      if (machine === null) return;
      set((state) => {
        const dismissedPairKeys = pruneDismissedPairKeys(machine, state.dismissedPairKeys);
        dismissedPairKeys.delete(pairKey(hole));
        return {
          dismissedPairKeys,
          displayHoles: visibleDisplayHoles(machine, state.gaps, state.ranks, dismissedPairKeys),
        };
      });
    },
    clearCommandError: () => set({ commandError: null }),
    applyCommand: (command, args) => {
      const current = get().machine;
      if (current === null) {
        const result: CommandResult = {
          ok: false,
          error: { code: "unknown_id", subject: "machine", message: "There is no machine to edit." },
        };
        set({ commandError: result.error });
        return result;
      }
      const result = command(current, args);
      if (!result.ok) {
        set({ commandError: result.error });
        return result;
      }
      const gaps = computeGaps(result.machine);
      const dismissedPairKeys = pruneDismissedPairKeys(result.machine, get().dismissedPairKeys);
      const displayHoles = visibleDisplayHoles(result.machine, gaps, get().ranks, dismissedPairKeys);
      set((state) => ({
        machine: result.machine,
        gaps,
        ranks: displayHoles.flatMap((hole) => hole.rank === null ? [] : [hole.rank]),
        displayHoles,
        dismissedPairKeys,
        machineRev: state.machineRev + 1,
        dirty: true,
        commandError: null,
      }));
      return result;
    },
    confirmReplacement: async () => {
      const intent = get().replacementIntent;
      if (intent === null) return;
      if (intent.kind === "sample") {
        set({
          draftSpec: intent.spec,
          replacementConfirmation: null,
          replacementIntent: null,
        });
        await runExtraction(intent.spec);
        return;
      }
      set({ replacementConfirmation: null, replacementIntent: null });
      await runExtraction(intent.spec);
    },
    cancelReplacement: () => set({ replacementConfirmation: null, replacementIntent: null }),
  };
  };
}

export function createAppStore(client: LlmClient = llmClient): StoreApi<AppStore> {
  return createStore<AppStore>()(stateCreator(client));
}

export const appStore = createAppStore();
