import Foundation

/// One connect card on the AI Models grid: the live `providers/<agentId>` VMs
/// this card represents, enriched with static catalog metadata (name/subtitle/
/// auth/description). A card usually wraps ONE wire provider; the merged OpenCode
/// account wraps two gateways (opencode + opencode-go), and the two id namespaces
/// (openai/openai-codex, google/gemini) collapse onto one card too (landmine 4).
///
/// Availability is driven ENTIRELY by the wire (`members` comes from the VM);
/// metadata is enrichment only (landmine 3). An unknown wire provider still gets
/// a card — name from the VM, glyph from its first initial — so nothing the wire
/// reported is ever dropped.
struct ProviderCardModel: Identifiable, Equatable, Sendable {
  /// The card id: catalog card id when known, else the raw wire id.
  let id: String
  let name: String
  /// The `ai-hub.json:providers.*` description key, or nil when uncatalogued.
  let descriptionKey: String?
  let auth: ProviderAuthKind
  let apiKeyUrl: String?
  let copilotConnect: Bool
  /// The provider id fed to `ProviderGlyph` (a member wire id; the glyph maps
  /// the namespaces itself).
  let glyphId: String
  /// The wire VMs this card represents, in wire order (1, or 2 for OpenCode).
  let members: [ProviderVM]

  /// Credential present on any member.
  var configured: Bool { members.contains { $0.configured } }
  /// This card owns the active provider.
  var isActive: Bool { members.contains { $0.isActive } }
  /// A login is in flight on any member (drives the "Connecting..." state).
  var connecting: Bool { members.contains { Self.isConnecting($0.login) } }
  /// The member to act on: the active one, else the first configured, else first.
  var primaryMember: ProviderVM {
    members.first { $0.isActive } ?? members.first { $0.configured } ?? members[0]
  }
  /// The GitHub Copilot Enterprise domain a member was issued for, if any.
  var enterpriseUrl: String? { members.compactMap(\.enterpriseUrl).first }

  static func isConnecting(_ login: LoginState?) -> Bool {
    switch login?.status {
    case .starting, .awaitingUser: return true
    default: return false
    }
  }
}

enum AIModelsCatalogMerge {
  /// Merge the live `providers/<agentId>` VM list into ordered connect cards:
  /// each wire provider is grouped by its catalog card id (so the two OpenCode
  /// gateways and the openai/gemini namespaces collapse onto one card), in
  /// first-seen wire order, and enriched with catalog metadata. Wire order is
  /// preserved; a card takes the slot of its first-seen member.
  static func merge(_ providers: [ProviderVM]) -> [ProviderCardModel] {
    var order: [String] = []
    var membersByCard: [String: [ProviderVM]] = [:]
    for vm in providers {
      let cardId = ProviderCatalog.cardId(forWireId: vm.id)
      if membersByCard[cardId] == nil {
        order.append(cardId)
        membersByCard[cardId] = []
      }
      membersByCard[cardId]?.append(vm)
    }
    return order.map { cardId in card(cardId: cardId, members: membersByCard[cardId] ?? []) }
  }

  private static func card(cardId: String, members: [ProviderVM]) -> ProviderCardModel {
    let entry = ProviderCatalog.entry(cardId: cardId)
    let first = members[0]
    return ProviderCardModel(
      id: cardId,
      name: entry?.name ?? first.name,
      descriptionKey: entry?.descriptionKey,
      auth: entry?.auth ?? .oauth,
      apiKeyUrl: entry?.apiKeyUrl,
      copilotConnect: entry?.copilotConnect ?? false,
      glyphId: first.id,
      members: members)
  }
}
