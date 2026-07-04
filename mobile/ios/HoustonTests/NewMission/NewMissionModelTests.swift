import XCTest

@testable import Houston

/// The create flow (PARITY §6): create activity → send first turn, rollback on
/// send failure, and the client-side fallback title.
@MainActor
final class NewMissionModelTests: XCTestCase {
  private func model(_ stub: MissionCommandRunnerStub) -> NewMissionModel {
    NewMissionModel(agent: MissionFixture.agent(id: "a", name: "Ada"), runner: stub)
  }

  private func seedCreate(_ stub: MissionCommandRunnerStub, id: String = "m1", sessionKey: String = "activity-m1") {
    stub.responses["activities/create"] = .object(["id": .string(id), "sessionKey": .string(sessionKey)])
  }

  func testHappyPathCreatesThenSendsAndReturnsRoute() async {
    let stub = MissionCommandRunnerStub()
    seedCreate(stub)
    let route = await model(stub).send(text: "Draft the launch email")

    XCTAssertEqual(stub.dispatchedTypes, ["activities/create", "turns/send"])
    XCTAssertEqual(route?.sessionKey, "activity-m1")
    XCTAssertEqual(route?.agentId, "a")
    XCTAssertEqual(route?.title, "Draft the launch email")

    let create = stub.lastPayload(for: "activities/create")
    XCTAssertEqual(create?["title"]?.stringValue, "Draft the launch email")
    XCTAssertEqual(create?["description"]?.stringValue, "Draft the launch email")
    let send = stub.lastPayload(for: "turns/send")
    XCTAssertEqual(send?["conversationId"]?.stringValue, "activity-m1")
    XCTAssertEqual(send?["text"]?.stringValue, "Draft the launch email")
  }

  func testSendFailureRollsBackAndReturnsNil() async {
    let stub = MissionCommandRunnerStub()
    seedCreate(stub)
    stub.failures["turns/send"] = StubError()
    let m = model(stub)
    let route = await m.send(text: "do the thing")

    XCTAssertNil(route)
    XCTAssertEqual(stub.dispatchedTypes, ["activities/create", "turns/send", "activities/delete"])
    XCTAssertEqual(stub.lastPayload(for: "activities/delete")?["id"]?.stringValue, "m1")
    XCTAssertNotNil(m.errorMessage)
    XCTAssertEqual(m.phase, .composing)
  }

  func testWhitespaceOnlyDoesNothing() async {
    let stub = MissionCommandRunnerStub()
    let route = await model(stub).send(text: "   \n ")
    XCTAssertNil(route)
    XCTAssertTrue(stub.calls.isEmpty)
  }

  func testCreateFailureReturnsNilWithoutSend() async {
    let stub = MissionCommandRunnerStub()
    stub.failures["activities/create"] = StubError()
    let route = await model(stub).send(text: "hello")
    XCTAssertNil(route)
    XCTAssertEqual(stub.dispatchedTypes, ["activities/create"])
  }
}
