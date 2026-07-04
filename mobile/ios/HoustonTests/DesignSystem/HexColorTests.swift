import SwiftUI
import UIKit
import XCTest
@testable import Houston

/// The hex parser feeds every agent avatar tint (`agent.color`). A silent
/// mis-parse would draw the wrong helmet colour or fall through to black.
final class HexColorTests: XCTestCase {

    private func channels(_ color: Color) -> (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        return (r, g, b, a)
    }

    func testSixDigitHex() throws {
        let c = try XCTUnwrap(Color(houstonHex: "#3b82f6"))
        let ch = channels(c)
        XCTAssertEqual(ch.r, 59 / 255, accuracy: 0.01)
        XCTAssertEqual(ch.g, 130 / 255, accuracy: 0.01)
        XCTAssertEqual(ch.b, 246 / 255, accuracy: 0.01)
        XCTAssertEqual(ch.a, 1, accuracy: 0.01)
    }

    func testWithoutLeadingHash() {
        XCTAssertNotNil(Color(houstonHex: "9b9b9b"))
    }

    func testThreeDigitShorthandExpands() throws {
        let short = try XCTUnwrap(Color(houstonHex: "#f0a"))
        let long = try XCTUnwrap(Color(houstonHex: "#ff00aa"))
        XCTAssertEqual(channels(short).r, channels(long).r, accuracy: 0.01)
        XCTAssertEqual(channels(short).b, channels(long).b, accuracy: 0.01)
    }

    func testEightDigitAlpha() throws {
        let c = try XCTUnwrap(Color(houstonHex: "#00000080"))
        XCTAssertEqual(channels(c).a, 128 / 255, accuracy: 0.02)
    }

    func testMalformedReturnsNil() {
        XCTAssertNil(Color(houstonHex: "#12"))
        XCTAssertNil(Color(houstonHex: "nothex"))
        XCTAssertNil(Color(houstonHex: ""))
        XCTAssertNil(Color(houstonHex: "#gggggg"))
    }

    func testAgentColorParseFallsBackForEmpty() {
        XCTAssertNil(AgentColor.parse(nil))
        XCTAssertNil(AgentColor.parse(""))
        XCTAssertNotNil(AgentColor.parse("#123456"))
    }
}
