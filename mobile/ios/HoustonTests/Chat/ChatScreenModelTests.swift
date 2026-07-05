import XCTest

@testable import Houston

/// A spy ``ChatCommanding`` that records dispatches and fires a callback so a
/// test can await the fire-and-forget `Task`s the model spawns.
@MainActor
final class SpyChatCommands: ChatCommanding {
  private(set) var observed: [(agentId: String, conversationId: String)] = []
  private(set) var sent: [(agentId: String, conversationId: String, text: String)] = []
  private(set) var cancelled: [(agentId: String, conversationId: String)] = []
  private(set) var statuses: [(agentId: String, activityId: String, status: String)] = []
  var onCall: (() -> Void)?

  func observe(agentId: String, conversationId: String) async throws {
    observed.append((agentId, conversationId)); onCall?()
  }
  func send(agentId: String, conversationId: String, text: String) async throws {
    sent.append((agentId, conversationId, text)); onCall?()
  }
  func cancel(agentId: String, conversationId: String) async throws {
    cancelled.append((agentId, conversationId)); onCall?()
  }
  func setStatus(agentId: String, activityId: String, status: String) async throws {
    statuses.append((agentId, activityId, status)); onCall?()
  }
}

@MainActor
final class ChatScreenModelTests: XCTestCase {
  private func makeModel(
    conversationId: String = "activity-42"
  ) -> (ChatScreenModel, SpyChatCommands, SdkClient, MockTransport) {
    let transport = MockTransport()
    let client = SdkClient(transport: transport)
    let spy = SpyChatCommands()
    let model = ChatScreenModel(
      agentId: "ag1", conversationId: conversationId, client: client, commands: spy)
    return (model, spy, client, transport)
  }

  private func awaitCall(_ spy: SpyChatCommands, _ act: () -> Void) async {
    let exp = expectation(description: "command dispatched")
    spy.onCall = { exp.fulfill() }
    act()
    await fulfillment(of: [exp], timeout: 1)
  }

  // MARK: send

  func testSendTrimsClearsDraftAndDispatches() async {
    let (model, spy, _, _) = makeModel()
    model.draft = "  hi there \n"
    await awaitCall(spy) { model.send() }
    XCTAssertEqual(spy.sent.last?.text, "hi there")
    XCTAssertEqual(spy.sent.last?.conversationId, "activity-42")
    XCTAssertEqual(model.draft, "")
    XCTAssertEqual(model.sendTick, 1, "send fires exactly one haptic tick")
  }

  func testSendIgnoresBlankDraft() {
    let (model, spy, _, _) = makeModel()
    model.draft = "   \n "
    model.send()  // synchronous guard: no Task spawned
    XCTAssertTrue(spy.sent.isEmpty)
    XCTAssertEqual(model.sendTick, 0)
    XCTAssertEqual(model.draft, "   \n ")
  }

  // MARK: stop + approve

  func testStopDispatchesCancel() async {
    let (model, spy, _, _) = makeModel()
    await awaitCall(spy) { model.stop() }
    XCTAssertEqual(spy.cancelled.count, 1)
    XCTAssertEqual(spy.cancelled.last?.conversationId, "activity-42")
  }

  func testApproveDispatchesSetStatusDoneWithResolvedActivityId() async {
    let (model, spy, _, _) = makeModel(conversationId: "activity-42")
    await awaitCall(spy) { model.approve() }
    XCTAssertEqual(spy.statuses.last?.status, "done")
    XCTAssertEqual(spy.statuses.last?.activityId, "42", "activity-<id> session key → id")
  }

  // MARK: activity id resolution

  func testResolvedActivityIdStripsSessionKeyPrefix() {
    let (model, _, _, _) = makeModel(conversationId: "activity-abc")
    XCTAssertEqual(model.resolvedActivityId, "abc")
  }

  func testResolvedActivityIdFallsBackToRawWhenNoPrefix() {
    let (model, _, _, _) = makeModel(conversationId: "conv-9")
    XCTAssertEqual(model.resolvedActivityId, "conv-9")
  }

  // MARK: end-to-end scope binding — Approve bar reads the pair (PARITY §1)

  func testApproveBarShowsOnNeedsYouSettle() throws {
    let (model, _, client, transport) = makeModel()
    model.appear()  // retains scopes → subscribe frames delivered
    let sub = try XCTUnwrap(conversationSub(in: transport), "no conversation subscription opened")

    let snapshot = JSONValue.object([
      "feed": .array([
        .object(["id": .string("f0"), "feed_type": .string("user_message"), "data": .string("hi")])
      ]),
      "running": .bool(false),
      "sessionStatus": .string("completed"),
      "boardStatus": .string("needs_you"),
    ])
    client.receiveOutbound(
      BridgeTestJSON.encode(.snapshot(sub: sub, scope: model.conversation.scope, snapshot: snapshot)))

    XCTAssertFalse(model.running)
    XCTAssertTrue(model.showApproveBar, "needs_you + not running → Approve bar")
    XCTAssertEqual(model.rows.count, 1)
    model.disappear()
  }

  func testApproveBarHiddenWhileRunning() throws {
    let (model, _, client, transport) = makeModel()
    model.appear()
    let sub = try XCTUnwrap(conversationSub(in: transport))
    let snapshot = JSONValue.object([
      "feed": .array([]), "running": .bool(true),
      "sessionStatus": .string("running"), "boardStatus": .string("needs_you"),
    ])
    client.receiveOutbound(
      BridgeTestJSON.encode(.snapshot(sub: sub, scope: model.conversation.scope, snapshot: snapshot)))
    XCTAssertTrue(model.running)
    XCTAssertFalse(model.showApproveBar, "a running turn suppresses the Approve bar")
    model.disappear()
  }

  /// Find the `sub` id of the subscribe frame targeting the `conversation/` scope.
  private func conversationSub(in transport: MockTransport) -> String? {
    struct Frame: Decodable { let kind: String; let scope: String?; let sub: String? }
    for raw in transport.delivered {
      guard let frame = try? JSONDecoder().decode(Frame.self, from: Data(raw.utf8)),
        frame.kind == "subscribe", frame.scope?.hasPrefix("conversation/") == true
      else { continue }
      return frame.sub
    }
    return nil
  }
}
