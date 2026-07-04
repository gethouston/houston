import Foundation
import XCTest

@testable import Houston

/// Thread-safe collector for the strings a port writes back through `send`.
final class ReplySink {
    private let lock = NSLock()
    private var buffer: [String] = []
    var onMessage: ((String) -> Void)?

    var send: (String) -> Void { { [weak self] in self?.append($0) } }

    private func append(_ message: String) {
        lock.lock()
        buffer.append(message)
        lock.unlock()
        onMessage?(message)
    }

    var messages: [String] {
        lock.lock(); defer { lock.unlock() }
        return buffer
    }

    /// Decode the collected replies into `[String: Any]` dictionaries.
    func decoded() -> [[String: Any]] {
        messages.compactMap { message in
            guard let data = message.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return nil }
            return obj
        }
    }

    /// Kinds of the collected replies, in order.
    func kinds() -> [String] {
        decoded().compactMap { $0["kind"] as? String }
    }
}

/// In-memory `KeyValueBacking` fake for storage routing tests.
final class FakeBacking: KeyValueBacking {
    /// Publicly mutable so tests can seed and assert on backing state directly
    /// (they exercise `StoragePort` routing, not this fake's encapsulation).
    var store: [String: String] = [:]
    var failRead = false
    var failWrite = false

    struct Boom: Error {}

    func read(_ key: String) throws -> String? {
        if failRead { throw Boom() }
        return store[key]
    }

    func write(_ key: String, _ value: String) throws {
        if failWrite { throw Boom() }
        store[key] = value
    }

    func remove(_ key: String) throws {
        store[key] = nil
    }
}

/// A `URLProtocol` that scripts a streamed response for `FetchPort` tests.
///
/// `hangAfterFirstChunk` leaves the request open after the first chunk so a
/// test can exercise `fetch/abort` and observe the cancel path.
final class MockURLProtocol: URLProtocol {
    struct Stub {
        var status: Int = 200
        var chunks: [Data] = []
        var error: Error?
        var hangAfterFirstChunk = false
    }

    private static let lock = NSLock()
    private static var _stub = Stub()
    private static var _lastRequest: URLRequest?

    static var stub: Stub {
        get { lock.lock(); defer { lock.unlock() }; return _stub }
        set { lock.lock(); _stub = newValue; lock.unlock() }
    }

    static var lastRequest: URLRequest? {
        lock.lock(); defer { lock.unlock() }; return _lastRequest
    }

    static func reset() {
        lock.lock(); _stub = Stub(); _lastRequest = nil; lock.unlock()
    }

    static func session() -> URLSessionConfiguration {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return config
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        MockURLProtocol.lock.lock()
        MockURLProtocol._lastRequest = request
        let stub = MockURLProtocol._stub
        MockURLProtocol.lock.unlock()

        guard let url = request.url,
              let response = HTTPURLResponse(
                  url: url, statusCode: stub.status, httpVersion: nil, headerFields: nil
              )
        else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)

        for (index, chunk) in stub.chunks.enumerated() {
            client?.urlProtocol(self, didLoad: chunk)
            // `hangAfterFirstChunk` leaves the load open (never finishes) so a
            // test can abort mid-stream. Note URLSession may hold this final
            // small chunk in its delegate buffer until the load completes, so
            // callers must gate on `fetch/response`, not `fetch/chunk`.
            if stub.hangAfterFirstChunk, index == 0 { return }
        }
        if let error = stub.error {
            client?.urlProtocol(self, didFailWithError: error)
        } else {
            client?.urlProtocolDidFinishLoading(self)
        }
    }

    override func stopLoading() {}
}
