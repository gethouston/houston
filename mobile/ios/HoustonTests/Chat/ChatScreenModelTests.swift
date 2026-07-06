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
  private(set) var created: [(agentId: String, title: String, description: String)] = []
  private(set) var deleted: [(agentId: String, activityId: String)] = []
  /// Command names to throw `StubError` on (draft failure paths): "create",
  /// "send", "delete".
  var failOn: Set<String> = []
  /// The activity `activities/create` returns on the happy path.
  var createResult = CreatedActivity(id: "m1", sessionKey: "activity-m1")
  var onCall: (() -> Void)?

  func observe(agentId: String, conversationId: String) async throws {
    observed.append((agentId, conversationId)); onCall?()
  }
  func send(agentId: String, conversationId: String, text: String) async throws {
    sent.append((agentId, conversationId, text)); onCall?()
    if failOn.contains("send") { throw StubError() }
  }
  func cancel(agentId: String, conversationId: String) async throws {
    cancelled.append((agentId, conversationId)); onCall?()
  }
  func setStatus(agentId: String, activityId: String, status: String) async throws {
    statuses.append((agentId, activityId, status)); onCall?()
  }
  func create(agentId: String, title: String, description: String) async throws -> CreatedActivity {
    created.append((agentId, title, description)); onCall?()
    if failOn.contains("create") { throw StubError() }
    return createResult
  }
  func delete(agentId: String, activityId: String) async throws {
    deleted.append((agentId, activityId)); onCall?()
    if failOn.contains("delete") { throw StubError() }
  }
}

