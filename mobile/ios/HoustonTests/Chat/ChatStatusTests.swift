import XCTest

@testable import Houston

/// Pins the status reclassification to desktop `deriveStatus`
/// (`ui/chat/src/chat-status.ts`): only `assistant_text_streaming` is
/// `.streaming`; `thinking_streaming` and tool phases keep the loading state
/// (`.submitted`) visible (HOU-655).
final class ChatStatusTests: XCTestCase {
  private func feed(_ types: [String]) -> [FeedItemVM] {
    types.enumerated().map { index, type in
      vm("f\(index)", type)
    }
  }

  private func vm(_ id: String, _ type: String) -> FeedItemVM {
    let object = JSONValue.object([
      "id": .string(id), "feed_type": .string(type), "data": .string(""),
    ])
    guard let item = try? object.decode(FeedItemVM.self) else {
      fatalError("FeedItemVM fixture failed to decode")
    }
    return item
  }

  func testAssistantTextStreamingIsStreaming() {
    let status = ChatStatus.derive(
      feed: feed(["user_message", "thinking", "assistant_text_streaming"]), running: true)
    XCTAssertEqual(status, .streaming, "visible streaming text is the progress signal")
  }

  func testThinkingStreamingStaysSubmitted() {
    // The reclassification's whole point: reasoning keeps the loading indicator.
    let status = ChatStatus.derive(
      feed: feed(["user_message", "thinking_streaming"]), running: true)
    XCTAssertEqual(status, .submitted)
  }

  func testToolCycleStaysSubmitted() {
    let status = ChatStatus.derive(feed: feed(["tool_call", "tool_result"]), running: true)
    XCTAssertEqual(status, .submitted, "silent tool/gap stretches keep the indicator")
  }

  func testRunningWithEmptyFeedIsSubmitted() {
    XCTAssertEqual(ChatStatus.derive(feed: [], running: true), .submitted)
  }

  func testJustSentUserMessageIsSubmittedEvenBeforeRunning() {
    XCTAssertEqual(ChatStatus.derive(feed: feed(["user_message"]), running: false), .submitted)
  }

  func testSettledIsReady() {
    let status = ChatStatus.derive(
      feed: feed(["user_message", "assistant_text", "final_result"]), running: false)
    XCTAssertEqual(status, .ready)
  }
}
