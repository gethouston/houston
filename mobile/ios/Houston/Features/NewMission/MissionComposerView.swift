import SwiftUI

/// The composer screen (PARITY §6): a multiline prompt for the chosen agent and
/// a Send button. Send is disabled while the text is empty or a send is in
/// flight; on success the parent pushes straight into the mission's chat. A send
/// failure is shown inline (the activity was already rolled back by the model).
struct MissionComposerView: View {
  @Environment(\.theme) private var theme
  @State private var model: NewMissionModel
  @State private var text = ""
  @FocusState private var focused: Bool
  let onSent: (ChatRoute) -> Void

  init(agent: AgentListItem, runner: any MissionCommandRunning = SdkClient.shared,
       onSent: @escaping (ChatRoute) -> Void) {
    _model = State(initialValue: NewMissionModel(agent: agent, runner: runner))
    self.onSent = onSent
  }

  private var canSend: Bool {
    model.phase == .composing && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.space12) {
      HStack(spacing: Spacing.space8) {
        HoustonAvatar(agentColorHex: nil, diameter: 28)
        Text(model.agent.name)
          .font(Typography.bodyMedium)
          .foregroundStyle(theme.foreground)
      }
      composer
      if let error = model.errorMessage {
        Text(error)
          .font(Typography.callout)
          .foregroundStyle(theme.destructive)
      }
      Spacer(minLength: 0)
    }
    .padding(Spacing.space16)
    .background(theme.background)
    .navigationTitle(Strings.NewMission.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button(Strings.NewMission.send, action: submit).disabled(!canSend)
      }
    }
    .onAppear { focused = true }
  }

  private var composer: some View {
    ZStack(alignment: .topLeading) {
      if text.isEmpty {
        Text(Strings.NewMission.composerPlaceholder)
          .font(Typography.body)
          .foregroundStyle(theme.mutedFg)
          .padding(.horizontal, Spacing.space12)
          .padding(.vertical, Spacing.space10)
      }
      TextEditor(text: $text)
        .font(Typography.body)
        .foregroundStyle(theme.foreground)
        .scrollContentBackground(.hidden)
        .frame(minHeight: 120, maxHeight: 240)
        .padding(.horizontal, Spacing.space8)
        .padding(.vertical, Spacing.space6)
        .focused($focused)
        .disabled(model.phase == .sending)
    }
    .background(theme.muted, in: RoundedRectangle(cornerRadius: Radius.composer, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: Radius.composer, style: .continuous)
        .strokeBorder(theme.border, lineWidth: 1)
    )
  }

  private func submit() {
    let toSend = text
    Task { @MainActor in
      if let route = await model.send(text: toSend) { onSent(route) }
    }
  }
}
