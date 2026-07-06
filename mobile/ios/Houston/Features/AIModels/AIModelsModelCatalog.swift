import Foundation

/// Reasoning-effort levels, ordered low→high. The set a given model accepts is
/// model-specific (`ModelMeta.effortLevels`). Mirrors `EffortLevel` in
/// `app/src/lib/providers.ts` verbatim. Codex takes low…xhigh (no `max`); Claude
/// self-clamps an unsupported value.
enum EffortLevel: String, CaseIterable, Equatable, Sendable {
  case low, medium, high, xhigh, max
}

/// Effort applied when nothing else is configured (`DEFAULT_EFFORT`, providers.ts).
let defaultEffort: EffortLevel = .medium

/// Display metadata for one selectable model, ported from `ModelOption` in
/// `providers.ts`. `contextWindow`/`contextWindowMax` are omitted here — the iOS
/// model picker shows label + description + effort, not the usage denominator.
struct ModelMeta: Equatable, Sendable {
  let id: String
  let label: String
  let description: String
  /// Effort levels this model accepts (empty = no effort control; hide the row).
  let effortLevels: [EffortLevel]

  init(_ id: String, _ label: String, _ description: String, _ effortLevels: [EffortLevel] = []) {
    self.id = id
    self.label = label
    self.description = description
    self.effortLevels = effortLevels
  }
}

/// The provider→model display catalog. Lookups take a WIRE provider id (the id
/// the `providers/<agentId>` VM carries) and return metadata for a model the VM
/// only names by id, so the picker can render a friendly label/description/
/// effort. The two-namespace ids (landmine 4) are normalized to their catalog
/// key: `openai-codex`→`openai`, `gemini`→`google`; the two OpenCode gateways
/// (`opencode`, `opencode-go`) keep DISTINCT model lists (HOU-577), so they are
/// NOT collapsed here even though their connect card is merged.
enum ModelCatalog {
  /// The `ModelData` key a wire provider id reads its models from.
  static func namespace(_ wireId: String) -> String {
    switch wireId {
    case "openai-codex", "openai": return "openai"
    case "gemini", "google": return "google"
    default: return wireId
    }
  }

  /// Metadata for one model of a wire provider, or nil when uncatalogued (the
  /// picker then falls back to the raw model id as its label — never dropped).
  static func model(wireId: String, modelId: String) -> ModelMeta? {
    ModelData.models[namespace(wireId)]?.first { $0.id == modelId }
  }

  /// The effort levels a provider+model accepts (low→high), or empty when the
  /// model has no effort control. Mirrors `getEffortLevels` (providers.ts).
  static func effortLevels(wireId: String, modelId: String) -> [EffortLevel] {
    model(wireId: wireId, modelId: modelId)?.effortLevels ?? []
  }

  /// The effort to actually apply for a provider+model: the requested value when
  /// the model accepts it, else the shared default (or the lowest level if the
  /// model lacks `medium`). Returns nil when the model has no effort control, so
  /// callers omit the flag. Mirrors `validEffortOrDefault` (providers.ts).
  static func validEffort(
    wireId: String, modelId: String, effort: EffortLevel?
  ) -> EffortLevel? {
    let levels = effortLevels(wireId: wireId, modelId: modelId)
    if levels.isEmpty { return nil }
    if let effort, levels.contains(effort) { return effort }
    return levels.contains(defaultEffort) ? defaultEffort : levels.first
  }
}
