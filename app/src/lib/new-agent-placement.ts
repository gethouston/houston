export type NewAgentPlacement =
  | { kind: "default" }
  | { kind: "server"; teamId: string }
  | { kind: "local"; groupId: string };

export function newAgentPlacement(
  teamId: string | null,
  serverBacked: boolean,
): NewAgentPlacement {
  if (teamId === null) return { kind: "default" };
  return serverBacked
    ? { kind: "server", teamId }
    : { kind: "local", groupId: teamId };
}
