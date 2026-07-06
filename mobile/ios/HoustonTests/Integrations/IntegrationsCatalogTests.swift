import XCTest

@testable import Houston

/// Catalog + connection derivations for the Integrations surface: the browse
/// grid's filter/sort (PARITY-SETTINGS §3 — category narrows, then search, A-Z
/// sorted, connected excluded), category extraction, and the per-agent
/// grants-vs-degraded shape split (the 404-null landmine).
final class IntegrationsCatalogTests: XCTestCase {
  private func toolkit(
    _ slug: String,
    name: String? = nil,
    description: String? = nil,
    categories: [String]? = nil
  ) -> IntegrationToolkit {
    IntegrationToolkit(
      slug: slug, name: name ?? slug, description: description, logoUrl: nil, categories: categories)
  }

  private func connection(_ toolkit: String, _ status: ConnectionStatus) -> IntegrationConnection {
    IntegrationConnection(toolkit: toolkit, connectionId: "conn-\(toolkit)", status: status)
  }

  private var catalog: [IntegrationToolkit] {
    [
      toolkit("gmail", name: "Gmail", description: "Email", categories: ["productivity"]),
      toolkit("github", name: "GitHub", description: "Code host", categories: ["developer-tools"]),
      toolkit("slack", name: "Slack", description: "Chat", categories: ["productivity", "communication"]),
      toolkit("asana", name: "Asana", categories: ["productivity"]),
    ]
  }

  // MARK: browse

  func testBrowseSortsAToZByName() {
    let names = IntegrationsCatalog.browse(catalog: catalog, query: "", category: "all", connected: [])
      .map(\.name)
    XCTAssertEqual(names, ["Asana", "GitHub", "Gmail", "Slack"])
  }

  func testBrowseExcludesConnected() {
    let slugs = IntegrationsCatalog.browse(
      catalog: catalog, query: "", category: "all", connected: ["gmail", "slack"]
    ).map(\.slug)
    XCTAssertEqual(slugs, ["asana", "github"])
  }

  func testBrowseNarrowsByCategory() {
    let slugs = IntegrationsCatalog.browse(
      catalog: catalog, query: "", category: "developer-tools", connected: []
    ).map(\.slug)
    XCTAssertEqual(slugs, ["github"])
  }

  func testBrowseSearchMatchesNameSlugAndDescription() {
    // Description match ("Chat" only on Slack).
    XCTAssertEqual(
      IntegrationsCatalog.browse(catalog: catalog, query: "chat", category: "all", connected: []).map(\.slug),
      ["slack"])
    // Name match, case-insensitive + trimmed.
    XCTAssertEqual(
      IntegrationsCatalog.browse(catalog: catalog, query: "  GIT ", category: "all", connected: []).map(\.slug),
      ["github"])
  }

  func testBrowseCategoryAndSearchCombine() {
    let slugs = IntegrationsCatalog.browse(
      catalog: catalog, query: "sl", category: "productivity", connected: []
    ).map(\.slug)
    // productivity = gmail, slack, asana; "sl" matches only Slack.
    XCTAssertEqual(slugs, ["slack"])
  }

  // MARK: categories

  func testCategoriesAreDedupedAndLabelSorted() {
    XCTAssertEqual(
      IntegrationsCatalog.categories(catalog),
      ["communication", "developer-tools", "productivity"])
  }

  func testCategoryLabelTitleCasesAndDehyphenates() {
    XCTAssertEqual(IntegrationsCatalog.categoryLabel("developer-tools"), "Developer tools")
    XCTAssertEqual(IntegrationsCatalog.categoryLabel("productivity"), "Productivity")
  }

  // MARK: partition

  func testPartitionSplitsActiveFromRecovering() {
    let parts = IntegrationsCatalog.partition([
      connection("gmail", .active),
      connection("slack", .pending),
      connection("github", .error),
    ])
    XCTAssertEqual(parts.active.map(\.toolkit), ["gmail"])
    XCTAssertEqual(parts.recovering.map(\.toolkit), ["slack", "github"])
  }

  // MARK: per-agent shape

  func testShapeDegradesWhenGrantsNull() {
    let shape = AgentIntegrationsShape.build(
      connections: [connection("gmail", .active), connection("slack", .pending)],
      grants: nil)
    XCTAssertEqual(shape, .degraded(all: [connection("gmail", .active), connection("slack", .pending)]))
  }

  func testShapeSplitsGrantedFromAvailableActiveOnly() {
    let shape = AgentIntegrationsShape.build(
      connections: [
        connection("gmail", .active),   // granted
        connection("slack", .active),   // available (active → activatable)
        connection("notion", .pending), // available but pending → NOT activatable
      ],
      grants: ["gmail"])
    XCTAssertEqual(
      shape,
      .grants(active: [connection("gmail", .active)], available: [connection("slack", .active)]))
  }

  func testShapeEmptyGrantsYieldsNoActiveApps() {
    let shape = AgentIntegrationsShape.build(
      connections: [connection("gmail", .active)], grants: [])
    XCTAssertEqual(
      shape, .grants(active: [], available: [connection("gmail", .active)]))
  }
}
