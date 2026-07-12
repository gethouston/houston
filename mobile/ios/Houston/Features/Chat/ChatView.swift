import SwiftUI

/// The mission chat (PARITY): observes the SDK `conversation/<id>` VM, hydrates +
/// streams via `turns/observe` on appear, and renders the feed catalog with the
/// pending-turn helmet in the stream and the desktop-parity composer below.
///
/// Behavior lives entirely in `@houston/sdk` (turn lifecycle, folding, status);
/// this surface only binds the VM to native UI and dispatches commands through
/// ``ChatScreenModel`` (client-architecture.md, invariant 1).
struct ChatView: View {
  /// The agent display name shown as the title bar's first line (WhatsApp-style).
  /// Falls back to ``title`` when the caller can't supply it (e.g. Mission
  /// Control, which addresses a chat by mission, not agent).
  private let agentName: String?
  /// The nav title / display-name fallback: a mission title (real) or the agent
  /// name (draft), as the route carries it.
  private let title: String
  /// A draft chat auto-focuses the composer on appear (WhatsApp new-chat feel);
  /// an existing mission never does.
  private let isDraft: Bool
  @State private var model: ChatScreenModel
  /// Presentation state for the "+" menu and the surfaces it opens (model /
  /// effort pickers, and the AI-models / integrations sheets an interaction card
  /// routes to). Owned here per the composer's contract: `MissionComposer` only
  /// exposes `onPlus`; the container decides what "+" does.
  @State private var controls = ComposerControls()

  /// Open a mission chat. `conversationId` is `nil` for a draft — an empty
  /// conversation whose activity is created on the first send (``ChatRoute``).
  /// `agentName` titles the WhatsApp-style bar; it is optional because Mission
  /// Control opens a chat by mission and doesn't carry the agent's name.
  init(agentId: String, conversationId: String?, title: String, agentName: String? = nil) {
    self.title = title
    self.agentName = agentName
    self.isDraft = conversationId == nil
    _model = State(
      initialValue: ChatScreenModel(agentId: agentId, conversationId: conversationId))
  }

  /// The title bar's first line: the agent display name when known, else the
  /// route title (a mission title / the draft's agent name).
  private var displayName: String { agentName ?? title }

  private var titleStatus: ChatTitleStatus {
    ChatTitleStatus.derive(running: model.running, boardStatus: model.vm?.boardStatus)
  }

  var body: some View {
    feed
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .principal) {
          ChatTitleView(name: displayName, running: model.running, status: titleStatus)
        }
      }
      .safeAreaInset(edge: .bottom, spacing: 0) { footer }
      // The signature branded wallpaper sits behind the whole surface — applied
      // after the composer inset so it bleeds under the composer material (and
      // supplies the base `theme.input` the flat fill used to provide).
      .background { ChatWallpaperView() }
      .onAppear { model.appear() }
      .onDisappear { model.disappear() }
      // Haptics: a light tap on send, a success cue when a turn settles.
      .sensoryFeedback(.impact(weight: .light), trigger: model.sendTick)
      .sensoryFeedback(trigger: model.running) { wasRunning, isRunning in
        wasRunning && !isRunning ? .success : nil
      }
      .alert(
        Strings.Chat.errorTitle, isPresented: errorPresented, presenting: model.actionError
      ) { _ in
        Button(Strings.Chat.dismiss, role: .cancel) { model.actionError = nil }
      } message: { Text($0) }
      .alert(
        Strings.Chat.Attachments.tooLargeTitle,
        isPresented: attachmentErrorPresented, presenting: model.attachmentError
      ) { _ in
        Button(Strings.Chat.dismiss, role: .cancel) { model.attachmentError = nil }
      } message: { Text($0) }
      .composerAccessories(model: model, controls: controls)
  }

  @ViewBuilder private var feed: some View {
    if model.rows.isEmpty && !model.showPending {
      EmptyStateView(
        title: Strings.Chat.emptyTitle,
        description: Strings.Chat.emptyDescription,
        systemImage: "bubble.left.and.bubble.right")
    } else {
      MissionFeed(
        rows: model.rows,
        timestamps: model.timestampsById,
        pendingIds: model.pendingIds,
        failedIds: model.failedIds,
        showPending: model.showPending,
        showPendingLabel: model.showPendingLabel,
        scrollToBottomSignal: model.sendTick)
    }
  }

  private var footer: some View {
    @Bindable var model = model
    return VStack(spacing: 0) {
      if !model.queued.isEmpty {
        QueuedMessagesView(messages: model.queued)
      }
      // A settled turn that lands on `needs_you` surfaces its interaction as a
      // card directly above the composer; answering it is a normal send.
      if let interaction = model.pendingInteraction {
        InteractionCard(
          interaction: interaction,
          isSending: model.isSending,
          onAnswer: { model.answer($0) },
          onOpenAIModels: { controls.showAIModels = true },
          onOpenIntegrations: { controls.showIntegrations = true })
      }
      if !model.stagedAttachments.isEmpty {
        StagedAttachmentChips(
          attachments: model.stagedAttachments,
          onRemove: { model.removeStagedAttachment(id: $0) })
      }
      MissionComposer(
        text: $model.draft,
        isRunning: model.running,
        placeholder: model.composerPlaceholder,
        autoFocus: isDraft,
        hasAttachments: !model.stagedAttachments.isEmpty,
        isSending: model.isSending,
        onSend: { model.send() },
        onStop: { model.stop() }
      ) {
        Button { controls.importingFile = true } label: {
          Label(Strings.Chat.Compose.attachFile, systemImage: "doc")
        }
        Button { controls.pickingPhoto = true } label: {
          Label(Strings.Chat.Compose.attachPhoto, systemImage: "photo")
        }
        Button { controls.showModelPicker = true } label: {
          Label(Strings.Chat.Compose.chooseModel, systemImage: "cpu")
        }
        Button { controls.showEffort = true } label: {
          Label(Strings.Chat.Compose.effort, systemImage: "gauge")
        }
      }
    }
    .animation(.smooth(duration: Motion.fast), value: model.running)
    .animation(.smooth(duration: Motion.fast), value: model.queued)
    .animation(.smooth(duration: Motion.fast), value: model.stagedAttachments)
  }

  private var errorPresented: Binding<Bool> {
    Binding(
      get: { model.actionError != nil },
      set: { if !$0 { model.actionError = nil } })
  }

  private var attachmentErrorPresented: Binding<Bool> {
    Binding(
      get: { model.attachmentError != nil },
      set: { if !$0 { model.attachmentError = nil } })
  }
}
