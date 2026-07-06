import XCTest

@testable import Houston

/// The locale normalization + selection logic (mirrors `normalizeLocale` /
/// `currentLocale` in the desktop, `app/src/lib/locale.ts`).
final class SettingsLocaleTests: XCTestCase {
    func testNormalizeExactTags() {
        XCTAssertEqual(AppLocale.normalize("en"), .en)
        XCTAssertEqual(AppLocale.normalize("es"), .es)
        XCTAssertEqual(AppLocale.normalize("pt"), .pt)
    }

    func testNormalizeReducesRegionVariants() {
        XCTAssertEqual(AppLocale.normalize("pt-BR"), .pt)
        XCTAssertEqual(AppLocale.normalize("es_419"), .es)
        XCTAssertEqual(AppLocale.normalize("EN-US"), .en)
    }

    func testNormalizeRejectsUnknownAndEmpty() {
        XCTAssertNil(AppLocale.normalize("fr"))
        XCTAssertNil(AppLocale.normalize("de-DE"))
        XCTAssertNil(AppLocale.normalize(""))
        XCTAssertNil(AppLocale.normalize(nil))
    }

    func testSelectionFallsBackToEnglish() {
        XCTAssertEqual(AppLocale.selection(for: "pt-BR"), .pt)
        XCTAssertEqual(AppLocale.selection(for: nil), .en)
        XCTAssertEqual(AppLocale.selection(for: "fr"), .en)
    }

    func testDisplayNamesMatchDesktop() {
        XCTAssertEqual(AppLocale.en.displayName, "English")
        XCTAssertEqual(AppLocale.es.displayName, "Español")
        XCTAssertEqual(AppLocale.pt.displayName, "Português")
    }
}
