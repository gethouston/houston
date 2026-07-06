import Foundation

/// How the user connects a provider. `oauth` runs the device-code / auth-code
/// login (the flow is decided by the `LoginInfo` the runtime returns, landmine
/// 2); `apiKey` pastes a key. An UNKNOWN wire provider (no catalog entry)
/// defaults to `oauth` so the LoginInfo it returns still drives the right sheet.
enum ProviderAuthKind: Equatable, Sendable {
  case oauth
  case apiKey
}

/// UI catalog metadata for one provider CONNECT card, ported from `PROVIDERS`
/// (+ `OPENCODE_ACCOUNT`) in `app/src/lib/providers.ts`. This is display-only
/// enrichment — it NEVER decides which providers appear (landmine 3); the live
/// `providers/<agentId>` VM does. Metadata is merged onto wire-listed providers
/// only (`AIModelsCatalogMerge`).
struct ProviderCatalogEntry: Equatable, Sendable {
  /// The card id (frontend id): `openai`, `opencode` (merged), etc.
  let id: String
  let name: String
  let subtitle: String
  /// The `ai-hub.json:providers.*` description key.
  let descriptionKey: String
  let auth: ProviderAuthKind
  /// For `apiKey` providers: the dashboard URL to grab a key.
  let apiKeyUrl: String?
  /// GitHub Copilot: connecting first prompts Personal vs Enterprise domain.
  let copilotConnect: Bool
  /// The WIRE provider ids this card represents. The merged OpenCode account maps
  /// to both gateways; OpenAI carries both id namespaces (openai/openai-codex);
  /// Google carries google/gemini. Used for the reverse wire→card lookup.
  let gatewayIds: [String]
}

/// The static provider catalog: metadata lookups keyed by wire id or card id.
/// The OpenCode card is the MERGED account (`OPENCODE_ACCOUNT`, gatewayIds
/// opencode + opencode-go); `openai-compatible` (local, desktop-only) is
/// excluded (landmine 8).
enum ProviderCatalog {
  static let entries: [ProviderCatalogEntry] = [
    .init(id: "openai", name: "OpenAI", subtitle: "Codex", descriptionKey: "openai",
          auth: .oauth, apiKeyUrl: nil, copilotConnect: false,
          gatewayIds: ["openai", "openai-codex"]),
    .init(id: "anthropic", name: "Anthropic", subtitle: "Claude Code", descriptionKey: "anthropic",
          auth: .oauth, apiKeyUrl: nil, copilotConnect: false, gatewayIds: ["anthropic"]),
    .init(id: "github-copilot", name: "GitHub Copilot", subtitle: "Personal or your company's plan",
          descriptionKey: "github-copilot", auth: .oauth, apiKeyUrl: nil, copilotConnect: true,
          gatewayIds: ["github-copilot"]),
    .init(id: "opencode", name: "OpenCode", subtitle: "Zen models or the Go subscription, one key",
          descriptionKey: "opencode-account", auth: .apiKey, apiKeyUrl: "https://opencode.ai/auth",
          copilotConnect: false, gatewayIds: ["opencode", "opencode-go"]),
    .init(id: "openrouter", name: "OpenRouter", subtitle: "Any model, one key", descriptionKey: "openrouter",
          auth: .apiKey, apiKeyUrl: "https://openrouter.ai/settings/keys", copilotConnect: false,
          gatewayIds: ["openrouter"]),
    .init(id: "deepseek", name: "DeepSeek", subtitle: "Official DeepSeek API", descriptionKey: "deepseek",
          auth: .apiKey, apiKeyUrl: "https://platform.deepseek.com/api_keys", copilotConnect: false,
          gatewayIds: ["deepseek"]),
    .init(id: "google", name: "Google Gemini", subtitle: "Free key from AI Studio", descriptionKey: "google",
          auth: .apiKey, apiKeyUrl: "https://aistudio.google.com/apikey", copilotConnect: false,
          gatewayIds: ["google", "gemini"]),
    .init(id: "amazon-bedrock", name: "Amazon Bedrock", subtitle: "Use Bedrock with your AWS account",
          descriptionKey: "amazon-bedrock", auth: .apiKey,
          apiKeyUrl: "https://console.aws.amazon.com/bedrock/home#/api-keys", copilotConnect: false,
          gatewayIds: ["amazon-bedrock"]),
    .init(id: "minimax", name: "MiniMax", subtitle: "Global API", descriptionKey: "minimax",
          auth: .apiKey, apiKeyUrl: "https://platform.minimax.io", copilotConnect: false,
          gatewayIds: ["minimax"]),
  ]

  private static let byCardId: [String: ProviderCatalogEntry] =
    Dictionary(uniqueKeysWithValues: entries.map { ($0.id, $0) })

  private static let byWireId: [String: ProviderCatalogEntry] = {
    var map: [String: ProviderCatalogEntry] = [:]
    for entry in entries { for wire in entry.gatewayIds { map[wire] = entry } }
    return map
  }()

  /// The catalog entry a wire provider id enriches, or nil for an unknown id.
  static func entry(forWireId wireId: String) -> ProviderCatalogEntry? { byWireId[wireId] }

  /// The catalog entry for a card id, or nil when unknown.
  static func entry(cardId: String) -> ProviderCatalogEntry? { byCardId[cardId] }

  /// The card id a wire provider id groups under: its catalog card id when
  /// known (so `openai-codex`→`openai`, `opencode-go`→`opencode`), else the raw
  /// wire id (an unknown provider gets its own card, never dropped). Mirrors the
  /// intent of `capabilityIdsForProvider` + the OpenCode merge in providers.ts.
  static func cardId(forWireId wireId: String) -> String {
    byWireId[wireId]?.id ?? wireId
  }
}

/// A provider "coming soon" on the catalog (`COMING_SOON_PROVIDERS`, providers.ts).
/// Rendered as a disabled tail card, never connectable.
struct ComingSoonProvider: Identifiable, Equatable, Sendable {
  let id: String
  let name: String
  let subtitle: String
  let mark: String
}

extension ProviderCatalog {
  static let comingSoon: [ComingSoonProvider] = [
    .init(id: "subq", name: "SubQ", subtitle: "SubQ Code", mark: "SQ"),
  ]
}
