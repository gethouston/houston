import SwiftUI

/// The mission chat (PARITY): observes the SDK `conversation/<id>` VM, hydrates +
/// streams via `turns/observe` on appear, and renders the feed catalog with the
/// pending-turn helmet in the stream and the desktop-parity composer below.
///
/// Behavior lives entirely in `@houston/sdk` (turn lifecycle, folding, status);
/// this surface only binds the VM to native UI and dispatches commands through
/// ``ChatScreenModel`` (client-architecture.md, invariant 1).
struct ChatView: View {
  @Environment(\.theme) private var theme
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
  /// The "+" affordance's menu (Choose model / Attach file) and, from it, the
  /// model picker sheet. Both are ChatView-owned per the composer's contract:
  /// `MissionComposer` only exposes `onPlus`, the container decides what "+"
  /// does (today: this menu; PARITY has no desktop equivalent for the shell).
  @State private var showPlusMenu = false
  @State private var showModelPicker = false

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
      .background(theme.background)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .principal) {
          ChatTitleView(name: displayName, running: model.running, status: titleStatus)
        }
      }
      .safeAreaInset(edge: .bottom, spacing: 0) { footer }
      .onAppear { model.appear() }
      .onDisappear { model.disappear() }
      // Haptics: a light tap on send, a success cue when a turn settles.
      .sensoryFeedback(.impact(weight: .light), trigger: model.sendTick)
      .sensoryFeedback(trigger: model.running) { wasRunning, isRunning in
        wasRunning && !isRunning ? .success : nil
      }
      .alert(
        Strings.Chat.errorTitle,
        isPresented: errorPresented,
        presenting: model.actionError
      ) { _ in
        Button(Strings.Chat.dismiss, role: .cancel) { model.actionError = nil }
      } message: { Text($0) }
      .confirmationDialog(
        Strings.Chat.PlusMenu.title, isPresented: $showPlusMenu, titleVisibility: .visible
      ) {
        Button(Strings.Chat.PlusMenu.chooseModel) { showModelPicker = true }
        // Attachments aren't wired to the engine send path yet (no silent
        // no-op though: the label itself says so, and disabled greys the row).
        Button(Strings.Chat.PlusMenu.attachFile) {}
          .disabled(true)
      }
      .sheet(isPresented: $showModelPicker) {
        ModelPickerSheet(agentId: model.agentId, selectedModel: model.selectedModel) {
          model.selectedModel = $0
        }
      }
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
      MissionComposer(
        text: $model.draft,
        isRunning: model.running,
        placeholder: model.composerPlaceholder,
        autoFocus: isDraft,
        onSend: { model.send() },
        onStop: { model.stop() },
        onPlus: { showPlusMenu = true })
    }
    .animation(.smooth(duration: Motion.fast), value: model.running)
    .animation(.smooth(duration: Motion.fast), value: model.queued)
  }

  private var errorPresented: Binding<Bool> {
    Binding(
      get: { model.actionError != nil },
      set: { if !$0 { model.actionError = nil } })
  }
}
