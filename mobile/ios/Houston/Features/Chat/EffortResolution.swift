import Foundation

/// Pure resolution of the composer's effort control: given the live
/// `providers/<agentId>` snapshot and the conversation's per-conversation model
/// pin, work out the EFFECTIVE model, its owning provider, and the reasoning
/// levels that model accepts. Split from ``EffortSheet`` so the "which levels
/// does this model offer" logic is unit-tested with no bridge or view.
///
/// The effort table itself is NOT re-ported here — the effort ladder already
/// lives in ``ModelCatalog/effortLevels(wireId:modelId:)`` (ported from
/// `getEffortLevels`, `app/src/lib/providers.ts`), so this only resolves which
/// (provider, model) pair to ask about. The provider match mirrors the SDK's
/// `me()` fallback (`houston-sdk.bridge.js`: `activeModel === model ||
/// models.includes(model)`), scoped to HOU-695's per-conversation pin.
enum EffortResolution {
  /// The (wire provider id, model id) new turns will run under: the pinned
  /// model when set (resolving its owning provider from the snapshot), else the
  /// active provider's active model. `nil` when nothing is resolvable yet
  /// (pre-connect / empty snapshot), so the sheet shows its empty state.
  static func effectiveModel(
    selectedModel: String?, providers: [ProviderVM]
  ) -> (wireId: String, modelId: String)? {
    if let pinned = selectedModel, !pinned.isEmpty {
      let owner =
        providers.first { $0.activeModel == pinned || $0.models.contains(pinned) }
        ?? providers.first { $0.isActive }
      guard let owner else { return nil }
      return (owner.id, pinned)
    }
    guard let active = providers.first(where: { $0.isActive }), !active.activeModel.isEmpty
    else { return nil }
    return (active.id, active.activeModel)
  }

  /// The reasoning-effort levels the effective model accepts (low→high), or
  /// empty when there is no effort control (the sheet then hides the level list).
  static func levels(selectedModel: String?, providers: [ProviderVM]) -> [EffortLevel] {
    guard let effective = effectiveModel(selectedModel: selectedModel, providers: providers)
    else { return [] }
    return ModelCatalog.effortLevels(wireId: effective.wireId, modelId: effective.modelId)
  }
}
