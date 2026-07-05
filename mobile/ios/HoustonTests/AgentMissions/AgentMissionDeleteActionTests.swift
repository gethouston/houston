import XCTest

@testable import Houston

/// The per-agent screen's Delete action dispatches `activities/delete` with the
/// mission's `{ agentId, id }` and propagates errors (no silent failure). Reuses
/// the shared `MissionCommandRunnerStub` so no bridge is needed.
@MainActor
final class AgentMissionDeleteActionTests: XCTestCase {
    private func card() -> MissionCardData {
        MissionCardData.make(
            agent: MissionFixture.agent(id: "a", name: "Ada"),
            activity: MissionFixture.activity(id: "m1", status: "needs_you")
        )
    }

    func testDeleteDispatchesActivitiesDelete() async throws {
        let stub = MissionCommandRunnerStub()
        try await MissionActions(runner: stub).delete(card())

        XCTAssertEqual(stub.dispatchedTypes, ["activities/delete"])
        let payload = try XCTUnwrap(stub.lastPayload(for: "activities/delete"))
        XCTAssertEqual(payload["agentId"]?.stringValue, "a")
        XCTAssertEqual(payload["id"]?.stringValue, "m1")
    }

    func testDeleteFailurePropagates() async {
        let stub = MissionCommandRunnerStub()
        stub.failures["activities/delete"] = StubError()
        do {
            try await MissionActions(runner: stub).delete(card())
            XCTFail("expected failure")
        } catch {
            XCTAssertNotNil(error as? StubError)
        }
    }
}
