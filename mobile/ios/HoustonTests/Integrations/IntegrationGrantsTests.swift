import XCTest

@testable import Houston

/// The per-agent grant tri-state (PARITY-SETTINGS §3, landmine 5): a `nil` grant
/// set for ANY agent means the host has no grant routes (unsupported → no
/// toggles, "all agents"), which is DISTINCT from `[]` (nothing granted). These
/// pin the inversion + toggle arithmetic the detail sheet drives.
final class IntegrationGrantsTests: XCTestCase {
  func testSupportedWhenAllAgentsResolveArrays() {
    let grants = IntegrationGrants(byAgent: ["a": ["gmail"], "b": []])
    XCTAssertTrue(grants.supported)
  }

  func testEmptyMapIsSupported() {
    // No agents in the workspace → nothing reported nil → still supported.
    XCTAssertTrue(IntegrationGrants().supported)
  }

  func testUnsupportedWhenAnyAgentIsNull() {
    let grants = IntegrationGrants(byAgent: ["a": ["gmail"], "b": nil])
    XCTAssertFalse(grants.supported)
  }

  func testEmptyArrayIsGrantedNothingNotUnsupported() {
    // The core landmine: [] must NOT read as unsupported.
    let grants = IntegrationGrants(byAgent: ["a": []])
    XCTAssertTrue(grants.supported)
    XCTAssertEqual(grants.grants(for: "a"), [])
    XCTAssertTrue(grants.agentIds(forToolkit: "gmail").isEmpty)
  }

  func testNullAgentGrantsReadAsNil() {
    let grants = IntegrationGrants(byAgent: ["a": nil])
    XCTAssertNil(grants.grants(for: "a"))
  }

  func testAgentIdsForToolkitInvertsTheMap() {
    let grants = IntegrationGrants(byAgent: [
      "a": ["gmail", "slack"],
      "b": ["slack"],
      "c": [],
    ])
    XCTAssertEqual(grants.agentIds(forToolkit: "slack"), ["a", "b"])
    XCTAssertEqual(grants.agentIds(forToolkit: "gmail"), ["a"])
    XCTAssertTrue(grants.agentIds(forToolkit: "notion").isEmpty)
  }

  func testUnsupportedAgentsContributeNoInvertedIds() {
    let grants = IntegrationGrants(byAgent: ["a": nil, "b": ["gmail"]])
    XCTAssertEqual(grants.agentIds(forToolkit: "gmail"), ["b"])
  }

  func testToggleAddIsIdempotentAndPreservesOthers() {
    let grants = IntegrationGrants(byAgent: ["a": ["gmail"]])
    XCTAssertEqual(grants.toggled(toolkit: "slack", for: "a", active: true), ["gmail", "slack"])
    // Adding an already-present slug does not duplicate it.
    XCTAssertEqual(grants.toggled(toolkit: "gmail", for: "a", active: true), ["gmail"])
  }

  func testToggleRemoveDropsTheSlug() {
    let grants = IntegrationGrants(byAgent: ["a": ["gmail", "slack"]])
    XCTAssertEqual(grants.toggled(toolkit: "gmail", for: "a", active: false), ["slack"])
    // Removing an absent slug is a no-op set (idempotent).
    XCTAssertEqual(grants.toggled(toolkit: "notion", for: "a", active: false), ["gmail", "slack"])
  }

  func testToggleReturnsNilForUnsupportedAgent() {
    let grants = IntegrationGrants(byAgent: ["a": nil])
    XCTAssertNil(grants.toggled(toolkit: "gmail", for: "a", active: true))
  }

  func testSetReplacesOneAgentInPlace() {
    var grants = IntegrationGrants(byAgent: ["a": [], "b": ["gmail"]])
    grants.set(["slack"], for: "a")
    XCTAssertEqual(grants.grants(for: "a"), ["slack"])
    XCTAssertEqual(grants.grants(for: "b"), ["gmail"])
    XCTAssertTrue(grants.supported)
  }
}
