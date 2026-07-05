import XCTest

@testable import Houston

/// The presentation fold — the mission-chat feed catalog (PARITY §5). Mirrors the
/// desktop `feed-to-messages.ts` rules: drop `cancelled`/unknown, collapse
/// duplicate provider errors, suppress echoed "Session error:" lines, pair tool
/// results to their calls, and author-label only in multiplayer.
final class MissionFeedFoldTests: XCTestCase {
  private func vm(_ id: String, _ type: String, _ data: JSONValue) -> FeedItemVM {
    FeedItemVM(id: id, feedType: type, data: data)
  }

  // MARK: cancelled + unknown never render

  func testCancelledProviderErrorIsDropped() {
    let feed = [
      vm("f0", "assistant_text", .string("hi")),
      vm("f1", "provider_error", .object(["kind": .string("cancelled"), "provider": .string("claude")])),
    ]
    let rows = MissionFeedFold.rows(from: feed)
    XCTAssertEqual(rows.count, 1)
    XCTAssertFalse(rows.contains { if case .providerError = $0.kind { return true }; return false })
  }

  func testUnknownFeedTypeIsInert() {
    let rows = MissionFeedFold.rows(from: [vm("f0", "totally_new_type", .object([:]))])
    XCTAssertTrue(rows.isEmpty)
  }

  // MARK: duplicate provider errors collapse

  func testDuplicateProviderErrorsCollapseToOne() {
    let err = JSONValue.object([
      "kind": .string("rate_limited"), "provider": .string("claude"),
      "retry_after_seconds": .int(5), "message": .string("slow down"),
    ])
    let rows = MissionFeedFold.rows(from: [vm("f0", "provider_error", err), vm("f1", "provider_error", err)])
    let cards = rows.filter { if case .providerError = $0.kind { return true }; return false }
    XCTAssertEqual(cards.count, 1)
  }

  // MARK: "Session error:" suppression

  func testSessionErrorLineSuppressedWhenErrorCardPresent() {
    let feed = [
      vm("f0", "provider_error", .object([
        "kind": .string("network_unreachable"), "provider": .string("claude"),
        "message": .string("no net"),
      ])),
      vm("f1", "system_message", .string("Session error: connection lost")),
    ]
    let rows = MissionFeedFold.rows(from: feed)
    XCTAssertFalse(rows.contains { if case .system = $0.kind { return true }; return false })
  }

  func testPlainSystemLineKeptWithoutErrorCard() {
    let rows = MissionFeedFold.rows(from: [vm("f0", "system_message", .string("Heads up"))])
    XCTAssertEqual(rows.count, 1)
    guard case .system("Heads up") = rows.first?.kind else { return XCTFail("expected system line") }
  }

  // MARK: tool result attaches to its call

  func testToolResultAttachesToPrecedingCall() {
    let feed = [
      vm("f0", "tool_call", .object(["name": .string("bash"), "input": .string("ls")])),
      vm("f1", "tool_result", .object(["content": .string("ok"), "is_error": .bool(false)])),
    ]
    let rows = MissionFeedFold.rows(from: feed)
    XCTAssertEqual(rows.count, 1)
    guard case let .tool(call, result) = rows.first?.kind else { return XCTFail("expected tool row") }
    XCTAssertEqual(call.name, "bash")
    XCTAssertEqual(result?.content, "ok")
    XCTAssertEqual(rows.first?.id, "f0", "the chip keeps the call's stable id")
  }

  // MARK: streaming bubble keeps a stable id

  func testStreamingAssistantKeepsStableId() {
    // The SDK folds streaming into ONE entry (same id); the fold preserves it.
    let rows = MissionFeedFold.rows(from: [vm("f7", "assistant_text_streaming", .string("Draft"))])
    XCTAssertEqual(rows.first?.id, "f7")
    guard case .assistant(_, streaming: true) = rows.first?.kind else { return XCTFail("expected streaming") }
  }

  func testEmptyAssistantTextDropped() {
    let rows = MissionFeedFold.rows(from: [vm("f0", "assistant_text", .string("   "))])
    XCTAssertTrue(rows.isEmpty)
  }

  // MARK: author label only in multiplayer

  func testAuthorLabelOnlyWhenTwoDistinctAuthors() {
    func user(_ id: String, _ uid: String) -> FeedItemVM {
      vm(id, "user_message", .object(["author": .object(["userId": .string(uid), "name": .string(uid)])]))
    }
    let single = MissionFeedFold.rows(from: [user("a", "u1"), user("b", "u1")])
    for row in single {
      guard case let .user(_, author) = row.kind else { continue }
      XCTAssertNil(author, "single author → no label")
    }
    let multi = MissionFeedFold.rows(from: [user("a", "u1"), user("b", "u2")])
    let labels = multi.compactMap { row -> String? in
      if case let .user(_, author) = row.kind { return author }
      return nil
    }
    XCTAssertEqual(labels, ["u1", "u2"], "2+ authors → labels shown")
  }
}
