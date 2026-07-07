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

  // MARK: process block folding (PARITY §4)

  func testToolResultAttachesToPrecedingCallInProcessBlock() {
    let feed = [
      vm("f0", "tool_call", .object(["name": .string("Bash"), "input": .object(["command": .string("ls")])])),
      vm("f1", "tool_result", .object(["content": .string("ok"), "is_error": .bool(false)])),
    ]
    let rows = MissionFeedFold.rows(from: feed)
    XCTAssertEqual(rows.count, 1)
    guard case let .process(group) = rows.first?.kind else { return XCTFail("expected process row") }
    XCTAssertEqual(rows.first?.id, "f0", "the block keeps the first item's stable id")
    XCTAssertEqual(group.items.count, 1)
    guard case let .tool(_, call, result) = group.items.first else { return XCTFail("expected tool item") }
    XCTAssertEqual(call.name, "Bash")
    XCTAssertEqual(result?.content, "ok")
  }

  func testThinkingAndToolsFoldIntoOneBlock() {
    let feed = [
      vm("t0", "thinking", .string("planning")),
      vm("c0", "tool_call", .object(["name": .string("Read"), "input": .object(["file_path": .string("a.txt")])])),
      vm("r0", "tool_result", .object(["content": .string("data"), "is_error": .bool(false)])),
    ]
    let rows = MissionFeedFold.rows(from: feed)
    XCTAssertEqual(rows.count, 1, "reasoning + tools collapse into ONE block")
    guard case let .process(group) = rows.first?.kind else { return XCTFail("expected process row") }
    XCTAssertEqual(group.items.count, 2, "reasoning item + tool item")
  }

  func testAssistantTextEndsProcessBlock() {
    let feed = [
      vm("t0", "thinking", .string("planning")),
      vm("a0", "assistant_text", .string("Done!")),
    ]
    let rows = MissionFeedFold.rows(from: feed)
    XCTAssertEqual(rows.count, 2, "process block then assistant message")
    guard case .process = rows[0].kind else { return XCTFail("first row is the process block") }
    guard case .assistant = rows[1].kind else { return XCTFail("second row is the reply") }
  }

  func testTrailingProcessMarkedActiveOnlyWhenRunning() {
    let feed = [vm("t0", "thinking", .string("planning"))]
    guard case let .process(idle) = MissionFeedFold.rows(from: feed, running: false).first?.kind
    else { return XCTFail("expected process row") }
    XCTAssertFalse(idle.active)
    guard case let .process(live) = MissionFeedFold.rows(from: feed, running: true).first?.kind
    else { return XCTFail("expected process row") }
    XCTAssertTrue(live.active, "trailing block of a running turn is active")
  }

  func testStreamingReplyLeavesProcessSettled() {
    let feed = [
      vm("t0", "thinking", .string("planning")),
      vm("a0", "assistant_text_streaming", .string("Draf")),
    ]
    let rows = MissionFeedFold.rows(from: feed, running: true)
    guard case let .process(group) = rows.first?.kind else { return XCTFail("expected process row") }
    XCTAssertFalse(group.active, "a streaming reply after the block leaves it settled")
  }

  // MARK: final_result renders nothing (PARITY §4)

  func testFinalResultRendersNothing() {
    let feed = [
      vm("a0", "assistant_text", .string("The answer is 42.")),
      vm("fr", "final_result", .object(["result": .string("The answer is 42.")])),
    ]
    let rows = MissionFeedFold.rows(from: feed)
    XCTAssertEqual(rows.count, 1, "final_result must NOT duplicate the reply")
    guard case .assistant = rows.first?.kind else { return XCTFail("only the assistant bubble remains") }
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

  // MARK: unread badge counts messages, not folded rows

  func testOneAgentTurnCountsAsOneUnreadMessage() {
    // A normal turn — reasoning + tool + reply — FOLDS into two rows (a process
    // block + the reply) but is ONE new message; WhatsApp's badge would show 1.
    let feed = [
      vm("t0", "thinking", .string("planning")),
      vm("c0", "tool_call", .object(["name": .string("Read"), "input": .object(["file_path": .string("a.txt")])])),
      vm("r0", "tool_result", .object(["content": .string("data"), "is_error": .bool(false)])),
      vm("a0", "assistant_text", .string("Done!")),
    ]
    let rows = MissionFeedFold.rows(from: feed)
    XCTAssertEqual(rows.count, 2, "the turn folds into a process block + the reply")
    XCTAssertEqual(rows.unreadMessageCount, 1, "the process block is not a message")

    // The user was scrolled up on an empty transcript; the turn then streams in.
    var unread = UnreadCounter()
    unread.update(messageCount: 0, atBottom: false)  // baseline
    unread.update(messageCount: rows.unreadMessageCount, atBottom: false)  // turn arrives
    XCTAssertEqual(unread.count, 1, "one turn is one unread message, not two folded rows")
  }

  func testProcessBlockAloneIsNotAnUnreadMessage() {
    // A turn that is still only reasoning/tools (no reply yet) folds to one
    // process row and must not bump the unread badge.
    let feed = [
      vm("t0", "thinking", .string("planning")),
      vm("c0", "tool_call", .object(["name": .string("Bash"), "input": .object(["command": .string("ls")])])),
    ]
    let rows = MissionFeedFold.rows(from: feed)
    XCTAssertEqual(rows.count, 1, "reasoning + tool fold into one process block")
    XCTAssertEqual(rows.unreadMessageCount, 0, "an open process block is activity, not a message")

    var unread = UnreadCounter()
    unread.update(messageCount: 0, atBottom: false)
    unread.update(messageCount: rows.unreadMessageCount, atBottom: false)
    XCTAssertEqual(unread.count, 0)
  }

  func testCardsAndBubblesEachCountAsAnUnreadMessage() {
    // Discrete cards/bubbles the user hasn't seen each count once.
    let feed = [
      vm("u0", "user_message", .object(["text": .string("go")])),
      vm("a0", "assistant_text", .string("done")),
      vm("s0", "system_message", .string("Heads up")),
    ]
    let rows = MissionFeedFold.rows(from: feed)
    XCTAssertEqual(rows.unreadMessageCount, 3)
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
