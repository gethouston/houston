import XCTest

@testable import Houston

final class ModelPickerLogicTests: XCTestCase {
  private func provider(
    id: String, configured: Bool, isActive: Bool = false, activeModel: String = "",
    models: [String] = []
  ) -> ProviderVM {
    ProviderVM(
      id: id, name: id, configured: configured, isActive: isActive, activeModel: activeModel,
      models: models)
  }

  // MARK: currentModel

  func testCurrentModelPrefersThePerConversationPin() {
    let providers = [provider(id: "anthropic", configured: true, isActive: true, activeModel: "haiku")]
    XCTAssertEqual(
      ModelPickerLogic.currentModel(selectedModel: "opus", providers: providers), "opus")
  }

  func testCurrentModelFallsBackToTheActiveProvidersModel() {
    let providers = [
      provider(id: "anthropic", configured: true, isActive: false, activeModel: "haiku"),
      provider(id: "openai", configured: true, isActive: true, activeModel: "gpt-5"),
    ]
    XCTAssertEqual(
      ModelPickerLogic.currentModel(selectedModel: nil, providers: providers), "gpt-5",
      "no pin: the ACTIVE provider's model, not the first in the list")
  }

  func testCurrentModelIsNilWithNoPinAndNoActiveProvider() {
    let providers = [provider(id: "anthropic", configured: true, isActive: false, activeModel: "haiku")]
    XCTAssertNil(ModelPickerLogic.currentModel(selectedModel: nil, providers: providers))
  }

  func testCurrentModelTreatsEmptyPinAsUnset() {
    let providers = [provider(id: "anthropic", configured: true, isActive: true, activeModel: "haiku")]
    XCTAssertEqual(
      ModelPickerLogic.currentModel(selectedModel: "", providers: providers), "haiku",
      "an empty string pin is treated as no pin, not a literal empty model id")
  }

  // MARK: configuredProviders

  func testConfiguredProvidersFiltersOutUnconnectedOnes() {
    let providers = [
      provider(id: "anthropic", configured: true),
      provider(id: "openai", configured: false),
      provider(id: "openrouter", configured: true),
    ]
    XCTAssertEqual(
      ModelPickerLogic.configuredProviders(providers).map(\.id), ["anthropic", "openrouter"])
  }

  func testConfiguredProvidersPreservesWireOrder() {
    let providers = [
      provider(id: "openrouter", configured: true),
      provider(id: "anthropic", configured: true),
    ]
    XCTAssertEqual(
      ModelPickerLogic.configuredProviders(providers).map(\.id), ["openrouter", "anthropic"])
  }

  func testConfiguredProvidersEmptyInputIsEmptyOutput() {
    XCTAssertTrue(ModelPickerLogic.configuredProviders([]).isEmpty)
  }
}
