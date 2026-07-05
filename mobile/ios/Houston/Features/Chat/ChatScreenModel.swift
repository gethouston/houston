import Foundation

/// The mission chat's reactive state + actions. Binds the SDK
/// `conversation/<id>` VM (feed, running, boardStatus) and the agent's
/// `activities/<agentId>` scope (to resolve this mission's activity id for the
/// Approve action) to native UI, and issues turn/activity commands through the
/// ``ChatCommanding`` seam. All behavior lives in `@houston/sdk`; this only
/// binds and dispatches (client-architecture.md, invariant 1).
@MainActor
@Observable
final class ChatScreenModel {
  let agentId: String
  let conversationId: String

  /// The live conversation VM store; the view reads its `snapshot` reactively.
  let conversation: ScopeStore<ConversationVM>
  /// The agent's board list, used only to resolve the activity id for Approve.
  let activities: ScopeStore<ActivitiesViewModel>

  /// The composer draft. Two-way bound by the composer field.
  var draft: String = ""
  /// True while a `turns/send` is in flight (disables the send button briefly).
  private(set) var isSending = false
  /// Monotonic ticks a view watches with `.sensoryFeedback` for haptics.
  private(set) var sendTick = 0
  /// The last action failure, surfaced as an alert (no silent failures).
  var actionError: String?

  private let commands: ChatCommanding
  private var conversationRetention: ScopeRetention?
  private var activitiesRetention: ScopeRetention?

  init(
    agentId: String,
    conversationId: String,
    client: SdkClient = .shared,
    commands: ChatCommanding? = nil
  ) {
    self.agentId = agentId
    self.conversationId = conversationId
    self.conversation = client.scope(SdkScope.conversation(sessionKey: conversationId))
    self.activities = client.scope(SdkScope.activities(agentId: agentId))
    self.commands = commands ?? SdkChatCommands(client: client)
  }

  // MARK: Derived view state

  var vm: ConversationVM? { conversation.snapshot }
  var rows: [ChatRow] { MissionFeedFold.rows(from: vm?.feed ?? []) }
  var running: Bool { vm?.running ?? false }
  var isEmpty: Bool { vm?.feed.isEmpty ?? true }

  /// The Approve bar shows only when the board card is `needs_you` AND no turn is
  /// running — read the pair, never `sessionStatus` alone (PARITY §1/§5).
  var showApproveBar: Bool {
    !running && vm?.boardStatus == .needsYou
  }

  /// This mission's activity id for `activities/setStatus`. Prefer the board
  /// item whose `sessionKey` matches; fall back to the `activity-<id>` session
  /// key convention (PARITY §6).
  var resolvedActivityId: String {
    if let item = activities.snapshot?.items.first(where: { $0.sessionKey == conversationId }) {
      return item.id
    }
    let prefix = "activity-"
    if conversationId.hasPrefix(prefix) {
      return String(conversationId.dropFirst(prefix.count))
    }
    return conversationId
  }

  // MARK: Lifecycle

  /// Retain both scopes (opening their bridge subscriptions) and attach to the
  /// conversation stream. Subscribe FIRST, then observe, so no live frame is
  /// missed (BRIDGE.md §6.3).
  func appear() {
    conversationRetention = conversation.retain()
    activitiesRetention = activities.retain()
    Task { await self.observe() }
  }

  /// Release both retentions; the last release tears the subscriptions down.
  func disappear() {
    conversationRetention?.cancel()
    activitiesRetention?.cancel()
    conversationRetention = nil
    activitiesRetention = nil
  }

  // MARK: Actions

  /// Send the trimmed draft. Sending in an archived mission just sends —
  /// reactivation is server-side (PARITY §2/§5). Clears the field optimistically
  /// and fires a send haptic.
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

  /// Stop the running turn. There is NO "stopped" copy — a Stop moves the card to
  /// Needs you silently (PARITY §5).
  func stop() {
    Task { await run { try await self.commands.cancel(agentId: self.agentId, conversationId: self.conversationId) } }
  }

  /// Approve → move this mission to Done (`activities/setStatus done`).
  func approve() {
    let id = resolvedActivityId
    Task { await run { try await self.commands.setStatus(agentId: self.agentId, activityId: id, status: "done") } }
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
