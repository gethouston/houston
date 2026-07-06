import XCTest

@testable import Houston

/// Pins the `providers/<agentId>` VM decode + command-payload shapes against the
/// wire the SDK publishes (`packages/sdk/tests/providers.contract.test.ts`):
/// the list+status merge, the `LoginInfo` kinds, tolerant enums, and the
/// null-vs-absent `login`/`enterpriseUrl` semantics.
final class ProvidersVMTests: XCTestCase {
  private func decode<T: Decodable>(_ json: String, as type: T.Type = T.self) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(json.utf8))
  }

  private func encoded<T: Encodable>(_ value: T) throws -> JSONValue {
    try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
  }

  // MARK: VM merge (mirrors the contract-test seed exactly)

  func testDecodesMergedSnapshot() throws {
    let json = """
      { "loaded": true, "activeProvider": "anthropic", "providers": [
        { "id": "anthropic", "name": "Anthropic (Claude)", "configured": true,
          "isActive": true, "activeModel": "claude-sonnet-4-6",
          "models": ["claude-sonnet-4-6", "claude-opus-4-8"], "login": null },
        { "id": "openai-codex", "name": "OpenAI (Codex)", "configured": false,
          "isActive": false, "activeModel": "",
          "models": ["gpt-5-codex", "o4-mini"], "login": null },
        { "id": "github-copilot", "name": "GitHub Copilot", "configured": false,
          "isActive": false, "activeModel": "", "models": [],
          "login": null, "enterpriseUrl": null } ] }
      """
    let vm = try decode(json, as: ProvidersViewModel.self)
    XCTAssertTrue(vm.loaded)
    XCTAssertEqual(vm.activeProvider, "anthropic")

    let anthropic = try XCTUnwrap(vm.providers.first { $0.id == "anthropic" })
    XCTAssertEqual(
      anthropic,
      ProviderVM(
        id: "anthropic", name: "Anthropic (Claude)", configured: true, isActive: true,
        activeModel: "claude-sonnet-4-6",
        models: ["claude-sonnet-4-6", "claude-opus-4-8"], login: nil, enterpriseUrl: nil))

    let codex = try XCTUnwrap(vm.providers.first { $0.id == "openai-codex" })
    XCTAssertFalse(codex.configured)
    XCTAssertNil(codex.login)  // JSON null → idle

    let copilot = try XCTUnwrap(vm.providers.first { $0.id == "github-copilot" })
    XCTAssertNil(copilot.enterpriseUrl)  // null discriminator → individual copilot
  }

  func testActiveProviderAbsentWhenNoneSelected() throws {
    let vm = try decode("{ \"loaded\": true, \"providers\": [] }", as: ProvidersViewModel.self)
    XCTAssertNil(vm.activeProvider)
  }

  func testUnknownProviderIdPreservedRaw() throws {
    let p = try decode(
      "{ \"id\": \"brand-new-provider\", \"name\": \"X\", \"configured\": false, \"isActive\": false, \"activeModel\": \"\", \"models\": [] }",
      as: ProviderVM.self)
    XCTAssertEqual(p.id, "brand-new-provider")
    XCTAssertNil(p.login)  // absent key → nil (like null)
    XCTAssertNil(p.enterpriseUrl)
  }

  func testEnterpriseUrlCarriesDomain() throws {
    let p = try decode(
      "{ \"id\": \"github-copilot\", \"name\": \"X\", \"configured\": true, \"isActive\": false, \"activeModel\": \"\", \"models\": [], \"enterpriseUrl\": \"acme.ghe.com\" }",
      as: ProviderVM.self)
    XCTAssertEqual(p.enterpriseUrl, "acme.ghe.com")
  }

  // MARK: LoginInfo — all three kinds + tolerance

  func testLoginInfoUrlKind() throws {
    let info = try decode("{ \"kind\": \"url\", \"url\": \"http://127.0.0.1/cb\" }", as: LoginInfo.self)
    XCTAssertEqual(info, .url(url: "http://127.0.0.1/cb"))
  }

  func testLoginInfoAuthCodeKind() throws {
    let withHint = try decode(
      "{ \"kind\": \"auth_code\", \"url\": \"https://claude.ai/a\", \"instructions\": \"paste it\" }",
      as: LoginInfo.self)
    XCTAssertEqual(withHint, .authCode(url: "https://claude.ai/a", instructions: "paste it"))

    let noHint = try decode("{ \"kind\": \"auth_code\", \"url\": \"https://claude.ai/a\" }", as: LoginInfo.self)
    XCTAssertEqual(noHint, .authCode(url: "https://claude.ai/a", instructions: nil))
  }

  func testLoginInfoDeviceCodeKind() throws {
    let info = try decode(
      "{ \"kind\": \"device_code\", \"verificationUri\": \"https://gh/dev\", \"userCode\": \"WXYZ-1234\" }",
      as: LoginInfo.self)
    XCTAssertEqual(info, .deviceCode(verificationUri: "https://gh/dev", userCode: "WXYZ-1234"))
  }

  func testLoginInfoUnknownKindPreserved() throws {
    let info = try decode("{ \"kind\": \"future_kind\", \"foo\": 1 }", as: LoginInfo.self)
    guard case let .unrecognized(kind, _) = info else { return XCTFail("expected unrecognized") }
    XCTAssertEqual(kind, "future_kind")
  }

  func testLoginStateAwaitingUserCarriesInfo() throws {
    let state = try decode(
      "{ \"status\": \"awaiting_user\", \"info\": { \"kind\": \"device_code\", \"verificationUri\": \"https://x\", \"userCode\": \"ABCD\" } }",
      as: LoginState.self)
    XCTAssertEqual(state.status, .awaitingUser)
    XCTAssertEqual(state.info, .deviceCode(verificationUri: "https://x", userCode: "ABCD"))
    XCTAssertNil(state.error)
  }

  func testLoginStatusUnknownPreserved() throws {
    let state = try decode("{ \"status\": \"weird\" }", as: LoginState.self)
    XCTAssertEqual(state.status, .unknown("weird"))
  }

  // MARK: Command payloads

  func testLoginPayloadOmitsNilOptionals() throws {
    let bare = try encoded(ProviderLoginPayload(agentId: "a1", provider: "anthropic"))
    XCTAssertEqual(bare["agentId"], .string("a1"))
    XCTAssertEqual(bare["provider"], .string("anthropic"))
    XCTAssertNil(bare["deviceAuth"])
    XCTAssertNil(bare["enterpriseDomain"])

    let full = try encoded(
      ProviderLoginPayload(
        agentId: "a1", provider: "github-copilot", deviceAuth: true,
        enterpriseDomain: "acme.ghe.com"))
    XCTAssertEqual(full["deviceAuth"], .bool(true))
    XCTAssertEqual(full["enterpriseDomain"], .string("acme.ghe.com"))
  }

  func testSetModelPayloadOmitsNilOptionals() throws {
    let j = try encoded(SetModelPayload(agentId: "a1", model: "claude-opus-4-8"))
    XCTAssertEqual(j["agentId"], .string("a1"))
    XCTAssertEqual(j["model"], .string("claude-opus-4-8"))
    XCTAssertNil(j["effort"])
    XCTAssertNil(j["provider"])
  }
}
