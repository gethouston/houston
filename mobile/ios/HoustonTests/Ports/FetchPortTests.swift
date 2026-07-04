import Foundation
import XCTest

@testable import Houston

/// Streaming behaviour and id lifecycle of the fetch port, driven through a
/// mocked `URLProtocol` so no real network is touched.
final class FetchPortTests: XCTestCase {
    private var sink: ReplySink!
    private var port: FetchPort!

    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
        sink = ReplySink()
        port = FetchPort(send: sink.send, configuration: MockURLProtocol.session())
    }

    override func tearDown() {
        port.teardown()
        MockURLProtocol.reset()
        super.tearDown()
    }

    /// Arm a fulfil-on-`kind` handler *before* starting, since `resume()`
    /// delivers asynchronously and a frame could otherwise beat the handler.
    private func expectKind(_ kind: String) -> XCTestExpectation {
        let exp = expectation(description: kind)
        exp.assertForOverFulfill = false
        sink.onMessage = { message in
            // Match the decoded `kind` field, never a raw substring: the wire
            // JSON is valid but `JSONEncoder` escapes `/` as `\/` and orders
            // keys by declaration, so a literal `"kind":"fetch/done"` search
            // would miss it.
            if Self.kind(of: message) == kind { exp.fulfill() }
        }
        return exp
    }

    /// The decoded `kind` discriminator of a reply frame, or nil if unparseable.
    private static func kind(of message: String) -> String? {
        guard let data = message.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return obj["kind"] as? String
    }

    private func start(id: String, headers: [String: String] = [:]) {
        var obj: [String: Any] = [
            "kind": "fetch/start", "id": id,
            "url": "http://127.0.0.1:4317/agents", "method": "GET",
        ]
        if !headers.isEmpty { obj["headers"] = headers }
        let data = try! JSONSerialization.data(withJSONObject: obj)
        XCTAssertTrue(port.handle(data, kind: "fetch/start"))
    }

    func testStreamsResponseChunksThenDone() {
        MockURLProtocol.stub = .init(
            status: 200,
            chunks: [Data("data: a\n\n".utf8), Data("data: b\n\n".utf8)]
        )
        let done = expectKind("fetch/done")
        start(id: "f1")
        wait(for: [done], timeout: 5)

        // Chunk boundaries are NOT contractual: URLSession may coalesce
        // delegate `didReceive data:` callbacks, and FetchPort forwards each
        // callback verbatim (see FetchPort's doc comment). So assert the frame
        // envelope (response first, done last, ≥1 chunk between) and the
        // reassembled body, never a fixed chunk count.
        let kinds = sink.kinds()
        XCTAssertEqual(kinds.first, "fetch/response")
        XCTAssertEqual(kinds.last, "fetch/done")
        XCTAssertTrue(kinds.contains("fetch/chunk"), "at least one chunk must stream")
        XCTAssertEqual(kinds.filter { $0 != "fetch/chunk" }, ["fetch/response", "fetch/done"])

        let response = sink.decoded().first
        XCTAssertEqual(response?["status"] as? Int, 200)
        XCTAssertEqual(response?["ok"] as? Bool, true)

        let body = sink.decoded()
            .filter { $0["kind"] as? String == "fetch/chunk" }
            .compactMap { ($0["bytesBase64"] as? String).flatMap { Data(base64Encoded: $0) } }
            .reduce(Data(), +)
        XCTAssertEqual(body, Data("data: a\n\ndata: b\n\n".utf8))
    }

    func testNonOkStatusStillStreams() {
        MockURLProtocol.stub = .init(status: 404, chunks: [Data("nope".utf8)])
        let done = expectKind("fetch/done")
        start(id: "f2")
        wait(for: [done], timeout: 5)
        let response = sink.decoded().first
        XCTAssertEqual(response?["status"] as? Int, 404)
        XCTAssertEqual(response?["ok"] as? Bool, false)
    }

    func testFailureEmitsFetchError() {
        MockURLProtocol.stub = .init(
            status: 200, chunks: [], error: URLError(.networkConnectionLost)
        )
        let failed = expectKind("fetch/error")
        start(id: "f3")
        wait(for: [failed], timeout: 5)
        XCTAssertTrue(sink.kinds().contains("fetch/error"))
        XCTAssertNotNil(sink.decoded().last?["message"] as? String)
    }

    func testAbortCancelsAndEmitsNoTerminal() {
        // A never-finishing stream keeps the task in-flight, so the abort
        // cancels a live request instead of racing its natural completion.
        // (A hung custom-protocol load surfaces no delegate frames mid-stream —
        // URLSession holds them until completion — so we drive the abort
        // directly rather than waiting on a frame.)
        MockURLProtocol.stub = .init(
            status: 200, chunks: [Data("data: a\n\n".utf8)], hangAfterFirstChunk: true
        )
        // Aborting an in-flight fetch must emit neither fetch/done nor
        // fetch/error: FetchPort drops the id before cancelling and swallows the
        // resulting NSURLErrorCancelled (PARITY: a Stop is not an error).
        let settled = expectation(description: "no terminal after abort")
        settled.isInverted = true
        sink.onMessage = { message in
            let kind = Self.kind(of: message)
            if kind == "fetch/done" || kind == "fetch/error" { settled.fulfill() }
        }
        // `start` registers the task synchronously, so the following abort is
        // guaranteed to act on a live, tracked request.
        start(id: "f4")
        let abort = try! JSONSerialization.data(
            withJSONObject: ["kind": "fetch/abort", "id": "f4"]
        )
        _ = port.handle(abort, kind: "fetch/abort")
        wait(for: [settled], timeout: 1)
    }

    func testUnknownFetchKindNotHandled() {
        let data = try! JSONSerialization.data(
            withJSONObject: ["kind": "fetch/response", "id": "z"]
        )
        XCTAssertFalse(port.handle(data, kind: "fetch/response"))
    }
}
