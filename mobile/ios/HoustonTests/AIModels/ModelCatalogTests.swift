import XCTest

@testable import Houston

/// Model display-metadata + effort resolution, ported from `providers.ts`. Covers
/// the two-namespace lookups (openai-codex→openai, gemini→google), the OpenCode
/// gateways staying DISTINCT, and `validEffort` clamping (mirrors
/// `validEffortOrDefault`).
final class ModelCatalogTests: XCTestCase {
  func testWireNamespaceCollapsesForModelLookup() {
    // The wire id `openai-codex` reads OpenAI's model catalog.
    XCTAssertEqual(ModelCatalog.model(wireId: "openai-codex", modelId: "gpt-5.5")?.label, "GPT-5.5")
    // `gemini` reads Google's catalog.
    XCTAssertEqual(
      ModelCatalog.model(wireId: "gemini", modelId: "gemini-3-pro-preview")?.label, "Gemini 3 Pro")
  }

  func testOpenCodeGatewaysKeepDistinctModelLists() {
    // opencode-go has GLM-5.1; opencode (Zen) does not — they must NOT collapse.
    XCTAssertNotNil(ModelCatalog.model(wireId: "opencode-go", modelId: "glm-5.1"))
    XCTAssertNil(ModelCatalog.model(wireId: "opencode", modelId: "glm-5.1"))
  }

  func testUnknownModelHasNoMetadata() {
    XCTAssertNil(ModelCatalog.model(wireId: "anthropic", modelId: "no-such-model"))
    XCTAssertEqual(ModelCatalog.effortLevels(wireId: "anthropic", modelId: "no-such-model"), [])
  }

  func testValidEffortHonorsRequestedWhenSupported() {
    XCTAssertEqual(
      ModelCatalog.validEffort(wireId: "openai-codex", modelId: "gpt-5.5", effort: .xhigh), .xhigh)
  }

  func testValidEffortClampsUnsupportedToDefault() {
    // Codex has no `max`; an unsupported request clamps to the shared default.
    XCTAssertEqual(
      ModelCatalog.validEffort(wireId: "openai-codex", modelId: "gpt-5.5", effort: .max), .medium)
  }

  func testValidEffortFallsToFirstWhenNoMedium() {
    // DeepSeek V4 Pro = [high, xhigh]; no `medium`, so the default falls to `high`.
    XCTAssertEqual(
      ModelCatalog.validEffort(wireId: "deepseek", modelId: "deepseek-v4-pro", effort: nil), .high)
  }

  func testValidEffortNilWhenModelHasNoEffortControl() {
    // GPT-4.1 (Copilot base) has no effort levels → nil (picker omits the row).
    XCTAssertNil(ModelCatalog.validEffort(wireId: "github-copilot", modelId: "gpt-4.1", effort: .high))
  }
}
