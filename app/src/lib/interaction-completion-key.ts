export function interactionCompletionKey(
  agentId: string,
  sessionKey: string | null | undefined,
  identity: string,
): string {
  return JSON.stringify([agentId, sessionKey ?? "", identity]);
}