@MainActor
final class ChatScreenModelTests: XCTestCase {
  private func makeModel(
    conversationId: String? = "activity-42"
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

  // MARK: stop

  func testStopDispatchesCancel() async {
    let (model, spy, _, _) = makeModel()
    await awaitCall(spy) { model.stop() }
    XCTAssertEqual(spy.cancelled.count, 1)
    XCTAssertEqual(spy.cancelled.last?.conversationId, "activity-42")
  }

  // MARK: pending helmet slot + placeholder (PARITY §1/§2)

  private func snapshot(
    _ model: ChatScreenModel, _ client: SdkClient, _ transport: MockTransport, _ snapshot: JSONValue
  ) throws {
    model.appear()
    let sub = try XCTUnwrap(conversationSub(in: transport), "no conversation subscription opened")
    let scope = try XCTUnwrap(model.conversation?.scope, "no conversation scope bound")
    client.receiveOutbound(
      BridgeTestJSON.encode(.snapshot(sub: sub, scope: scope, snapshot: snapshot)))
  }

  func testPendingSlotShowsWhileSubmittedWithLabel() throws {
    let (model, _, client, transport) = makeModel()
    try snapshot(
      model, client, transport,
      .object([
        "feed": .array([
          .object(["id": .string("f0"), "feed_type": .string("user_message"), "data": .string("hi")])
        ]),
        "running": .bool(true), "sessionStatus": .string("running"),
      ]))
    XCTAssertTrue(model.showPending, "running + no streaming text → helmet slot")
    XCTAssertTrue(model.showPendingLabel, "no active process yet → label shows above helmet")
    model.disappear()
  }

  func testPendingSlotHiddenWhileAssistantStreams() throws {
    let (model, _, client, transport) = makeModel()
    try snapshot(
      model, client, transport,
      .object([
        "feed": .array([
          .object([
            "id": .string("f0"), "feed_type": .string("assistant_text_streaming"),
            "data": .string("Draft"),
          ])
        ]),
        "running": .bool(true), "sessionStatus": .string("running"),
      ]))
    XCTAssertFalse(model.showPending, "streaming reply is the progress signal — helmet vanishes")
    model.disappear()
  }

  func testPendingLabelSuppressedWhenProcessBlockActive() throws {
    let (model, _, client, transport) = makeModel()
    try snapshot(
      model, client, transport,
      .object([
        "feed": .array([
          .object([
            "id": .string("t0"), "feed_type": .string("tool_call"),
            "data": .object(["name": .string("Read"), "input": .object(["file_path": .string("a.txt")])]),
          ])
        ]),
        "running": .bool(true), "sessionStatus": .string("running"),
      ]))
    XCTAssertTrue(model.showPending, "helmet stays through tool phases")
    XCTAssertFalse(model.showPendingLabel, "active process header already surfaces the label")
    model.disappear()
  }

  func testComposerPlaceholderNewVsFollowUp() throws {
    let (model, _, client, transport) = makeModel()
    XCTAssertEqual(model.composerPlaceholder, Strings.Chat.newMissionPlaceholder)
    try snapshot(
      model, client, transport,
      .object([
        "feed": .array([
          .object(["id": .string("u0"), "feed_type": .string("user_message"), "data": .string("hi")])
        ]),
        "running": .bool(false), "sessionStatus": .string("completed"),
      ]))
    XCTAssertEqual(
      model.composerPlaceholder, Strings.Chat.followUpPlaceholder,
      "once the user has spoken it is a follow-up")
    model.disappear()
  }

  // MARK: draft first-send state machine (PARITY §6 / create-mission.ts)

  /// Await the model's fire-and-forget send `Task` by polling until it settles.
  private func awaitSettled(_ model: ChatScreenModel) async {
    let exp = expectation(description: "send task settled")
    Task { @MainActor in
      while model.isSending { try? await Task.sleep(for: .milliseconds(5)) }
      exp.fulfill()
    }
    await fulfillment(of: [exp], timeout: 2)
  }

  func testDraftFirstSendCreatesThenSendsThenBindsAndObserves() async {
    let (model, spy, _, _) = makeModel(conversationId: nil)
    XCTAssertNil(model.conversationId, "starts as an unsent draft")
    model.draft = "  Draft the launch email \n"
    model.send()
    await awaitSettled(model)

    XCTAssertEqual(spy.created.count, 1)
    XCTAssertEqual(spy.created.last?.title, "Draft the launch email", "fallback title from the text")
    XCTAssertEqual(spy.created.last?.description, "Draft the launch email")
    XCTAssertEqual(spy.sent.last?.conversationId, "activity-m1", "sends into the new session")
    XCTAssertEqual(spy.sent.last?.text, "Draft the launch email")
    XCTAssertEqual(spy.observed.last?.conversationId, "activity-m1", "observes the now-real chat")
    XCTAssertEqual(model.conversationId, "activity-m1", "draft transitioned into the real conversation")
    XCTAssertNotNil(model.conversation, "conversation scope bound")
    XCTAssertEqual(model.draft, "", "draft cleared on success")
    XCTAssertNil(model.actionError)
    XCTAssertTrue(spy.deleted.isEmpty, "no rollback on the happy path")
    model.disappear()
  }

  func testDraftSendFailureRollsBackDeletesAndRestoresDraft() async {
    let (model, spy, _, _) = makeModel(conversationId: nil)
    spy.failOn = ["send"]
    model.draft = "do the thing"
    model.send()
    await awaitSettled(model)

    XCTAssertEqual(spy.created.count, 1)
    XCTAssertEqual(spy.sent.count, 1, "send was attempted")
    XCTAssertEqual(spy.deleted.last?.activityId, "m1", "the just-created activity is rolled back")
    XCTAssertNil(model.conversationId, "draft unbound after rollback")
    XCTAssertNil(model.conversation)
    XCTAssertEqual(model.draft, "do the thing", "draft restored so the user can retry")
    XCTAssertNotNil(model.actionError, "the failure is surfaced, never silent")
  }

  func testDraftCreateFailureNeverSendsAndRestoresDraft() async {
    let (model, spy, _, _) = makeModel(conversationId: nil)
    spy.failOn = ["create"]
    model.draft = "hello"
    model.send()
    await awaitSettled(model)

    XCTAssertEqual(spy.created.count, 1)
    XCTAssertTrue(spy.sent.isEmpty, "no turn is sent when create fails")
    XCTAssertTrue(spy.deleted.isEmpty, "nothing to roll back — create never succeeded")
    XCTAssertNil(model.conversationId)
    XCTAssertEqual(model.draft, "hello", "draft restored")
    XCTAssertNotNil(model.actionError)
  }

  func testDraftBlankSendDoesNothing() {
    let (model, spy, _, _) = makeModel(conversationId: nil)
    model.draft = "   \n "
    model.send()
    XCTAssertTrue(spy.created.isEmpty)
    XCTAssertNil(model.conversationId)
    XCTAssertEqual(model.sendTick, 0)
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
