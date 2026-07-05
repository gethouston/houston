import Foundation
import XCTest

@testable import Houston

/// Storage routing: token → Keychain-side backing, everything else → defaults,
/// and the `storage/result` reply shape per operation.
final class StoragePortTests: XCTestCase {
    private var secure: FakeBacking!
    private var plain: FakeBacking!
    private var sink: ReplySink!
    private var port: StoragePort!

    override func setUp() {
        super.setUp()
        secure = FakeBacking()
        plain = FakeBacking()
        sink = ReplySink()
        port = StoragePort(send: sink.send, secure: secure, plain: plain)
    }

    private func handle(_ kind: String, key: String, id: String, value: String? = nil) {
        var obj: [String: Any] = ["kind": kind, "id": id, "key": key]
        if let value { obj["value"] = value }
        let data = try! JSONSerialization.data(withJSONObject: obj)
        XCTAssertTrue(port.handle(data, kind: kind))
    }

    func testTokenSetRoutesToSecureBacking() {
        handle("storage/set", key: SessionKeys.tokenKey, id: "k1", value: "jwt")
        XCTAssertEqual(secure.store[SessionKeys.tokenKey], "jwt")
        XCTAssertNil(plain.store[SessionKeys.tokenKey])
    }

    func testNonTokenSetRoutesToPlainBacking() {
        handle("storage/set", key: "other", id: "k2", value: "v")
        XCTAssertEqual(plain.store["other"], "v")
        XCTAssertNil(secure.store["other"])
    }

    func testGetHitReturnsValue() {
        secure.store[SessionKeys.tokenKey] = "jwt"
        handle("storage/get", key: SessionKeys.tokenKey, id: "k3")
        let reply = sink.decoded().first
        XCTAssertEqual(reply?["kind"] as? String, "storage/result")
        XCTAssertEqual(reply?["id"] as? String, "k3")
        XCTAssertEqual(reply?["value"] as? String, "jwt")
    }

    func testGetMissRepliesNull() {
        handle("storage/get", key: SessionKeys.tokenKey, id: "k4")
        let reply = sink.decoded().first
        XCTAssertNotNil(reply)
        XCTAssertTrue(reply?["value"] is NSNull, "a miss replies explicit null")
    }

    func testSetResultOmitsValue() {
        handle("storage/set", key: "other", id: "k5", value: "v")
        let reply = sink.decoded().first
        XCTAssertFalse(reply?.keys.contains("value") ?? true)
    }

    func testDeleteRemovesAndReplies() {
        plain.store["other"] = "v"
        handle("storage/delete", key: "other", id: "k6")
        XCTAssertNil(plain.store["other"])
        XCTAssertEqual(sink.decoded().first?["id"] as? String, "k6")
    }

    func testReadFailureSurfacesErrorAndRepliesNull() {
        secure.failRead = true
        secure.store[SessionKeys.tokenKey] = "jwt"
        var reported = false
        let p = StoragePort(
            send: sink.send, secure: secure, plain: plain,
            onError: { _ in reported = true }
        )
        let data = try! JSONSerialization.data(
            withJSONObject: ["kind": "storage/get", "id": "k7", "key": SessionKeys.tokenKey]
        )
        _ = p.handle(data, kind: "storage/get")
        XCTAssertTrue(reported, "backend error must be surfaced, not swallowed")
        XCTAssertTrue(sink.decoded().first?["value"] is NSNull)
    }

    func testUnknownKindNotHandled() {
        let data = try! JSONSerialization.data(withJSONObject: ["kind": "storage/result", "id": "x"])
        XCTAssertFalse(port.handle(data, kind: "storage/result"))
    }
}
