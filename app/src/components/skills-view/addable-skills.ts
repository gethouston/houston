export function offersAddExisting(input: { sharedStore: boolean }): boolean {
  return input.sharedStore;
}

interface AddableCandidate {
  origin?: "shared" | "local";
  agents: readonly { id: string }[];
}

export function addableSkills<T extends AddableCandidate>(
  rows: readonly T[],
  agentId: string,
): T[] {
  return rows.filter(
    (row) =>
      row.origin === "shared" && !row.agents.some((a) => a.id === agentId),
  );
}
