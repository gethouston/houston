import XCTest

@testable import Houston

/// Card actions dispatch the right `activities/*` commands and propagate errors.
@MainActor
final class MissionActionsTests: XCTestCase {
  private func card() -> MissionCardData {
    MissionCardData.make(
      agent: MissionFixture.agent(id: "a", name: "Ada"),
      activity: MissionFixture.activity(id: "m1", status: "needs_you")
    )
  }

  func testArchiveSetsArchivedStatus() async throws {
    let stub = MissionCommandRunnerStub()
    try await MissionActions(runner: stub).archive(card())
    let payload = try XCTUnwrap(stub.lastPayload(for: "activities/setStatus"))
    XCTAssertEqual(payload["status"]?.stringValue, "archived")
    XCTAssertEqual(payload["id"]?.stringValue, "m1")
    XCTAssertEqual(payload["agentId"]?.stringValue, "a")
  }

  func testRenameTrimsAndDispatches() async throws {
    let stub = MissionCommandRunnerStub()
    try await MissionActions(runner: stub).rename(card(), to: "  New name  ")
    let payload = try XCTUnwrap(stub.lastPayload(for: "activities/rename"))
    XCTAssertEqual(payload["title"]?.stringValue, "New name")
  }

  func testRenameRejectsEmptyTitleWithoutDispatch() async {
    let stub = MissionCommandRunnerStub()
    do {
      try await MissionActions(runner: stub).rename(card(), to: "   ")
      XCTFail("expected emptyTitle")
    } catch {
      XCTAssertEqual(error as? MissionActionError, .emptyTitle)
    }
    XCTAssertTrue(stub.calls.isEmpty)
  }

  func testCommandFailurePropagates() async {
    let stub = MissionCommandRunnerStub()
    stub.failures["activities/setStatus"] = StubError()
    do {
      try await MissionActions(runner: stub).archive(card())
      XCTFail("expected failure")
    } catch {
      XCTAssertNotNil(error as? StubError)
    }
  }
}
