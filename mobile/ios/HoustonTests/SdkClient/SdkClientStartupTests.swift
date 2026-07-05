import XCTest

@testable import Houston

/// The `configure` → `ready` handshake and its version gate.
@MainActor
final class SdkClientStartupTests: XCTestCase {
  func testStartConfiguresAndCompletesOnReady() async throws {
    let transport = MockTransport()
    let client = SdkClient(transport: transport)
    transport.onDeliver = { raw in
      if BridgeTestJSON.kind(of: raw) == "configure" {
        transport.send(BridgeTestJSON.encode(.ready(v: 1)))
      }
    }
    try await client.start(baseUrl: "http://127.0.0.1:4317")
    XCTAssertTrue(transport.booted)
    XCTAssertEqual(BridgeTestJSON.kind(of: transport.delivered.first ?? ""), "configure")
  }

  func testStartRejectsNewerBridgeMajor() async {
    let transport = MockTransport()
    let client = SdkClient(transport: transport)
    transport.onDeliver = { raw in
      if BridgeTestJSON.kind(of: raw) == "configure" {
        transport.send(BridgeTestJSON.encode(.ready(v: 2)))
      }
    }
    do {
      try await client.start(baseUrl: "x")
      XCTFail("expected updateRequired")
    } catch let error as SdkClientError {
      XCTAssertEqual(error, .updateRequired(2))
    } catch {
      XCTFail("expected SdkClientError, got \(error)")
    }
  }

  func testStartWithoutTransportThrows() async {
    let client = SdkClient()
    do {
      try await client.start(baseUrl: "x")
      XCTFail("expected noTransport")
    } catch let error as SdkClientError {
      XCTAssertEqual(error, .noTransport)
    } catch {
      XCTFail("expected SdkClientError, got \(error)")
    }
  }

  func testBootFailurePropagates() async {
    struct BootBoom: Error {}
    let transport = MockTransport()
    transport.bootError = BootBoom()
    let client = SdkClient(transport: transport)
    do {
      try await client.start(baseUrl: "x")
      XCTFail("expected boot failure")
    } catch is BootBoom {
      // expected
    } catch {
      XCTFail("expected BootBoom, got \(error)")
    }
  }
}
