import XCTest

@testable import Houston

/// Correlation bookkeeping: each command resolves against its own `id`, failures
/// surface as ``CommandError``, and a missing reply times out loudly.
@MainActor
final class SdkClientCommandTests: XCTestCase {
  /// Auto-respond to every delivered command with `ok:true` and the given value.
  private func respondingClient(value: @escaping (CommandEnvelope) -> JSONValue?)
    -> (SdkClient, MockTransport)
  {
    let transport = MockTransport()
    let client = SdkClient(transport: transport)
    transport.onDeliver = { raw in
      guard let envelope = BridgeTestJSON.envelope(from: raw) else { return }
      let result = CommandResult(id: envelope.id, ok: true, value: value(envelope), error: nil)
      client.receiveOutbound(BridgeTestJSON.encode(.result(result)))
    }
    return (client, transport)
  }

  func testCommandSuccessDecodesValue() async throws {
    let (client, transport) = respondingClient { _ in
      .object(["loaded": .bool(true), "items": .array([])])
    }
    let vm: AgentsViewModel = try await client.command("agents/refresh", SdkNoPayload())
    XCTAssertTrue(vm.loaded)
    XCTAssertEqual(vm.items.count, 0)
    XCTAssertEqual(BridgeTestJSON.envelope(from: transport.delivered.first ?? "")?.type, "agents/refresh")
  }

  func testNoPayloadVoidCommand() async throws {
    let (client, _) = respondingClient { _ in nil }
    // Must not throw even though `result.value` is absent.
    let _: SdkVoid = try await client.command("session/setToken")
  }

  func testCommandFailureThrowsCommandError() async {
    let transport = MockTransport()
    let client = SdkClient(transport: transport)
    transport.onDeliver = { raw in
      let id = BridgeTestJSON.envelope(from: raw)!.id
      let result = CommandResult(
        id: id, ok: false, value: nil,
        error: CommandErrorPayload(message: "unauthorized", status: 401))
      client.receiveOutbound(BridgeTestJSON.encode(.result(result)))
    }
    do {
      let _: SdkVoid = try await client.command("agents/refresh")
      XCTFail("expected failure")
    } catch let error as CommandError {
      XCTAssertEqual(error.status, 401)
      XCTAssertEqual(error.message, "unauthorized")
      XCTAssertFalse(error.isTimeout)
    } catch {
      XCTFail("expected CommandError, got \(error)")
    }
  }

  func testCommandTimesOut() async {
    let transport = MockTransport()
    let client = SdkClient(transport: transport, commandTimeout: .milliseconds(30))
    // No responder → the reply never comes.
    do {
      let _: SdkVoid = try await client.command("agents/refresh")
      XCTFail("expected timeout")
    } catch let error as CommandError {
      XCTAssertTrue(error.isTimeout)
    } catch {
      XCTFail("expected CommandError, got \(error)")
    }
  }

  func testConcurrentCommandsCorrelateIndependently() async throws {
    // Echo each command's `type` back as its value → proves id↔reply matching.
    let (client, _) = respondingClient { .string($0.type) }
    async let a: String = client.command("cmd/a")
    async let b: String = client.command("cmd/b")
    let (ra, rb) = try await (a, b)
    XCTAssertEqual(ra, "cmd/a")
    XCTAssertEqual(rb, "cmd/b")
  }

  func testStaleResultForUnknownIdIsIgnored() {
    let transport = MockTransport()
    let client = SdkClient(transport: transport)
    // A result for a command that was never issued must be a no-op, not a crash.
    let result = CommandResult(id: "never", ok: true, value: .string("x"), error: nil)
    client.receiveOutbound(BridgeTestJSON.encode(.result(result)))
  }
}
