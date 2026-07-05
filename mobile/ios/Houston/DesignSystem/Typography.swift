import SwiftUI

/// The type scale, built from the generated `HoustonFontSize` / `HoustonFontWeight`
/// tokens. The web stack resolves to the system UI font, so iOS uses the native
/// system font (Dynamic Type friendly) at the token sizes. Never construct
/// `Font.system(size:)` with a raw literal in a feature — add a role here.
enum Typography {
    /// 28 / semibold — page titles ("Mission Control", "Archived").
    static let h1 = Font.system(size: HoustonFontSize.h1, weight: HoustonFontWeight.semibold)
    /// 18 / semibold — section + card titles.
    static let title = Font.system(size: HoustonFontSize.lg, weight: HoustonFontWeight.semibold)
    /// 16 / regular — primary body copy.
    static let body = Font.system(size: HoustonFontSize.base, weight: HoustonFontWeight.regular)
    /// 16 / medium — emphasised body (row labels).
    static let bodyMedium = Font.system(size: HoustonFontSize.base, weight: HoustonFontWeight.medium)
    /// 14 / regular — secondary copy, descriptions, snippets.
    static let callout = Font.system(size: HoustonFontSize.sm, weight: HoustonFontWeight.regular)
    /// 14 / medium — chips, buttons, tags.
    static let label = Font.system(size: HoustonFontSize.sm, weight: HoustonFontWeight.medium)
    /// 12 / regular — captions, metadata, the muted group line above a title.
    static let caption = Font.system(size: HoustonFontSize.xs, weight: HoustonFontWeight.regular)
    /// 12 / semibold — uppercase section headers, count badges.
    static let captionStrong = Font.system(size: HoustonFontSize.xs, weight: HoustonFontWeight.semibold)

    /// Escape hatch for a one-off size that still comes from the token scale.
    static func font(_ size: CGFloat, _ weight: Font.Weight = HoustonFontWeight.regular) -> Font {
        Font.system(size: size, weight: weight)
    }
}
