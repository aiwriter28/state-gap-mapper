import {
  DOMAIN_LIMITS,
  type ExtractionOutput,
  type Machine,
  type RankOutput,
} from "./machine";

const ID_PATTERN = /^[a-z0-9_]+$/;

export interface VErr {
  code: string;
  subject: string;
  message: string;
}

function validationError(
  code: string,
  subject: string,
  message: string,
): VErr {
  return { code, subject, message };
}

export function validateMachineShape(machine: Machine): VErr[] {
  const errors: VErr[] = [];

  const initialCount = machine.states.filter((state) => state.isInitial).length;
  if (initialCount !== 1) {
    errors.push(
      validationError(
        "initial_count",
        "states",
        `Expected exactly one initial state; received ${initialCount}.`,
      ),
    );
  }

  if (machine.states.length > DOMAIN_LIMITS.states) {
    errors.push(
      validationError(
        "too_large",
        "states",
        `At most ${DOMAIN_LIMITS.states} states are allowed.`,
      ),
    );
  }
  if (machine.events.length > DOMAIN_LIMITS.events) {
    errors.push(
      validationError(
        "too_large",
        "events",
        `At most ${DOMAIN_LIMITS.events} events are allowed.`,
      ),
    );
  }
  if (machine.transitions.length > DOMAIN_LIMITS.transitions) {
    errors.push(
      validationError(
        "too_large",
        "transitions",
        `At most ${DOMAIN_LIMITS.transitions} transitions are allowed.`,
      ),
    );
  }

  const stateIds = new Set<string>();
  machine.states.forEach((state, index) => {
    const idSubject = `states[${index}].id`;
    if (state.id.trim().length === 0) {
      errors.push(validationError("blank_id", idSubject, "State id must not be blank."));
    } else if (!ID_PATTERN.test(state.id)) {
      errors.push(
        validationError(
          "bad_id_charset",
          idSubject,
          "State id must contain only lowercase letters, digits, and underscores.",
        ),
      );
    }
    if (stateIds.has(state.id)) {
      errors.push(validationError("dup_id", idSubject, `Duplicate state id ${state.id}.`));
    }
    stateIds.add(state.id);
    if (state.name.trim().length === 0) {
      errors.push(
        validationError("blank_name", `states[${index}].name`, "State name must not be blank."),
      );
    }
  });

  const eventIds = new Set<string>();
  machine.events.forEach((event, index) => {
    const idSubject = `events[${index}].id`;
    if (event.id.trim().length === 0) {
      errors.push(validationError("blank_id", idSubject, "Event id must not be blank."));
    } else if (!ID_PATTERN.test(event.id)) {
      errors.push(
        validationError(
          "bad_id_charset",
          idSubject,
          "Event id must contain only lowercase letters, digits, and underscores.",
        ),
      );
    }
    if (eventIds.has(event.id)) {
      errors.push(validationError("dup_id", idSubject, `Duplicate event id ${event.id}.`));
    }
    eventIds.add(event.id);
    if (event.name.trim().length === 0) {
      errors.push(
        validationError("blank_name", `events[${index}].name`, "Event name must not be blank."),
      );
    }
  });

  const transitionPairs = new Set<string>();
  const finalStateIds = new Set(
    machine.states.filter((state) => state.isFinal).map((state) => state.id),
  );
  machine.transitions.forEach((transition, index) => {
    const subject = `transitions[${index}]`;
    if (!stateIds.has(transition.from)) {
      errors.push(
        validationError(
          "dangling_ref",
          `${subject}.from`,
          `Unknown source state ${transition.from}.`,
        ),
      );
    }
    if (!eventIds.has(transition.event)) {
      errors.push(
        validationError(
          "dangling_ref",
          `${subject}.event`,
          `Unknown event ${transition.event}.`,
        ),
      );
    }
    if (!stateIds.has(transition.to)) {
      errors.push(
        validationError(
          "dangling_ref",
          `${subject}.to`,
          `Unknown target state ${transition.to}.`,
        ),
      );
    }

    const pair = `${transition.from}\u0000${transition.event}`;
    if (transitionPairs.has(pair)) {
      errors.push(
        validationError(
          "nondeterministic",
          subject,
          `State ${transition.from} has more than one transition for ${transition.event}.`,
        ),
      );
    }
    transitionPairs.add(pair);

    if (finalStateIds.has(transition.from)) {
      errors.push(
        validationError(
          "final_outgoing",
          `${subject}.from`,
          `Final state ${transition.from} cannot have outgoing transitions.`,
        ),
      );
    }
  });

  return errors;
}

