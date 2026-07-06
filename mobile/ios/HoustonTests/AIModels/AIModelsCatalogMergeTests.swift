import XCTest

@testable import Houston

/// The wire-listed × catalog-metadata merge (PARITY §2a, landmines 3 & 4): the
/// live `providers/<agentId>` VM decides which cards exist; the static catalog
/// only enriches names/auth/descriptions. The two OpenCode gateways collapse to
/// one card; the openai/gemini id namespaces collapse too; unknown wire ids
/// still get a card (never dropped).
final class AIModelsCatalogMergeTests: XCTestCase {
  private func vm(
    _ id: String, name: String = "", configured: Bool = false,
    isActive: Bool = false, activeModel: String = "", models: [String] = [],
    login: LoginState? = nil
  ) -> ProviderVM {
    ProviderVM(
      id: id, name: name.isEmpty ? id : name, configured: configured,
      isActive: isActive, activeModel: activeModel, models: models, login: login)
  }

  func testWireDecidesAvailabilityAndCatalogEnriches() {
    let cards = AIModelsCatalogMerge.merge([
      vm("openai-codex", name: "OpenAI", configured: true, isActive: true),
      vm("anthropic"),
    ])
    XCTAssertEqual(cards.map(\.id), ["openai", "anthropic"])

    let openai = cards[0]
    XCTAssertEqual(openai.name, "OpenAI")
    XCTAssertEqual(openai.descriptionKey, "openai")
    XCTAssertEqual(openai.auth, .oauth)
    XCTAssertEqual(openai.glyphId, "openai-codex")
    XCTAssertTrue(openai.configured)
    XCTAssertTrue(openai.isActive)

    XCTAssertEqual(cards[1].auth, .oauth)
    XCTAssertFalse(cards[1].configured)
  }

  func testOpenCodeGatewaysMergeIntoOneCard() {
    let cards = AIModelsCatalogMerge.merge([
      vm("opencode", name: "OpenCode Zen", configured: true),
      vm("opencode-go", name: "OpenCode Go"),
    ])
    XCTAssertEqual(cards.count, 1)
    let card = cards[0]
    XCTAssertEqual(card.id, "opencode")
    XCTAssertEqual(card.name, "OpenCode")
    XCTAssertEqual(card.auth, .apiKey)
    XCTAssertEqual(card.members.map(\.id), ["opencode", "opencode-go"])
    // Configured on EITHER gateway makes the merged card connected.
    XCTAssertTrue(card.configured)
  }

  func testMergedCardTakesFirstSeenSlotAndPreservesOrder() {
    let cards = AIModelsCatalogMerge.merge([
      vm("anthropic"),
      vm("opencode-go"),
      vm("openrouter"),
      vm("opencode"),
    ])
    // The OpenCode card takes the slot of its first-seen member (opencode-go),
    // and the later `opencode` folds into that same card, not a new one.
    XCTAssertEqual(cards.map(\.id), ["anthropic", "opencode", "openrouter"])
    XCTAssertEqual(cards[1].members.map(\.id), ["opencode-go", "opencode"])
  }

  func testUnknownProviderStillGetsACard() {
    let cards = AIModelsCatalogMerge.merge([vm("acme-labs", name: "Acme Labs")])
    XCTAssertEqual(cards.count, 1)
    let card = cards[0]
    XCTAssertEqual(card.id, "acme-labs")
    XCTAssertEqual(card.name, "Acme Labs")
    XCTAssertNil(card.descriptionKey)
    XCTAssertEqual(card.auth, .oauth)  // unknown → oauth (LoginInfo drives the flow)
    XCTAssertEqual(card.glyphId, "acme-labs")
  }

  func testConnectingStateFromInFlightLogin() {
    let connecting = AIModelsCatalogMerge.merge([
      vm("anthropic", login: LoginState(status: .awaitingUser)),
    ])[0]
    XCTAssertTrue(connecting.connecting)

    let idle = AIModelsCatalogMerge.merge([
      vm("anthropic", login: LoginState(status: .complete)),
    ])[0]
    XCTAssertFalse(idle.connecting)
  }

  func testPrimaryMemberPrefersActiveThenConfigured() {
    let card = AIModelsCatalogMerge.merge([
      vm("opencode", configured: false),
      vm("opencode-go", configured: true, isActive: true, activeModel: "glm-5.1"),
    ])[0]
    XCTAssertEqual(card.primaryMember.id, "opencode-go")
    XCTAssertTrue(card.isActive)
  }
}
