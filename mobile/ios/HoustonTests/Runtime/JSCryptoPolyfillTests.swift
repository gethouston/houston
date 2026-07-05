import XCTest
@testable import Houston

/// Pure tests for the CSPRNG backing `crypto.getRandomValues`. No JavaScriptCore.
final class JSCryptoPolyfillTests: XCTestCase {
    func testZeroCountReturnsEmpty() {
        XCTAssertTrue(JSCryptoPolyfill.randomBytes(count: 0).isEmpty)
    }

    func testNegativeCountReturnsEmpty() {
        XCTAssertTrue(JSCryptoPolyfill.randomBytes(count: -4).isEmpty)
    }

    func testReturnsRequestedLength() {
        XCTAssertEqual(JSCryptoPolyfill.randomBytes(count: 32).count, 32)
        XCTAssertEqual(JSCryptoPolyfill.randomBytes(count: 1).count, 1)
    }

    func testSuccessiveDrawsDiffer() {
        // A 32-byte collision is a ~2^-256 event; a repeated all-zero buffer would
        // catch a broken fill. Assert both non-zero and non-equal.
        let a = JSCryptoPolyfill.randomBytes(count: 32)
        let b = JSCryptoPolyfill.randomBytes(count: 32)
        XCTAssertNotEqual(a, b)
        XCTAssertFalse(a.allSatisfy { $0 == 0 }, "buffer must not be left zeroed")
    }
}
