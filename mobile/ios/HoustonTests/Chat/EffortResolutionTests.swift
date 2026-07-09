import XCTest

@testable import Houston

/// ``EffortResolution`` picks the (provider, model) new turns run under — the
/// per-conversation model pin when set, else the active provider's active model —
/// and asks ``ModelCatalog`` which reasoning levels that model accepts. The
/// provider match mirrors the SDK's `me()` fallback (`activeModel === model ||
/// models.includes(model)`). The effort ladders it reads are the table ported
/// from `getEffortLevels` (`app/src/lib/providers.ts`) into
/// `AIModelsModelData.swift`; a parity block below pins a spread of them so a
/// drift in either the resolution or the table is caught here.
final class EffortResolutionTests: XCTestCase {
  private func provider(
    id: String, active: Bool = false, activeModel: String = "", models: [String] = []
  ) -> ProviderVM {
    ProviderVM(
      id: id, name: id, configured: true, isActive: active, activeModel: activeModel,
      models: models, login: nil, enterpriseUrl: nil)
  }

  // MARK: effectiveModel

  func testPinnedModelResolvesOwningProviderFromModelList() {
    let providers = [
      provider(id: "openai", active: true, activeModel: "gpt-5.5", models: ["gpt-5.5"]),
      provider(id: "anthropic", models: ["claude-opus-4-8", "claude-sonnet-5"]),
    ]
    let effective = EffortResolution.effectiveModel(
      selectedModel: "claude-opus-4-8", providers: providers)
    XCTAssertEqual(effective?.wireId, "anthropic")
    XCTAssertEqual(effective?.modelId, "claude-opus-4-8")
  }

  func testPinnedModelMatchesViaActiveModel() {
    let providers = [provider(id: "anthropic", activeModel: "claude-opus-4-8")]
    let effective = EffortResolution.effectiveModel(
      selectedModel: "claude-opus-4-8", providers: providers)
    XCTAssertEqual(effective?.wireId, "anthropic")
  }

  func testPinnedModelNotFoundFallsBackToActiveProvider() {
    let providers = [
      provider(id: "openai", active: true, activeModel: "gpt-5.5", models: ["gpt-5.5"])
    ]
    let effective = EffortResolution.effectiveModel(
      selectedModel: "some-unknown-model", providers: providers)
    XCTAssertEqual(effective?.wireId, "openai", "owner falls back to the active provider")
    XCTAssertEqual(effective?.modelId, "some-unknown-model", "the pin is still what runs")
  }

  func testPinnedModelWithNoActiveAndNoMatchIsNil() {
    let providers = [provider(id: "anthropic", models: ["claude-opus-4-8"])]
    XCTAssertNil(
      EffortResolution.effectiveModel(selectedModel: "gpt-5.5", providers: providers),
      "nothing resolvable → nil so the sheet shows its empty state")
  }

  func testNoPinUsesActiveProvidersActiveModel() {
    let providers = [
      provider(id: "anthropic", models: ["claude-opus-4-8"]),
      provider(id: "openai", active: true, activeModel: "gpt-5.5", models: ["gpt-5.5"]),
    ]
    let effective = EffortResolution.effectiveModel(selectedModel: nil, providers: providers)
    XCTAssertEqual(effective?.wireId, "openai")
    XCTAssertEqual(effective?.modelId, "gpt-5.5")
  }

  func testNoPinAndNoActiveProviderIsNil() {
    XCTAssertNil(
      EffortResolution.effectiveModel(
        selectedModel: nil, providers: [provider(id: "openai", models: ["gpt-5.5"])]))
  }

  func testNoPinActiveProviderWithEmptyActiveModelIsNil() {
    XCTAssertNil(
      EffortResolution.effectiveModel(
        selectedModel: nil, providers: [provider(id: "openai", active: true, activeModel: "")]),
      "a connected-but-unresolved provider offers no effort model yet")
  }

  func testEmptyProvidersIsNil() {
    XCTAssertNil(EffortResolution.effectiveModel(selectedModel: "gpt-5.5", providers: []))
    XCTAssertNil(EffortResolution.effectiveModel(selectedModel: nil, providers: []))
  }

  // MARK: levels

  func testLevelsForPinnedCataloguedModel() {
    let providers = [provider(id: "anthropic", models: ["claude-opus-4-8"])]
    XCTAssertEqual(
      EffortResolution.levels(selectedModel: "claude-opus-4-8", providers: providers),
      [.low, .medium, .high, .xhigh, .max])
  }

  func testLevelsEmptyForUncataloguedModel() {
    let providers = [provider(id: "anthropic", active: true, activeModel: "totally-made-up")]
    XCTAssertTrue(
      EffortResolution.levels(selectedModel: nil, providers: providers).isEmpty,
      "an uncatalogued model has no effort control → hide the level list")
  }

  func testLevelsEmptyWhenNothingResolvable() {
    XCTAssertTrue(EffortResolution.levels(selectedModel: nil, providers: []).isEmpty)
  }

  // MARK: ModelCatalog effort-table parity (ported from providers.ts getEffortLevels)

  /// Pins a spread across the ported table (`AIModelsModelData.swift`, itself
  /// ported from `app/src/lib/providers.ts`) so a drift in the effort ladders
  /// EffortResolution reads is caught. Includes the two-namespace normalization
  /// (`gemini`→`google`) and a no-effort model (empty ladder).
  func testEffortTableParity() {
    XCTAssertEqual(
      ModelCatalog.effortLevels(wireId: "anthropic", modelId: "claude-opus-4-8"),
      [.low, .medium, .high, .xhigh, .max])
    XCTAssertEqual(
      ModelCatalog.effortLevels(wireId: "openai", modelId: "gpt-5.5"),
      [.low, .medium, .high, .xhigh])
    XCTAssertEqual(
      ModelCatalog.effortLevels(wireId: "gemini", modelId: "gemini-3-pro-preview"),
      [.low, .high], "the `gemini` wire id normalizes to the `google` catalog")
    XCTAssertEqual(
      ModelCatalog.effortLevels(wireId: "github-copilot", modelId: "gpt-4.1"), [],
      "a no-effort model returns an empty ladder")
  }

  /// `validEffort` clamps to the model's ladder and falls back to the shared
  /// default (`validEffortOrDefault`, providers.ts).
  func testValidEffortClampsToLadder() {
    // `.max` is not offered by gpt-5.5 → clamps to the default (`medium`).
    XCTAssertEqual(
      ModelCatalog.validEffort(wireId: "openai", modelId: "gpt-5.5", effort: .max), .medium)
    // An offered level passes through.
    XCTAssertEqual(
      ModelCatalog.validEffort(wireId: "openai", modelId: "gpt-5.5", effort: .high), .high)
    // No effort control → nil so callers omit the flag.
    XCTAssertNil(
      ModelCatalog.validEffort(wireId: "github-copilot", modelId: "gpt-4.1", effort: .high))
  }
}
