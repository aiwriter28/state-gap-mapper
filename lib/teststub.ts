export interface TestStubInput {
  stateName: string;
  eventName: string;
  targetName: string | null;
  evidence: number[];
}

export function renderStub({ stateName, eventName, targetName, evidence }: TestStubInput): string {
  const outcome = targetName === null
    ? "Then define the expected outcome"
    : `Then the system moves to ${targetName}`;
  return [
    `# Evidence: sentences ${evidence.join(", ")}`,
    `Given the system is in state ${stateName}`,
    `When ${eventName} occurs`,
    outcome,
  ].join("\n");
}
