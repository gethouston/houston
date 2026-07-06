import Foundation

/// The mission chat's reactive state + actions. Binds the SDK
/// `conversation/<id>` VM (feed, running) to native UI and issues turn commands
/// through the ``ChatCommanding`` seam. All behavior lives in `@houston/sdk`;
/// this only binds and dispatches (client-architecture.md, invariant 1).
@MainActor
@Observable
final class ChatScreenModel {
  let agentId: String
  let conversationId: String

  /// The live conversation VM store; the view reads its `snapshot` reactively.
  let conversation: ScopeStore<ConversationVM>

  /// The composer draft. Two-way bound by the composer field.
  var draft: String = ""
  /// True while a `turns/send` is in flight (guards double-send).
  private(set) var isSending = false
  /// Monotonic ticks a view watches with `.sensoryFeedback` for haptics.
  private(set) var sendTick = 0
  /// The last action failure, surfaced as an alert (no silent failures).
  var actionError: String?

  private let commands: ChatCommanding
  private var conversationRetention: ScopeRetention?

  init(
    agentId: String,
    conversationId: String,
    client: SdkClient = .shared,
    commands: ChatCommanding? = nil
  ) {
    self.agentId = agentId
    self.conversationId = conversationId
    self.conversation = client.scope(
      SdkScope.conversation(agentPath: agentId, sessionKey: conversationId))
    self.commands = commands ?? SdkChatCommands(client: client)
  }

  // MARK: Derived view state

  var vm: ConversationVM? { conversation.snapshot }
  var rows: [ChatRow] { MissionFeedFold.rows(from: vm?.feed ?? [], running: running) }
  var running: Bool { vm?.running ?? false }
  var isEmpty: Bool { vm?.feed.isEmpty ?? true }

  /// Messages queued while the turn runs, rendered as pending bubbles above the
  /// composer (PARITY §7). Empty until the SDK bridge publishes a `queued` list.
  var queued: [QueuedMessageVM] { vm?.queued ?? [] }

  /// The in-flight display status (mirrors desktop `deriveStatus`, `chat-status.ts`).
  var chatStatus: ChatStatus { ChatStatus.derive(feed: vm?.feed ?? [], running: running) }

  /// Whether the pending-assistant slot (pulsing helmet) shows: a turn is in
  /// flight and no assistant text is streaming (`status == submitted`). It stays
  /// up through reasoning + tool phases and vanishes the instant the reply
  /// streams (PARITY §1, HOU-655).
  var showPending: Bool { running && chatStatus != .streaming }

  /// Whether the standalone "Mission in progress..." label shows above the
  /// helmet: only while pending AND no active process block already surfaces it
  /// (PARITY §1, desktop `shouldShowThinkingIndicator`).
  var showPendingLabel: Bool { showPending && !hasActiveProcess }

  /// The composer placeholder: a first message starts a mission; once the user
  /// has spoken it is a follow-up (PARITY §2, ai-board.tsx literals).
  var composerPlaceholder: String {
    hasUserMessage ? Strings.Chat.followUpPlaceholder : Strings.Chat.newMissionPlaceholder
  }

  private var hasActiveProcess: Bool {
    if case let .process(group)? = rows.last?.kind { return group.active }
    return false
  }

  private var hasUserMessage: Bool {
    vm?.feed.contains { if case .userMessage = $0.item { return true }; return false } ?? false
  }

  // MARK: Lifecycle

  /// Retain the conversation scope (opening its bridge subscription) and attach
  /// to the stream. Subscribe FIRST, then observe, so no live frame is missed
  /// (BRIDGE.md §6.3).
  func appear() {
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
  /// haptic. Sending in an archived mission just sends — reactivation is
  /// server-side (PARITY §2).
  func send() {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty, !isSending else { return }
    draft = ""
    sendTick += 1
    isSending = true
    Task {
      defer { isSending = false }
      await run { try await self.commands.send(agentId: self.agentId, conversationId: self.conversationId, text: text) }
    }
  }

  /// Stop the running turn (`turns/cancel`). There is NO "stopped" copy — a Stop
  /// moves the card to Needs you silently (PARITY §2).
  func stop() {
    Task { await run { try await self.commands.cancel(agentId: self.agentId, conversationId: self.conversationId) } }
  }

  private func observe() async {
    await run { try await self.commands.observe(agentId: self.agentId, conversationId: self.conversationId) }
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
