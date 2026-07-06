import XCTest

@testable import Houston

/// Pins the preferences payload shapes + the `Workspace` decode against the wire
/// the SDK publishes (`packages/sdk/tests/preferences.contract.test.ts`). The
/// load-bearing rule: `set`/`setLocale` carry `null` to CLEAR, so a `nil` must
/// encode as an explicit JSON `null`, never a dropped key.
final class PreferencesModelsTests: XCTestCase {
  private func decode<T: Decodable>(_ json: String, as type: T.Type = T.self) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(json.utf8))
  }

  private func encoded<T: Encodable>(_ value: T) throws -> JSONValue {
    try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
  }

  // MARK: Workspace

  func testDecodesWorkspaceWithLocale() throws {
    let ws = try decode(
      "{ \"id\": \"ws-1\", \"name\": \"Personal\", \"isDefault\": true, \"createdAt\": \"2026-01-01T00:00:00Z\", \"locale\": \"pt\" }",
      as: Workspace.self)
    XCTAssertEqual(ws.id, "ws-1")
    XCTAssertTrue(ws.isDefault)
    XCTAssertEqual(ws.locale, "pt")
  }

  func testDecodesWorkspaceWithNullLocale() throws {
    let ws = try decode(
      "{ \"id\": \"ws-1\", \"name\": \"Personal\", \"isDefault\": false, \"createdAt\": \"2026-01-01T00:00:00Z\", \"locale\": null }",
      as: Workspace.self)
    XCTAssertNil(ws.locale)  // cleared override
  }

  func testDecodesWorkspaceWithAbsentLocale() throws {
    let ws = try decode(
      "{ \"id\": \"ws-1\", \"name\": \"Personal\", \"isDefault\": false, \"createdAt\": \"2026-01-01T00:00:00Z\" }",
      as: Workspace.self)
    XCTAssertNil(ws.locale)
    XCTAssertNil(ws.provider)
    XCTAssertNil(ws.model)
  }

  // MARK: Payloads — null CLEARS (explicit null, not omitted)

  func testSetPreferenceEncodesValue() throws {
    let j = try encoded(SetPreferencePayload(key: "locale", value: "es"))
    XCTAssertEqual(j["key"], .string("locale"))
    XCTAssertEqual(j["value"], .string("es"))
  }

  func testSetPreferenceEncodesExplicitNullToClear() throws {
    let j = try encoded(SetPreferencePayload(key: "locale", value: nil))
    XCTAssertEqual(j["value"], JSONValue.null)  // explicit null, key present
  }

  func testSetLocaleEncodesValue() throws {
    let j = try encoded(SetLocalePayload(workspaceId: "ws-1", locale: "pt"))
    XCTAssertEqual(j["workspaceId"], .string("ws-1"))
    XCTAssertEqual(j["locale"], .string("pt"))
  }

  func testSetLocaleEncodesExplicitNullToClear() throws {
    let j = try encoded(SetLocalePayload(workspaceId: "ws-1", locale: nil))
    XCTAssertEqual(j["locale"], JSONValue.null)
  }

  func testGetPreferencePayload() throws {
    let j = try encoded(GetPreferencePayload(key: "timezone"))
    XCTAssertEqual(j["key"], .string("timezone"))
  }
}
