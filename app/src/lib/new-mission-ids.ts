export function newMissionIds(conversationId: string | undefined): {
  conversationId: string;
  sessionKey: string;
} {
  const id = conversationId ?? crypto.randomUUID();
  return { conversationId: id, sessionKey: `activity-${id}` };
}