export function validateExtraction(
  output: ExtractionOutput,
  sentenceCount: number,
): VErr[] {
  const errors: VErr[] = [];
  if (output.viability.reason.trim().length === 0) {
    errors.push(
      validationError(
        "bad_rationale",
        "viability.reason",
        "Viability reason must not be blank.",
      ),
    );
  }

  if (output.machine === null) return errors;

  const validateEvidence = (
    values: number[],
    userAdded: boolean | undefined,
    subject: string,
  ) => {
    if (values.length === 0 && userAdded !== true) {
      errors.push(
        validationError("no_evidence", subject, "Model-derived elements require Evidence."),
      );
    }
    values.forEach((value, index) => {
      if (value < 1 || value > sentenceCount) {
        errors.push(
          validationError(
            "evidence_range",
            `${subject}[${index}]`,
            `Evidence index ${value} is outside Sentences 1 through ${sentenceCount}.`,
          ),
        );
      }
    });
  };

  output.machine.states.forEach((state, index) => {
    validateEvidence(state.evidence, state.userAdded, `states[${index}].evidence`);
  });
  output.machine.events.forEach((event, eventIndex) => {
    validateEvidence(event.evidence, event.userAdded, `events[${eventIndex}].evidence`);
    const subject = `events[${eventIndex}].surfaceForms`;
    if (event.surfaceForms.length === 0) {
      errors.push(
        validationError(
          "bad_surface_forms",
          subject,
          "An event requires at least one surface form.",
        ),
      );
    }
    const seen = new Set<string>();
    event.surfaceForms.forEach((form, formIndex) => {
      const normalized = form.trim();
      if (normalized.length === 0) {
        errors.push(
          validationError(
            "bad_surface_forms",
            `${subject}[${formIndex}]`,
            "Surface forms must not be blank.",
          ),
        );
      } else if (seen.has(normalized)) {
        errors.push(
          validationError(
            "bad_surface_forms",
            `${subject}[${formIndex}]`,
            `Duplicate surface form ${normalized}.`,
          ),
        );
      }
      seen.add(normalized);
    });
  });
  output.machine.transitions.forEach((transition, index) => {
    validateEvidence(
      transition.evidence,
      transition.userAdded,
      `transitions[${index}].evidence`,
    );
  });

  return errors;
}

export function validateRankOutput(output: RankOutput): VErr[] {
  const errors: VErr[] = [];

  output.rankedHoles.forEach((hole, index) => {
    if (hole.rationale.trim().length === 0) {
      errors.push(
        validationError(
          "bad_rationale",
          `rankedHoles[${index}].rationale`,
          "Rank rationale must not be blank.",
        ),
      );
    }
  });

  const suggestionIds = new Set<string>();
  output.suggestedEvents.forEach((suggestion, index) => {
    const subject = `suggestedEvents[${index}]`;
    if (suggestionIds.has(suggestion.id)) {
      errors.push(
        validationError(
          "suggested_collision",
          `${subject}.id`,
          `Duplicate Suggested Event id ${suggestion.id}.`,
        ),
      );
    }
    suggestionIds.add(suggestion.id);

    if (suggestion.confidence < 0 || suggestion.confidence > 1) {
      errors.push(
        validationError(
          "bad_confidence",
          `${subject}.confidence`,
          "Suggested Event Confidence must be between 0 and 1.",
        ),
      );
    }
    if (suggestion.rationale.trim().length === 0) {
      errors.push(
        validationError(
          "bad_rationale",
          `${subject}.rationale`,
          "Suggested Event rationale must not be blank.",
        ),
      );
    }
  });

  return errors;
}
