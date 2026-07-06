import Foundation

/// Pure, view-free derivations over the toolkit catalog and the user's
/// connections — the arithmetic the global page and the per-agent view both
/// render, kept here so it is unit-tested in isolation (mirrors the desktop
/// `integrations/model.ts` + `integrations-view-model.ts`).
enum IntegrationsCatalog {
  /// Page size for the browse grid's client-side "Load more" (~1000 apps).
  static let browsePageSize = 100

  /// The browse grid's contents: an active category narrows first, then a search
  /// query matches name/slug/description case-insensitively. `connected` apps are
  /// excluded (the catalog lists apps you can still add). Results are sorted A-Z
  /// by name so scanning 1000+ apps is predictable, not usage-ranked.
  static func browse(
    catalog: [IntegrationToolkit],
    query: String,
    category: String,
    connected: Set<String>
  ) -> [IntegrationToolkit] {
    var filtered = catalog.filter { !connected.contains($0.slug) }
    if category != "all" {
      filtered = filtered.filter { ($0.categories ?? []).contains(category) }
    }
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if !q.isEmpty {
      filtered = filtered.filter {
        $0.name.lowercased().contains(q)
          || $0.slug.lowercased().contains(q)
          || ($0.description ?? "").lowercased().contains(q)
      }
    }
    return filtered.sorted { $0.name.lowercased() < $1.name.lowercased() }
  }

  /// Every category present in the catalog, sorted by display label.
  static func categories(_ catalog: [IntegrationToolkit]) -> [String] {
    var seen = Set<String>()
    for toolkit in catalog {
      for category in toolkit.categories ?? [] { seen.insert(category) }
    }
    return seen.sorted { categoryLabel($0) < categoryLabel($1) }
  }

  /// "developer-tools" -> "Developer tools".
  static func categoryLabel(_ category: String) -> String {
    guard let first = category.first else { return category }
    return first.uppercased() + category.dropFirst().replacingOccurrences(of: "-", with: " ")
  }

  /// Split the user's connections into the two rows the page renders
  /// differently: `active` (usable apps, opened into the detail sheet) and
  /// `recovering` (pending/errored, shown with the recovery affordance). Input
  /// order is preserved within each bucket.
  static func partition(
    _ connections: [IntegrationConnection]
  ) -> (active: [IntegrationConnection], recovering: [IntegrationConnection]) {
    var active: [IntegrationConnection] = []
    var recovering: [IntegrationConnection] = []
    for connection in connections {
      if connection.status == .active {
        active.append(connection)
      } else {
        recovering.append(connection)
      }
    }
    return (active, recovering)
  }

  /// Split connections against one agent's grant set: `granted` are in the set,
  /// `available` are connected but not granted. Connection order preserved.
  static func splitByGrant(
    connections: [IntegrationConnection],
    grants: Set<String>
  ) -> (granted: [IntegrationConnection], available: [IntegrationConnection]) {
    var granted: [IntegrationConnection] = []
    var available: [IntegrationConnection] = []
    for connection in connections {
      if grants.contains(connection.toolkit) {
        granted.append(connection)
      } else {
        available.append(connection)
      }
    }
    return (granted, available)
  }
}

/// The per-agent integrations view has exactly two shapes (PARITY-SETTINGS §3,
/// the 404-null landmine), kept as an enum so a surface can never mix them:
///  - ``grants`` — the host supports per-agent grants. `active` are the apps this
///    agent may use; `available` are connected-but-not-granted apps, activatable
///    with a one-click grant-add (only ACTIVE connections are activatable).
///  - ``degraded`` — this agent's grant set resolved to `nil` (host has no grant
///    routes). Every connected app is usable; no toggles, no account section.
enum AgentIntegrationsShape: Equatable {
  case grants(active: [IntegrationConnection], available: [IntegrationConnection])
  case degraded(all: [IntegrationConnection])

  /// Build the shape from this agent's connections + tri-state grant set
  /// (`nil` = unsupported → degraded). Pure so the split is unit-testable.
  static func build(
    connections: [IntegrationConnection],
    grants: [String]?
  ) -> AgentIntegrationsShape {
    guard let grants else { return .degraded(all: connections) }
    let split = IntegrationsCatalog.splitByGrant(
      connections: connections, grants: Set(grants))
    return .grants(
      active: split.granted,
      available: split.available.filter { $0.status == .active })
  }
}
