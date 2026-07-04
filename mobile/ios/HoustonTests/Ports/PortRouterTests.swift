import Foundation
import XCTest

@testable import Houston

/// The router only claims `fetch/*` and `storage/*` requests; SDK protocol
/// frames pass through (`handle` returns `false`) for the client to process.
final class PortRouterTests: XCTestCase {
    private var sink: ReplySink!
    private var secure: FakeBacking!
    private var plain: FakeBacking!
    private var router: SdkPortRouter!

    override func setUp() {
        super.setUp()
        sink = ReplySink()
        secure = FakeBacking()
        plain = FakeBacking()
        router = SdkPortRouter(
            send: sink.send, secure: secure, plain: plain,
            fetchConfiguration: MockURLProtocol.session()
        )
        MockURLProtocol.reset()
    }

    override func tearDown() {
        router.teardown()
        MockURLProtocol.reset()
        super.tearDown()
    }

    func testStorageRequestIsConsumed() {
        let msg = #"{"kind":"storage/set","id":"k1","key":"other","value":"v"}"#
        XCTAssertTrue(router.handle(msg))
        XCTAssertEqual(plain.store["other"], "v")
    }

    func testStorageGetRepliesThroughSameSend() {
        secure.store[SessionKeys.tokenKey] = "jwt"
        let msg = "{\"kind\":\"storage/get\",\"id\":\"k2\",\"key\":\"\(SessionKeys.tokenKey)\"}"
        XCTAssertTrue(router.handle(msg))
        XCTAssertEqual(sink.decoded().first?["value"] as? String, "jwt")
    }

    func testFetchRequestIsConsumed() {
        MockURLProtocol.stub = .init(status: 200, chunks: [])
        let msg = #"{"kind":"fetch/start","id":"f1","url":"http://x/agents","method":"GET"}"#
        XCTAssertTrue(router.handle(msg))
    }

    func testProtocolFramePassesThrough() {
        for kind in ["ready", "result", "snapshot", "event", "fatal", "log"] {
            XCTAssertFalse(router.handle(#"{"kind":"\#(kind)"}"#), "\(kind) is not a port frame")
        }
    }

    func testStorageResultIsNotAPortRequest() {
        // storage/result flows host→SDK; the router must not claim it.
        XCTAssertFalse(router.handle(#"{"kind":"storage/result","id":"k","value":null}"#))
    }

    func testNonJsonAndMissingKindPassThrough() {
        XCTAssertFalse(router.handle("not json"))
        XCTAssertFalse(router.handle("{}"))
    }
}
