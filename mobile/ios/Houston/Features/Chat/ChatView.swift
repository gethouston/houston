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
        onStop: { model.stop() })
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
