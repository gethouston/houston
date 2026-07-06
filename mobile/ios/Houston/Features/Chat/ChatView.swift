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
  private let title: String
  @State private var model: ChatScreenModel
  /// The "+" affordance's menu (Choose model / Attach file) and, from it, the
  /// model picker sheet. Both are ChatView-owned per the composer's contract:
  /// `MissionComposer` only exposes `onPlus`, the container decides what "+"
  /// does (today: this menu; PARITY has no desktop equivalent for the shell).
  @State private var showPlusMenu = false
  @State private var showModelPicker = false

  /// Open a mission chat. `conversationId` is `nil` for a draft — an empty
  /// conversation whose activity is created on the first send (``ChatRoute``).
  init(agentId: String, conversationId: String?, title: String) {
    self.title = title
    _model = State(
      initialValue: ChatScreenModel(agentId: agentId, conversationId: conversationId))
  }

  var body: some View {
    feed
      .background(theme.background)
      .navigationTitle(title)
      .navigationBarTitleDisplayMode(.inline)
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
