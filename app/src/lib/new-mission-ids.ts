// No imports, so it is node-testable directly (app/tests/composer-prewarm.test.ts).

/**
 * The id and session key a mission created client-side is born with. A
 * composer that warmed a sandbox while the person typed passes the id it
 * warmed (`claimNewConversationId`), and only a send to that same conversation
 * attaches to the sandbox; anything else gets a fresh id.
 */
export function newMissionIds(conversationId: string | undefined): {
  conversationId: string;
  sessionKey: string;
} {
  const id = conversationId ?? crypto.randomUUID();
  return { conversationId: id, sessionKey: `activity-${id}` };
}
