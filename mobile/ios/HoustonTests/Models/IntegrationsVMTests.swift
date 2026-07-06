import XCTest

@testable import Houston

/// Pins the `integrations` VM decode + the grants null-vs-`[]` semantics against
/// the wire the SDK publishes (`packages/sdk/tests/integrations.contract.test.ts`):
/// readiness + catalog + connections, the `unavailable`/`signin` degrade states,
/// tolerant `status`, and the 404-null vs empty-array grants landmine.
final class IntegrationsVMTests: XCTestCase {
  private func decode<T: Decodable>(_ json: String, as type: T.Type = T.self) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(json.utf8))
  }

  private func encoded<T: Encodable>(_ value: T) throws -> JSONValue {
    try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
  }

  // MARK: Ready VM (mirrors the contract-test seed)

  func testDecodesReadySnapshot() throws {
    let json = """
      { "loaded": true, "ready": true,
        "toolkits": [
          { "slug": "github", "name": "GitHub", "description": "Code host",
            "logoUrl": "https://cdn/gh.png", "categories": ["developer-tools"] },
          { "slug": "gmail", "name": "Gmail" },
          { "slug": "slack", "name": "Slack" } ],
        "connections": [
          { "toolkit": "gmail", "connectionId": "conn-gmail-0", "status": "active" } ] }
      """
    let vm = try decode(json, as: IntegrationsViewModel.self)
    XCTAssertTrue(vm.loaded)
    XCTAssertTrue(vm.ready)
    XCTAssertNil(vm.reason)  // no reason on a ready VM
    XCTAssertEqual(vm.toolkits.map(\.slug), ["github", "gmail", "slack"])

    let github = try XCTUnwrap(vm.toolkits.first)
    XCTAssertEqual(github.categories, ["developer-tools"])
    XCTAssertEqual(github.logoUrl, "https://cdn/gh.png")

    let gmail = vm.toolkits[1]
    XCTAssertNil(gmail.description)  // absent optionals → nil
    XCTAssertNil(gmail.logoUrl)
    XCTAssertNil(gmail.categories)

    XCTAssertEqual(
      vm.connections,
      [IntegrationConnection(toolkit: "gmail", connectionId: "conn-gmail-0", status: .active)])
  }

  func testDegradesToUnavailable() throws {
    let vm = try decode(
      "{ \"loaded\": true, \"ready\": false, \"reason\": \"unavailable\", \"toolkits\": [], \"connections\": [] }",
      as: IntegrationsViewModel.self)
    XCTAssertFalse(vm.ready)
    XCTAssertEqual(vm.reason, .unavailable)
    XCTAssertTrue(vm.toolkits.isEmpty)
  }

  func testDegradesToSignin() throws {
    let vm = try decode(
      "{ \"loaded\": true, \"ready\": false, \"reason\": \"signin\", \"toolkits\": [], \"connections\": [] }",
      as: IntegrationsViewModel.self)
    XCTAssertEqual(vm.reason, .signin)
  }

  func testUnknownReasonPreserved() throws {
    let vm = try decode(
      "{ \"loaded\": true, \"ready\": false, \"reason\": \"future\", \"toolkits\": [], \"connections\": [] }",
      as: IntegrationsViewModel.self)
    XCTAssertEqual(vm.reason, .unknown("future"))
  }

  // MARK: Connection status tolerance + ConnectResult

  func testConnectionStatusKinds() throws {
    func status(_ raw: String) throws -> ConnectionStatus {
      try decode("{ \"toolkit\": \"slack\", \"connectionId\": \"c1\", \"status\": \"\(raw)\" }", as: IntegrationConnection.self).status
    }
    XCTAssertEqual(try status("active"), .active)
    XCTAssertEqual(try status("pending"), .pending)
    XCTAssertEqual(try status("error"), .error)
    XCTAssertEqual(try status("brand_new"), .unknown("brand_new"))
  }

  func testConnectResult() throws {
    let r = try decode(
      "{ \"redirectUrl\": \"https://connect.test/slack\", \"connectionId\": \"conn-slack-1\" }",
      as: ConnectResult.self)
    XCTAssertEqual(r.redirectUrl, "https://connect.test/slack")
    XCTAssertEqual(r.connectionId, "conn-slack-1")
  }

  // MARK: Grants — null (unsupported) vs [] (nothing granted) stay distinct

  func testGrantsNullMeansUnsupported() throws {
    // The SdkClient wraps a JSON-null command value as JSONValue.null, then
    // decodes the requested type — [String]? — which yields nil.
    let grants = try JSONValue.null.decode([String]?.self)
    XCTAssertNil(grants)
  }

  func testGrantsEmptyArrayIsDistinctFromNull() throws {
    let grants = try JSONValue.array([]).decode([String]?.self)
    XCTAssertEqual(grants, [])  // a real record, nothing granted
    XCTAssertNotNil(grants)
  }

  func testGrantsPopulated() throws {
    let grants = try decode("[\"gmail\", \"slack\"]", as: [String]?.self)
    XCTAssertEqual(grants, ["gmail", "slack"])
  }

  func testSetGrantsPayloadCarriesToolkits() throws {
    let j = try encoded(SetGrantsPayload(agentId: "a1", toolkits: ["gmail"]))
    XCTAssertEqual(j["agentId"], .string("a1"))
    XCTAssertEqual(j["toolkits"], .array([.string("gmail")]))
  }
}
