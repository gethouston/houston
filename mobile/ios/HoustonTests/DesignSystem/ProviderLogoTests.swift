import CoreGraphics
import SwiftUI
import XCTest
@testable import Houston

/// The provider marks embed verbatim SVG `d` strings and lean on the shared
/// `SVGPath` decoder plus a pure `ProviderLogoKind` dispatch table. A silent
/// decoder bug would draw a mangled logo; a bad mapping would show the wrong
/// brand. These cover both: decoder fixtures (simple, hand-checkable shapes) and
/// the full id → mark dispatch table.
final class ProviderLogoTests: XCTestCase {

    private func bounds(_ d: String) -> CGRect { SVGPath.rawPath(from: d).boundingRect }

    // MARK: - Decoder fixtures

    func testAbsoluteMoveLineClose() {
        let b = bounds("M0 0 L10 0 L0 10 Z")
        XCTAssertEqual(b.minX, 0, accuracy: 0.001)
        XCTAssertEqual(b.minY, 0, accuracy: 0.001)
        XCTAssertEqual(b.width, 10, accuracy: 0.001)
        XCTAssertEqual(b.height, 10, accuracy: 0.001)
    }

    func testRelativeMoveLine() {
        // `m` establishes (5,5); subsequent pairs are implicit relative line-tos.
        let b = bounds("m5 5 l10 0 l0 10 z")
        XCTAssertEqual(b.minX, 5, accuracy: 0.001)
        XCTAssertEqual(b.minY, 5, accuracy: 0.001)
        XCTAssertEqual(b.width, 10, accuracy: 0.001)
        XCTAssertEqual(b.height, 10, accuracy: 0.001)
    }

    func testHorizontalVerticalCommands() {
        let b = bounds("M0 0 H10 V10 H0 Z")
        XCTAssertEqual(b.width, 10, accuracy: 0.001)
        XCTAssertEqual(b.height, 10, accuracy: 0.001)
    }

    func testCubicCurveReachesEndpoint() {
        // A flat cubic along y=0 ending at (10,0): zero height, width 10.
        let b = bounds("M0 0 C0 0 10 0 10 0")
        XCTAssertEqual(b.maxX, 10, accuracy: 0.01)
        XCTAssertEqual(b.height, 0, accuracy: 0.01)
    }

    func testEllipticalArcSemicircle() {
        // r=5 arc between (0,0) and (10,0) is a semicircle: width 10, bulge 5.
        let b = bounds("M0 0 A5 5 0 0 1 10 0")
        XCTAssertEqual(b.width, 10, accuracy: 0.5)
        XCTAssertEqual(b.height, 5, accuracy: 0.5)
    }

    func testUnknownCommandStopsCleanly() {
        // Parsing must halt at the unsupported `X`, keeping what came before.
        let b = bounds("M0 0 L10 0 X5 5")
        XCTAssertEqual(b.width, 10, accuracy: 0.001)
        XCTAssertEqual(b.height, 0, accuracy: 0.001)
    }

    func testRealProviderPathStaysWithinViewBox() {
        // Integration: a shipped path (Gemini spark) decodes to non-empty
        // geometry inside its 24×24 viewBox.
        let b = bounds(ProviderLogoPaths.gemini)
        XCTAssertGreaterThan(b.width, 1)
        XCTAssertGreaterThan(b.height, 1)
        XCTAssertGreaterThanOrEqual(b.minX, -0.5)
        XCTAssertGreaterThanOrEqual(b.minY, -0.5)
        XCTAssertLessThanOrEqual(b.maxX, 24.5)
        XCTAssertLessThanOrEqual(b.maxY, 24.5)
    }

    // MARK: - fitTransform

    func testFitTransformSquareIsExact() {
        let t = SVGPath.fitTransform(viewBox: CGSize(width: 24, height: 24), in: CGRect(x: 0, y: 0, width: 20, height: 20))
        let origin = CGPoint.zero.applying(t)
        let far = CGPoint(x: 24, y: 24).applying(t)
        XCTAssertEqual(origin.x, 0, accuracy: 0.001)
        XCTAssertEqual(origin.y, 0, accuracy: 0.001)
        XCTAssertEqual(far.x, 20, accuracy: 0.001)
        XCTAssertEqual(far.y, 20, accuracy: 0.001)
    }

    func testFitTransformCentersOnLongAxis() {
        // 24×24 into a 40×20 rect: scale 20/24, centred horizontally (dx=10).
        let t = SVGPath.fitTransform(viewBox: CGSize(width: 24, height: 24), in: CGRect(x: 0, y: 0, width: 40, height: 20))
        let origin = CGPoint.zero.applying(t)
        let far = CGPoint(x: 24, y: 24).applying(t)
        XCTAssertEqual(origin.x, 10, accuracy: 0.001)
        XCTAssertEqual(origin.y, 0, accuracy: 0.001)
        XCTAssertEqual(far.x, 30, accuracy: 0.001)
        XCTAssertEqual(far.y, 20, accuracy: 0.001)
    }

    // MARK: - Dispatch table (mirrors provider-logos.tsx:243-274)

    func testDispatchTable() {
        let expected: [String: ProviderLogoKind] = [
            "anthropic": .claude,
            "openai": .openai,
            "openai-codex": .openai,
            "google": .gemini,
            "gemini": .gemini,
            "github-copilot": .githubCopilot,
            "openrouter": .openRouter,
            "amazon-bedrock": .amazonBedrock,
            "opencode": .opencode,
            "opencode-go": .opencode,
            "openai-compatible": .localModel,
            "deepseek": .deepseek,
            "minimax": .minimax,
        ]
        for (id, kind) in expected {
            XCTAssertEqual(ProviderLogoKind.forProvider(id), kind, "provider id \(id)")
        }
    }

    func testUnknownProviderFallsBackToFirstInitial() {
        XCTAssertEqual(ProviderLogoKind.forProvider("supabase"), .initial("S"))
        XCTAssertEqual(ProviderLogoKind.forProvider("xai"), .initial("X"))
        XCTAssertEqual(ProviderLogoKind.forProvider(""), .initial(""))
    }

    func testSubqIsNotMapped() {
        // SubQ is a text mark on desktop, deliberately not ported — it falls
        // through to the initial fallback rather than a dedicated logo.
        XCTAssertEqual(ProviderLogoKind.forProvider("subq"), .initial("S"))
    }
}
