import XCTest

@testable import Houston

/// The Settings model's locale logic: the optimistic switch, revert-on-failure,
/// and no-op guard. Driven through an in-memory `MockTransport` (no JS engine).
/// With no agent list loaded, `workspaceId` is nil, so the persist path is the
/// `preferences/set` fallback — exactly the branch these tests exercise.
@MainActor
final class SettingsModelTests: XCTestCase {
    private enum Outcome {
        case ok(JSONValue?)
        case fail(String, Int?)
    }

    /// A client that answers each delivered command per `respond(type)`.
    private func makeClient(_ respond: @escaping (String) -> Outcome) -> SdkClient {
        let transport = MockTransport()
        let client = SdkClient(transport: transport)
        transport.onDeliver = { raw in
            guard let env = BridgeTestJSON.envelope(from: raw) else { return }
            let result: CommandResult
            switch respond(env.type) {
            case let .ok(value):
                result = CommandResult(id: env.id, ok: true, value: value, error: nil)
            case let .fail(message, status):
                result = CommandResult(
                    id: env.id, ok: false, value: nil,
                    error: CommandErrorPayload(message: message, status: status))
            }
            client.receiveOutbound(BridgeTestJSON.encode(.result(result)))
        }
        return client
    }

    func testChangeLocaleSuccessUpdatesSelection() async {
        let model = SettingsModel(client: makeClient { _ in .ok(.string("es")) })
        await model.changeLocale(.es)
        XCTAssertEqual(model.locale, .es)
        XCTAssertNil(model.errorMessage)
    }

    func testChangeLocaleFailureRevertsAndSurfaces() async {
        let model = SettingsModel(client: makeClient { _ in .fail("nope", 500) })
        // Starts at .en; a failed write must leave it there and surface the reason.
        await model.changeLocale(.pt)
        XCTAssertEqual(model.locale, .en)
        XCTAssertEqual(model.errorMessage, "nope")
    }

    func testChangeLocaleIsNoOpForSameValue() async {
        // The responder would fail any command; a no-op must never issue one, so
        // the locale stays and no error surfaces.
        let model = SettingsModel(client: makeClient { _ in .fail("should not run", nil) })
        await model.changeLocale(.en)
        XCTAssertEqual(model.locale, .en)
        XCTAssertNil(model.errorMessage)
    }
}
