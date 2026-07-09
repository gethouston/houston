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
  /// A per-conversation reasoning-effort pin (HOU-695, mirroring ``selectedModel``):
  /// the "+" menu's effort sheet sets this, and it is passed on every
  /// `turns/send` for THIS conversation only. `nil` runs at the agent default.
  /// (Desktop persists effort per-AGENT via `providers/setModel`; iOS pins it
  /// per-conversation on purpose — a founder call still pending.)
  var selectedEffort: EffortLevel?
  /// Files staged in the composer before send (WhatsApp-style), shown as
  /// removable chips above the input. Uploaded on send, then cleared; kept
  /// staged on a send failure so nothing is silently lost. Mutated only by this
  /// model + its `AttachmentSend` extension (never by the view).
  var stagedAttachments: [StagedAttachment] = []
  /// True while a `turns/send` (or a draft's create+send, including its
  /// attachment upload) is in flight.
  private(set) var isSending = false
  /// Monotonic ticks a view watches with `.sensoryFeedback` for haptics.
  private(set) var sendTick = 0
  /// The last action failure, surfaced as an alert (no silent failures).
  var actionError: String?
  /// An oversize / staging rejection, surfaced as its own "File too large"
  /// alert (distinct copy from the generic ``actionError``).
  var attachmentError: String?

  private let client: SdkClient
  /// The command seam. Internal (not `private`) so the `AttachmentSend`
  /// extension in its own file can drive create/send/upload.
  let commands: ChatCommanding
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

  /// Send the trimmed draft (with any staged attachments). Clears the field
  /// optimistically and fires a send haptic. Staged files upload first, then the
  /// saved paths are woven into the message; attachments alone (no text) send.
  /// A draft's first send creates the activity first (see `createAndSend`).
  /// Sending in an archived mission just sends — reactivation is server-side.
  func send() {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    let files = stagedAttachments
    guard !text.isEmpty || !files.isEmpty, !isSending else { return }
    draft = ""
    sendTick += 1
    isSending = true
    Task {
      defer { isSending = false }
      if let conversationId {
        await sendExisting(conversationId: conversationId, text: text, files: files)
      } else {
        await createAndSend(text: text, files: files)
      }
    }
  }

  /// Answer a pending interaction. There is NO dedicated answer command — the
  /// answer is an ordinary next `turns/send` (interaction contract), so this is
  /// a plain send of `text` into the existing conversation (an interaction can
  /// only settle on a real conversation, so `conversationId` is always present).
  func answer(_ text: String) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, !isSending, let conversationId else { return }
    sendTick += 1
    isSending = true
    Task {
      defer { isSending = false }
      await run {
        try await self.commands.send(
          agentId: self.agentId, conversationId: conversationId, text: trimmed,
          model: self.selectedModel, effort: self.selectedEffort)
      }
    }
  }

  /// Pin a per-conversation model (the "+" menu's model picker). Switching to a
  /// DIFFERENT model clears the effort pin: the prior model's reasoning level may
  /// be invalid — or entirely absent — for the new model, so a stale `high` must
  /// not keep riding every `turns/send`. The pin falls back to the agent default
  /// until the user re-pins effort for the new model (desktop resolves per-model
  /// at send via `validEffortOrDefault`; iOS resets the per-conversation pin).
  /// Re-selecting the SAME model leaves any effort pin untouched.
  func selectModel(_ model: String?) {
    guard model != selectedModel else { return }
    selectedModel = model
    selectedEffort = nil
  }

  /// Remove one staged file (its chip's remove button) before send. Staging
  /// files + the attachment-aware send pipeline live in `AttachmentSend.swift`.
  func removeStagedAttachment(id: UUID) {
    stagedAttachments = AttachmentStaging.removing(stagedAttachments, id: id)
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

  /// Attach to the live stream. Internal so the `AttachmentSend` extension can
  /// re-observe after a draft's first send binds the real conversation.
  func observe() async {
    guard let conversationId else { return }
    await run {
      try await self.commands.observe(agentId: self.agentId, conversationId: conversationId)
    }
  }

  /// Transition the draft into its real conversation: address the scope, retain
  /// it (opening the subscription), and remember the session id. Internal for
  /// the same reason as ``observe()``.
  func bindConversation(sessionKey: String) {
    let store = Self.scope(client, agentId, sessionKey)
    conversation = store
    conversationRetention = store.retain()
    conversationId = sessionKey
  }

  /// Undo `bindConversation` after a failed first send, so a retry starts clean.
  func unbindConversation() {
    conversationRetention?.cancel()
    conversationRetention = nil
    conversation = nil
    conversationId = nil
  }

  /// Delete the orphaned activity after a failed first send (rollback). A cleanup
  /// failure is swallowed here — the caller surfaces the real send error instead.
  func rollback(activityId: String) async {
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
