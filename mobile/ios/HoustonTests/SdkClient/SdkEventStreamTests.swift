import XCTest

@testable import Houston

/// Event fan-out + the load-bearing `fatal` vs `event` distinction.
@MainActor
final class SdkEventStreamTests: XCTestCase {
  func testFatalTokenExpiredMapsToDistinctReason() async {
    let client = SdkClient(transport: MockTransport())
    var iterator = client.events.makeAsyncIterator()
    client.receiveOutbound(
      BridgeTestJSON.encode(.fatal(reason: "tokenExpired", message: "re-attach to continue")))
    let event = await iterator.next()
    guard case let .fatal(reason, message)? = event else {
      return XCTFail("expected fatal, got \(String(describing: event))")
    }
    XCTAssertEqual(reason, "tokenExpired")
    XCTAssertEqual(message, "re-attach to continue")
    XCTAssertEqual(event?.isFatalTokenExpired, true)
  }

  func testUnknownFatalReasonPreserved() async {
    let client = SdkClient(transport: MockTransport())
    var iterator = client.events.makeAsyncIterator()
    client.receiveOutbound(BridgeTestJSON.encode(.fatal(reason: "meltdown", message: "boom")))
    guard case let .fatal(reason, _)? = await iterator.next() else {
      return XCTFail("expected fatal")
    }
    XCTAssertEqual(reason, "meltdown")
  }

  func testEventForwardedVerbatim() async {
    let client = SdkClient(transport: MockTransport())
    var iterator = client.events.makeAsyncIterator()
    let payload = SdkEventPayload(
      type: "approval/needed", scope: "conversation/cv_42", data: .object(["approvalId": .string("ap_5")]))
    client.receiveOutbound(BridgeTestJSON.encode(.event(payload)))
    guard case let .event(type, scope, data)? = await iterator.next() else {
      return XCTFail("expected event")
    }
    XCTAssertEqual(type, "approval/needed")
    XCTAssertEqual(scope, "conversation/cv_42")
    XCTAssertEqual(data?["approvalId"], .string("ap_5"))
  }

  func testProtocolErrorSurfaced() async {
    let client = SdkClient(transport: MockTransport())
    var iterator = client.events.makeAsyncIterator()
    client.receiveOutbound(BridgeTestJSON.encode(.error(message: "subscribe missing sub", detail: nil)))
    guard case let .protocolError(message, _)? = await iterator.next() else {
      return XCTFail("expected protocolError")
    }
    XCTAssertEqual(message, "subscribe missing sub")
  }
}
