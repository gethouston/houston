import Foundation

/// Pure projections over a `providers/<agentId>` snapshot for the chat "+"
/// menu's model picker (a mobile adaptation of desktop's `ChatModelSelector` +
/// `useChatModelPicker`). Split out so both are unit-testable with no bridge,
/// no scope, no view (client-architecture.md, invariant 1).
enum ModelPickerLogic {
  /// The model to show as "current" (checkmarked): a per-conversation pin when
  /// one is set, else the active provider's active model. Mirrors the desktop
  /// picker's `effectiveModel` fallback, scoped to HOU-695's per-conversation
  /// pin instead of a persisted per-activity one.
  static func currentModel(selectedModel: String?, providers: [ProviderVM]) -> String? {
    if let selectedModel, !selectedModel.isEmpty { return selectedModel }
    let active = providers.first { $0.isActive }?.activeModel
    return (active?.isEmpty ?? true) ? nil : active
  }

  /// Only CONFIGURED providers, wire order preserved — the sheet lists nothing
  /// for a provider the user hasn't connected (that flow lives in AI Models,
  /// not here).
  static func configuredProviders(_ providers: [ProviderVM]) -> [ProviderVM] {
    providers.filter(\.configured)
  }
}
