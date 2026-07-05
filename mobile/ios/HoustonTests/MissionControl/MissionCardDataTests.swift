import XCTest

@testable import Houston

/// Card projection: status → state, routine tag, and description preview (PARITY §3).
final class MissionCardDataTests: XCTestCase {
  private func card(status: String, routineId: String? = nil, description: String? = nil) -> MissionCardData {
    MissionCardData.make(
      agent: MissionFixture.agent(id: "a", name: "Ada"),
      activity: MissionFixture.activity(id: "1", status: status, description: description, routineId: routineId)
    )
  }

  func testStatusMapsToMissionState() {
    XCTAssertEqual(card(status: "running").state, .running)
    XCTAssertEqual(card(status: "needs_you").state, .needsYou)
    XCTAssertEqual(card(status: "error").state, .error)
    XCTAssertEqual(card(status: "done").state, .done)
    XCTAssertEqual(card(status: "cancelled").state, .done)
    XCTAssertEqual(card(status: "archived").state, .archived)
    XCTAssertEqual(card(status: "weird").state, .unknown("weird"))
  }

  func testRoutineTagOnlyWhenRoutineId() {
    XCTAssertEqual(card(status: "running", routineId: "r1").tags, [Strings.Board.tagRoutine])
    XCTAssertEqual(card(status: "running").tags, [])
  }

  func testDescriptionPreviewDecodesAndAgentColorIsNil() {
    let c = card(status: "running", description: "plain ask")
    XCTAssertEqual(c.descriptionPreview, "plain ask")
    XCTAssertNil(c.agentColorHex)
    XCTAssertEqual(c.chatRoute.sessionKey, "activity-1")
    XCTAssertEqual(c.chatRoute.agentId, "a")
  }
}

/// The marker-stripping preview helper (mirrors desktop `messagePreviewText`).
final class MissionPreviewTextTests: XCTestCase {
  func testStripsLeadingHoustonMarker() {
    let body = "<!--houston:attachments {\"files\":[\"/tmp/x\"]}-->\n\nWhat does this file do?"
    XCTAssertEqual(MissionPreviewText.preview(body), "What does this file do?")
  }

  func testStripsSkillMarker() {
    let body = "<!--houston:skill {\"skill\":\"set-up\"}-->\nrun the setup"
    XCTAssertEqual(MissionPreviewText.preview(body), "run the setup")
  }

  func testPassesPlainTextThrough() {
    XCTAssertEqual(MissionPreviewText.preview("just text"), "just text")
  }

  func testEmptyAndNilYieldEmpty() {
    XCTAssertEqual(MissionPreviewText.preview(nil), "")
    XCTAssertEqual(MissionPreviewText.preview(""), "")
  }
}
