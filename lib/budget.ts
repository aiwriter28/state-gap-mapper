export const REQUEST_BUDGET_MS = 50_000;
export const ATTEMPT_MAX_MS = 20_000;
export const ATTEMPT_MIN_MS = 15_000;

export interface RequestBudget {
  readonly deadline: number;
  nextAttemptTimeout(): number | null;
}

/**
 * Creates the model-call portion of a request budget. The remaining ten
 * seconds of the Vercel function duration are reserved for HTTP completion.
 */
export function createRequestBudget(
  now: () => number = Date.now,
): RequestBudget {
  const deadline = now() + REQUEST_BUDGET_MS;

  return {
    deadline,
    nextAttemptTimeout() {
      const slot = Math.min(ATTEMPT_MAX_MS, deadline - now());
      return slot >= ATTEMPT_MIN_MS ? slot : null;
    },
  };
}
