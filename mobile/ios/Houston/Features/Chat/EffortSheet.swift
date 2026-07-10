import SwiftUI

/// The "+" menu's effort control: a small sheet listing the reasoning-effort
/// levels the CURRENT effective model accepts (``EffortResolution``), plus a
/// "Default" row for no pin. Selection is a PER-CONVERSATION pin
/// (``ChatScreenModel/selectedEffort``), mirroring the model picker's HOU-695
/// pin — it never persists agent-wide.
///
/// Reuses ``ChatModelPickerModel`` (the model picker's `providers/<agentId>`
/// stream) so both accessories agree on the live provider snapshot, and
/// ``ModelCatalog``'s ported effort table (`getEffortLevels`, `providers.ts`).
struct EffortSheet: View {
  @Environment(\.theme) private var theme
  @Environment(\.dismiss) private var dismiss
  @State private var model: ChatModelPickerModel
  @State private var retention: ScopeRetention?

  /// The conversation's model pin, needed to resolve which model's effort ladder
  /// to show (the pinned model, else the active one).
  let selectedModel: String?
  /// The conversation's current effort pin, or `nil` for "Default".
  let selectedEffort: EffortLevel?
  /// Called with the picked level (`nil` = clear the pin / use the default).
  let onSelect: (EffortLevel?) -> Void

  init(
    agentId: String, selectedModel: String?, selectedEffort: EffortLevel?,
    onSelect: @escaping (EffortLevel?) -> Void
  ) {
    _model = State(initialValue: ChatModelPickerModel(agentId: agentId))
    self.selectedModel = selectedModel
    self.selectedEffort = selectedEffort
    self.onSelect = onSelect
  }

  private var levels: [EffortLevel] {
    EffortResolution.levels(selectedModel: selectedModel, providers: model.providers)
  }

  var body: some View {
    NavigationStack {
      content
        .navigationTitle(Strings.Chat.Effort.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(Strings.Chat.Effort.cancel) { dismiss() }
          }
        }
    }
    .presentationDetents([.medium])
    .onAppear { if retention == nil { retention = model.retain() } }
    .onDisappear { retention?.cancel(); retention = nil }
  }

  @ViewBuilder private var content: some View {
    if !model.loaded {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if levels.isEmpty {
      EmptyStateView(
        title: Strings.Chat.Effort.emptyTitle,
        description: Strings.Chat.Effort.emptyDescription,
        systemImage: "gauge.with.dots.needle.33percent")
    } else {
      List {
        row(label: Strings.Chat.Effort.defaultRow, level: nil, isCurrent: selectedEffort == nil)
        ForEach(levels, id: \.self) { level in
          row(label: Strings.Chat.Effort.level(level), level: level, isCurrent: level == selectedEffort)
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
    }
  }

  private func row(label: String, level: EffortLevel?, isCurrent: Bool) -> some View {
    Button {
      onSelect(level)
      dismiss()
    } label: {
      HStack {
        Text(label)
          .font(Typography.body)
          .foregroundStyle(theme.foreground)
        Spacer(minLength: Spacing.space8)
        if isCurrent {
          Image(systemName: "checkmark").foregroundStyle(theme.primary)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .listRowBackground(Color.clear)
  }
}
