import type { Gaps, Machine, MissingTransition } from "./machine";

export function computeGaps(machine: Machine): Gaps {
  const handledEventsByState = new Map<string, Set<string>>();
  const successorsByState = new Map<string, string[]>();

  for (const transition of machine.transitions) {
    const handledEvents = handledEventsByState.get(transition.from) ?? new Set<string>();
    handledEvents.add(transition.event);
    handledEventsByState.set(transition.from, handledEvents);

    const successors = successorsByState.get(transition.from) ?? [];
    successors.push(transition.to);
    successorsByState.set(transition.from, successors);
  }

  const missingTransitions: MissingTransition[] = [];
  for (const state of machine.states) {
    if (state.isFinal) continue;

    const handledEvents = handledEventsByState.get(state.id);
    for (const event of machine.events) {
      if (!handledEvents?.has(event.id)) {
        missingTransitions.push({ stateId: state.id, eventId: event.id });
      }
    }
  }

  const initialState = machine.states.find((state) => state.isInitial);
  const reachableStateIds = new Set<string>();
  if (initialState) {
    const queue = [initialState.id];
    reachableStateIds.add(initialState.id);

    for (let index = 0; index < queue.length; index += 1) {
      for (const successor of successorsByState.get(queue[index]) ?? []) {
        if (!reachableStateIds.has(successor)) {
          reachableStateIds.add(successor);
          queue.push(successor);
        }
      }
    }
  }

  return {
    missingTransitions,
    unreachableStateIds: machine.states
      .filter((state) => !reachableStateIds.has(state.id))
      .map((state) => state.id),
    deadEndStateIds: machine.states
      .filter((state) => !state.isFinal && (successorsByState.get(state.id)?.length ?? 0) === 0)
      .map((state) => state.id),
  };
}
