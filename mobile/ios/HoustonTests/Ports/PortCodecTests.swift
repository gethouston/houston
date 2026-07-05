import Foundation
import XCTest

@testable import Houston

/// The wire codec: inbound frame decoding and reply encoding, including the
/// `get`-carries-`value` / `set`-omits-`value` rule from BRIDGE.md §9.2.
final class PortCodecTests: XCTestCase {
    func testDecodesFetchStartWithHeadersAndBody() {
        let json = """
        {"kind":"fetch/start","id":"f1","url":"http://x/agents","method":"POST",
         "headers":{"accept":"application/json"},"body":"{\\"a\\":1}"}
        """
        let frame = PortCodec.decode(FetchStartFrame.self, from: Data(json.utf8))
        XCTAssertEqual(frame?.id, "f1")
        XCTAssertEqual(frame?.method, "POST")
        XCTAssertEqual(frame?.headers?["accept"], "application/json")
        XCTAssertEqual(frame?.body, "{\"a\":1}")
    }

    func testDecodesToleratesUnknownFields() {
        let json = #"{"kind":"fetch/start","id":"f2","url":"http://x","future":true}"#
        let frame = PortCodec.decode(FetchStartFrame.self, from: Data(json.utf8))
        XCTAssertEqual(frame?.id, "f2")
        XCTAssertNil(frame?.method)
    }

    func testFetchResponseReplyShape() throws {
        let obj = try encodeToObject(FetchResponseReply(id: "f3", status: 204, ok: true))
        XCTAssertEqual(obj["kind"] as? String, "fetch/response")
        XCTAssertEqual(obj["id"] as? String, "f3")
        XCTAssertEqual(obj["status"] as? Int, 204)
        XCTAssertEqual(obj["ok"] as? Bool, true)
    }

    func testStorageGetResultCarriesExplicitNull() throws {
        let json = try encodeToString(
            StorageResultReply(id: "k1", includeValue: true, value: nil)
        )
        XCTAssertTrue(json.contains("\"value\":null"), "get miss must encode explicit null")
        let obj = try encodeToObject(StorageResultReply(id: "k1", includeValue: true, value: "tok"))
        XCTAssertEqual(obj["value"] as? String, "tok")
    }

    func testStorageSetResultOmitsValue() throws {
        let obj = try encodeToObject(
            StorageResultReply(id: "k2", includeValue: false, value: nil)
        )
        XCTAssertEqual(obj["kind"] as? String, "storage/result")
        XCTAssertFalse(obj.keys.contains("value"), "set/delete result must omit value")
    }

    // MARK: - helpers

    private func encodeToString<T: Encodable>(_ value: T) throws -> String {
        try XCTUnwrap(PortCodec.encode(value))
    }

    private func encodeToObject<T: Encodable>(_ value: T) throws -> [String: Any] {
        let data = Data(try encodeToString(value).utf8)
        return try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )
    }
}
