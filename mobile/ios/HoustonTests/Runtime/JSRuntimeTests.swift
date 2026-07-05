import XCTest
@testable import Houston

/// End-to-end host tests over a *fake* bundle written to a temp file. They need
/// only JavaScriptCore (linked into the test process), not the app or the real
/// `houston-sdk.bridge.js`, so they run off-device. They cover message framing
/// (receive→send round-trip), the host-provided polyfills reaching JS, and the
/// uncaught-exception → `onFatal` path.
final class JSRuntimeTests: XCTestCase {
    /// Write JS to a temp `.js` file and return its URL.
    private func writeBundle(_ source: String) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("fake-bridge-\(UUID().uuidString).js")
        try source.write(to: url, atomically: true, encoding: .utf8)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    /// A bridge whose `receive` runs an arbitrary JS body with `msg` + `send` in scope.
    private func fakeBundle(receiveBody: String) -> String {
        """
        var HoustonSdkBridge = {
          create: function (opts) {
            var send = opts.send;
            return {
              receive: function (msg) { \(receiveBody) },
              dispose: function () {}
            };
          }
        };
        """
    }

    func testReceiveSendRoundTrip() throws {
        let url = try writeBundle(fakeBundle(receiveBody: "send('echo:' + msg);"))
        let runtime = JSRuntime(queueLabel: "test.js.roundtrip")
        let got = expectation(description: "send received")
        var payload: String?
        try runtime.load(
            bundleURL: url,
            onSend: { message in payload = message; got.fulfill() },
            onFatal: { XCTFail("unexpected fatal: \($0)") }
        )
        runtime.receive("hello")
        wait(for: [got], timeout: 2)
        XCTAssertEqual(payload, "echo:hello")
        runtime.dispose()
    }

    func testTimerPolyfillReachesJS() throws {
        let body = "setTimeout(function () { send('tick'); }, 10);"
        let url = try writeBundle(fakeBundle(receiveBody: body))
        let runtime = JSRuntime(queueLabel: "test.js.timer")
        let ticked = expectation(description: "timer fired")
        var payload: String?
        try runtime.load(
            bundleURL: url,
            onSend: { message in payload = message; ticked.fulfill() },
            onFatal: { XCTFail("unexpected fatal: \($0)") }
        )
        runtime.receive("go")
        wait(for: [ticked], timeout: 2)
        XCTAssertEqual(payload, "tick")
        runtime.dispose()
    }

    func testCryptoPolyfillReachesJS() throws {
        let body = "send(String(crypto.getRandomValues(new Uint8Array(4)).length));"
        let url = try writeBundle(fakeBundle(receiveBody: body))
        let runtime = JSRuntime(queueLabel: "test.js.crypto")
        let got = expectation(description: "crypto used")
        var payload: String?
        try runtime.load(
            bundleURL: url,
            onSend: { message in payload = message; got.fulfill() },
            onFatal: { XCTFail("unexpected fatal: \($0)") }
        )
        runtime.receive("go")
        wait(for: [got], timeout: 2)
        XCTAssertEqual(payload, "4")
        runtime.dispose()
    }

    func testUncaughtExceptionSurfacesFatal() throws {
        let url = try writeBundle(fakeBundle(receiveBody: "throw new Error('boom');"))
        let runtime = JSRuntime(queueLabel: "test.js.fatal")
        let fatal = expectation(description: "fatal delivered")
        var captured: JSRuntimeError?
        try runtime.load(
            bundleURL: url,
            onSend: { _ in XCTFail("no send expected") },
            onFatal: { error in captured = error; fatal.fulfill() }
        )
        runtime.receive("go")
        wait(for: [fatal], timeout: 2)
        guard case let .uncaughtException(message) = captured else {
            return XCTFail("expected uncaughtException, got \(String(describing: captured))")
        }
        XCTAssertTrue(message.contains("boom"))
        runtime.dispose()
    }

    func testMissingBridgeGlobalThrows() throws {
        let url = try writeBundle("var somethingElse = 1;")
        let runtime = JSRuntime(queueLabel: "test.js.nobridge")
        XCTAssertThrowsError(
            try runtime.load(bundleURL: url, onSend: { _ in }, onFatal: { _ in })
        ) { error in
            XCTAssertEqual(error as? JSRuntimeError, .bridgeGlobalMissing)
        }
    }

    func testUnreadableBundleThrows() {
        let url = URL(fileURLWithPath: "/nonexistent/houston-sdk.bridge.js")
        let runtime = JSRuntime(queueLabel: "test.js.unreadable")
        XCTAssertThrowsError(
            try runtime.load(bundleURL: url, onSend: { _ in }, onFatal: { _ in })
        ) { error in
            guard case .bundleUnreadable = (error as? JSRuntimeError) else {
                return XCTFail("expected bundleUnreadable, got \(error)")
            }
        }
    }
}
