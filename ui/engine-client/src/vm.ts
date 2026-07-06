/**
 * Conversation-VM read side — INERT STUB.
 *
 * The desktop and web builds unconditionally alias `@houston-ai/engine-client`
 * to the host engine-adapter (`packages/web/src/engine-adapter`), whose `vm.ts`
 * exports the LIVE store the turn machinery publishes into. This stub exists so
 * the unaliased package (the app's typecheck resolution, and any third-party
 * import) presents the same surface. It never receives a publish; it dies with
 * this package's client at the v1-client deletion.
 *
 * Shape-compatible with `@houston/sdk`'s `SnapshotSource` — kept dependency-free
 * on purpose (this package has no deps).
 */
export interface ConversationSnapshotSource {
  subscribe(scope: string, cb: (snapshot: unknown) => void): () => void;
  getSnapshot(scope: string): unknown | undefined;
}

export const conversationStore: ConversationSnapshotSource = {
  subscribe: () => () => {},
  getSnapshot: () => undefined,
};

/**
 * Warming-engine send queue (HOU-693) — inert here for the same reason as
 * `conversationStore`: the aliased adapter's implementation pushes the user's
 * message into the live VM before any turn exists.
 */
export function pushPendingUserMessage(
  _agentPath: string,
  _sessionKey: string,
  _text: string,
): void {}
