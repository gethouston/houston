import Foundation

/// The mission chat's reactive state + actions. Binds the SDK
/// `conversation/<id>` VM (feed, running) to native UI and issues turn commands
/// through the ``ChatCommanding`` seam. All behavior lives in `@houston/sdk`;
/// this only binds and dispatches (client-architecture.md, invariant 1).
///
/// ## Draft mode
/// A draft chat opens with a known `agentId` but no `conversationId` — an empty
/// feed with the composer active. The activity is created ON FIRST SEND, exactly
/// mirroring the desktop's `createMission` (`app/src/lib/create-mission.ts`):
/// `activities/create` (fallback title) → `turns/send` → bind the now-real
/// `conversation/<agentPath>/<sessionKey>` scope and observe it as a normal chat.
/// A create-or-send failure rolls the activity back (`activities/delete`) and
/// restores the draft text so the user can retry — no silent failure, no orphan.
@MainActor
@Observable
final class ChatScreenModel {
  let agentId: String
  /// The chat/session address, or `nil` while this is an unsent draft.
  private(set) var conversationId: String?

  /// The live conversation VM store; `nil` for a draft until its first send
  /// creates the activity and binds the scope. The view reads `vm` reactively.
  private(set) var conversation: ScopeStore<ConversationVM>?

  /// The composer draft. Two-way bound by the composer field.
  var draft: String = ""
  /// A per-conversation model pin (HOU-695): the "+" menu's model picker sets
  /// this, and it is passed on every `turns/send` for THIS conversation only —
  /// it never becomes the agent-wide default. `nil` falls back to the agent's
  /// active provider/model.
  var selectedModel: String?
  /// True while a `turns/send` (or a draft's create+send) is in flight.
  private(set) var isSending = false
  /// Monotonic ticks a view watches with `.sensoryFeedback` for haptics.
  private(set) var sendTick = 0
  /// The last action failure, surfaced as an alert (no silent failures).
  var actionError: String?

  private let client: SdkClient
  private let commands: ChatCommanding
  private var conversationRetention: ScopeRetention?

  init(
    agentId: String,
    conversationId: String?,
    client: SdkClient = .shared,
    commands: ChatCommanding? = nil
  ) {
    self.agentId = agentId
    self.conversationId = conversationId
    self.client = client
    self.commands = commands ?? SdkChatCommands(client: client)
    if let conversationId { conversation = Self.scope(client, agentId, conversationId) }
  }

  private static func scope(
    _ client: SdkClient, _ agentId: String, _ conversationId: String
  ) -> ScopeStore<ConversationVM> {
    client.scope(SdkScope.conversation(agentPath: agentId, sessionKey: conversationId))
  }

  // MARK: Lifecycle

  /// Retain the conversation scope (opening its bridge subscription) and attach
  /// to the stream. Subscribe FIRST, then observe, so no live frame is missed
  /// (BRIDGE.md §6.3). A draft has no scope yet — it attaches on its first send.
  func appear() {
    guard let conversation else { return }
    conversationRetention = conversation.retain()
    Task { await self.observe() }
  }

  /// Release the retention; the last release tears the subscription down.
  func disappear() {
    conversationRetention?.cancel()
    conversationRetention = nil
  }

  // MARK: Actions

  /// Send the trimmed draft. Clears the field optimistically and fires a send
  /// haptic. A draft's first send creates the activity first (see `createAndSend`).
  /// Sending in an archived mission just sends — reactivation is server-side.
  func send() {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty, !isSending else { return }
    draft = ""
    sendTick += 1
    isSending = true
    Task {
      defer { isSending = false }
      if let conversationId {
        await run {
          try await self.commands.send(
            agentId: self.agentId, conversationId: conversationId, text: text,
            model: self.selectedModel)
        }
      } else {
        await createAndSend(text: text)
      }
    }
  }

  /// A draft's first send: create the activity, then send the first turn, then
  /// bind + observe the real conversation. Subscribe BEFORE sending so no live
  /// frame is missed. On failure, roll the activity back and restore the draft
  /// text so the user can retry (PARITY §6 / `create-mission.ts`).
  private func createAndSend(text: String) async {
    let title = MissionTitle.fallback(from: text)
    do {
      let created = try await commands.create(agentId: agentId, title: title, description: text)
      do {
        bindConversation(sessionKey: created.sessionKey)
        try await commands.send(
          agentId: agentId, conversationId: created.sessionKey, text: text, model: selectedModel)
      } catch {
        unbindConversation()
        await rollback(activityId: created.id)
        throw error
      }
      await observe()
      // deferred: no title-summarize command is exposed over the SDK bridge
      // (only activities/{create,setStatus,rename,delete}); the fallback title
      // stands, and the engine may still refresh it server-side.
    } catch {
      draft = text
      actionError = (error as? CommandError)?.message ?? error.localizedDescription
    }
  }

  /// Stop the running turn (`turns/cancel`). There is NO "stopped" copy — a Stop
  /// moves the card to Needs you silently (PARITY §2). A draft has nothing to stop.
  func stop() {
    guard let conversationId else { return }
    Task {
      await run {
        try await self.commands.cancel(agentId: self.agentId, conversationId: conversationId)
      }
    }
  }

  private func observe() async {
    guard let conversationId else { return }
    await run {
      try await self.commands.observe(agentId: self.agentId, conversationId: conversationId)
    }
  }

  /// Transition the draft into its real conversation: address the scope, retain
  /// it (opening the subscription), and remember the session id.
  private func bindConversation(sessionKey: String) {
    let store = Self.scope(client, agentId, sessionKey)
    conversation = store
    conversationRetention = store.retain()
    conversationId = sessionKey
  }

  /// Undo `bindConversation` after a failed first send, so a retry starts clean.
  private func unbindConversation() {
    conversationRetention?.cancel()
    conversationRetention = nil
    conversation = nil
    conversationId = nil
  }

  /// Delete the orphaned activity after a failed first send (rollback). A cleanup
  /// failure is swallowed here — the caller surfaces the real send error instead.
  private func rollback(activityId: String) async {
    try? await commands.delete(agentId: agentId, activityId: activityId)
  }

  /// Run a command, surfacing any failure loudly on ``actionError``.
  private func run(_ body: () async throws -> Void) async {
    do {
      try await body()
    } catch {
      actionError = (error as? CommandError)?.message ?? error.localizedDescription
    }
  }
}
