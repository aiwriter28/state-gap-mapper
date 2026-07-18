/** A deliberately flat finite state machine; behavior arrives in later tasks. */
export interface Sentence {
  index: number;
  text: string;
}

export interface Machine {
  initialStateId: string;
  states: string[];
}
