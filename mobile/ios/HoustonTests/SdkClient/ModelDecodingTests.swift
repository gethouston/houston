import XCTest

@testable import Houston

/// Tolerant decoding of the SDK view-models: unknown fields ignored, unknown
/// enum-ish strings preserved, and the `FeedItem` projection's `unknown` fallback.
final class ModelDecodingTests: XCTestCase {
  func testAgentIgnoresUnknownFields() throws {
    // A future additive field must not break the decode (BRIDGE.md §4).
    // Two-pound delimiter: the JSON contains `"#` (the hex colour), which would
    // otherwise close a single-pound raw-string delimiter early.
    let json = ##"{"id":"ag_1","name":"Bookkeeper","workspaceId":"ws_1","createdAt":1751000000000,"color":"#7C3AED"}"##
    let agent = try BridgeTestJSON.decode(AgentListItem.self, json)
    XCTAssertEqual(agent.id, "ag_1")
    XCTAssertEqual(agent.createdAt, 1_751_000_000_000)
  }

  func testActivityStatusPreservesUnknown() throws {
    let known = try BridgeTestJSON.decode(ActivityStatus.self, #""needs_you""#)
    XCTAssertEqual(known, .needsYou)
    let unknown = try BridgeTestJSON.decode(ActivityStatus.self, #""cancelled""#)
    XCTAssertEqual(unknown, .unknown("cancelled"))
  }

  func testConversationVMDecodesAndReadsBoardStatusPair() throws {
    // A user Stop: sessionStatus error but boardStatus needs_you (PARITY §1).
    let json = """
      {"feed":[{"id":"f0","feed_type":"assistant_text","data":"hi"}],
       "running":false,"sessionStatus":"error","boardStatus":"needs_you"}
      """
    let vm = try BridgeTestJSON.decode(ConversationVM.self, json)
    XCTAssertEqual(vm.sessionStatus, .error)
    XCTAssertEqual(vm.boardStatus, .needsYou)
    XCTAssertFalse(vm.running)
  }

  func testFeedItemProjectionKnownTypes() throws {
    let json = """
      {"feed":[
        {"id":"f0","feed_type":"assistant_text_streaming","data":"Draft"},
        {"id":"f1","feed_type":"tool_call","data":{"name":"send_email","input":{"to":"a@b.com"}}},
        {"id":"f2","feed_type":"provider_error","data":{"kind":"rate_limited","provider":"anthropic","model":null,"retry_after_seconds":30,"message":"slow down"}},
        {"id":"f3","feed_type":"final_result","data":{"result":"done","cost_usd":0.01,"duration_ms":1200,"usage":{"context_tokens":8000,"output_tokens":200,"cached_tokens":4096}}}
      ],"running":true,"sessionStatus":"running","boardStatus":"running"}
      """
    let vm = try BridgeTestJSON.decode(ConversationVM.self, json)
    let items = vm.feed.map(\.item)

    guard case let .assistantText(text, streaming) = items[0] else { return XCTFail() }
    XCTAssertEqual(text, "Draft")
    XCTAssertTrue(streaming)

    guard case let .toolCall(call) = items[1] else { return XCTFail() }
    XCTAssertEqual(call.name, "send_email")

    guard case let .providerError(.rateLimited(provider, _, retry, _)) = items[2] else { return XCTFail() }
    XCTAssertEqual(provider, "anthropic")
    XCTAssertEqual(retry, 30)

    guard case let .finalResult(result) = items[3] else { return XCTFail() }
    XCTAssertEqual(result.usage?.contextTokens, 8000)
  }

  func testFeedItemUnknownTypeFallsBack() throws {
    let vm = try BridgeTestJSON.decode(
      ConversationVM.self,
      #"{"feed":[{"id":"f0","feed_type":"future_widget","data":{"x":1}}],"running":false,"sessionStatus":"idle"}"#)
    guard case let .unknown(type, data) = vm.feed[0].item else { return XCTFail() }
    XCTAssertEqual(type, "future_widget")
    XCTAssertEqual(data["x"], .int(1))
  }

  func testProviderErrorUnrecognizedKindPreserved() throws {
    let error = try BridgeTestJSON.decode(
      ProviderError.self, #"{"kind":"solar_flare","provider":"anthropic","extra":true}"#)
    guard case let .unrecognized(kind, _) = error else { return XCTFail() }
    XCTAssertEqual(kind, "solar_flare")
  }
}
