import SwiftUI

/// The "+" menu's model picker: a mobile adaptation of the desktop
/// `ChatModelSelector` + `useChatModelPicker` (`app/src/components/
/// chat-model-selector.tsx`, `app/src/hooks/use-chat-model-picker.tsx`) —
/// deliberately NOT the 600px popover with favorites/recents/connect flows,
/// just a clean sheet listing each CONFIGURED provider's models. Picking a
/// model sets a PER-CONVERSATION pin (HOU-695): it never persists agent-wide
/// and never opens a connect/login flow (that surface is AI Models).
struct ModelPickerSheet: View {
  @Environment(\.theme) private var theme
  @Environment(\.dismiss) private var dismiss
  @State private var model: ChatModelPickerModel
  @State private var retention: ScopeRetention?

  /// The conversation's current pin, or `nil` when none is set yet.
  let selectedModel: String?
  /// Called with the picked model id, just before the sheet dismisses.
  let onSelect: (String) -> Void

  init(agentId: String, selectedModel: String?, onSelect: @escaping (String) -> Void) {
    _model = State(initialValue: ChatModelPickerModel(agentId: agentId))
    self.selectedModel = selectedModel
    self.onSelect = onSelect
  }

  private var configured: [ProviderVM] {
    ModelPickerLogic.configuredProviders(model.providers)
  }
  private var current: String? {
    ModelPickerLogic.currentModel(selectedModel: selectedModel, providers: model.providers)
  }

  var body: some View {
    NavigationStack {
      content
        .navigationTitle(Strings.Chat.ModelPicker.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(Strings.Chat.ModelPicker.cancel) { dismiss() }
          }
        }
    }
    .presentationDetents([.medium, .large])
    .onAppear { if retention == nil { retention = model.retain() } }
    .onDisappear { retention?.cancel(); retention = nil }
  }

  @ViewBuilder private var content: some View {
    if !model.loaded {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if configured.isEmpty {
      EmptyStateView(
        title: Strings.Chat.ModelPicker.emptyTitle,
        description: Strings.Chat.ModelPicker.emptyDescription,
        systemImage: "square.stack.3d.up")
    } else {
      List {
        ForEach(configured) { provider in
          Section {
            ForEach(provider.models, id: \.self) { modelId in
              modelRow(modelId, wireId: provider.id)
            }
          } header: {
            HStack(spacing: Spacing.space8) {
              ProviderGlyph(providerId: provider.id, size: 16)
              Text(provider.name)
            }
          }
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
    }
  }

  /// The row label prefers the ported display catalog (``ModelCatalog``, also
  /// used by the AI Models detail sheet) over the raw wire id, so the picker
  /// reads like the desktop's friendly model names — falling back to the raw id
  /// for anything uncatalogued rather than hiding it.
  private func modelRow(_ modelId: String, wireId: String) -> some View {
    let label = ModelCatalog.model(wireId: wireId, modelId: modelId)?.label ?? modelId
    return Button {
      onSelect(modelId)
      dismiss()
    } label: {
      HStack {
        Text(label)
          .font(Typography.body)
          .foregroundStyle(theme.ink)
        Spacer(minLength: Spacing.space8)
        if modelId == current {
          Image(systemName: "checkmark").foregroundStyle(theme.action)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .listRowBackground(Color.clear)
  }
}
