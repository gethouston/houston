import SwiftUI
import XCTest

@testable import Houston

/// The device-local appearance resolution (PARITY-SETTINGS §1: theme has no
/// wire). A pinned choice wins; unset (or an unrecognized value) follows the
/// device's system scheme.
final class AppearanceTests: XCTestCase {
    func testStoredChoiceWinsOverSystem() {
        XCTAssertEqual(AppearancePreference.resolve(stored: "light", system: .dark), .light)
        XCTAssertEqual(AppearancePreference.resolve(stored: "dark", system: .light), .dark)
    }

    func testUnsetFollowsSystem() {
        XCTAssertEqual(AppearancePreference.resolve(stored: nil, system: .dark), .dark)
        XCTAssertEqual(AppearancePreference.resolve(stored: nil, system: .light), .light)
    }

    func testUnrecognizedValueFollowsSystem() {
        XCTAssertEqual(AppearancePreference.resolve(stored: "sepia", system: .dark), .dark)
        XCTAssertEqual(AppearancePreference.resolve(stored: "", system: .light), .light)
    }

    func testSelectionProjectsOntoTwoOptions() {
        XCTAssertEqual(AppearancePreference.selection(stored: nil, system: .dark), .dark)
        XCTAssertEqual(AppearancePreference.selection(stored: "light", system: .dark), .light)
    }
}
