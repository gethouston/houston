import SwiftUI
import UIKit

/// The agent avatar tint. Agents carry a themed hex `color`; when absent the web
/// falls back to Houston gray (`HOUSTON_GRAY` in ui/core houston-avatar.tsx).
/// This is the one token-adjacent literal the design system owns — every other
/// colour comes from `HoustonColors`.
enum AgentColor {
    /// #9b9b9b — the shared Houston-gray helmet fallback (ui/core/houston-avatar.tsx).
    static let fallback = Color(houstonHex: "#9b9b9b") ?? Color(.sRGB, red: 0.608, green: 0.608, blue: 0.608)

    /// Parse an agent's `color` field (hex string) into a SwiftUI `Color`,
    /// returning `nil` for empty/unparseable values so callers fall back cleanly.
    static func parse(_ hex: String?) -> Color? {
        guard let hex, !hex.isEmpty else { return nil }
        return Color(houstonHex: hex)
    }
}

extension Color {
    /// Parse `#rgb`, `#rrggbb`, or `#rrggbbaa` (with or without leading `#`).
    /// Returns nil on malformed input rather than silently drawing black.
    init?(houstonHex raw: String) {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.allSatisfy(\.isHexDigit) else { return nil }

        let expanded: String
        switch s.count {
        case 3: expanded = s.map { "\($0)\($0)" }.joined() + "ff"
        case 6: expanded = s + "ff"
        case 8: expanded = s
        default: return nil
        }
        guard let value = UInt64(expanded, radix: 16) else { return nil }
        self = Color(
            .sRGB,
            red: Double((value >> 24) & 0xff) / 255,
            green: Double((value >> 16) & 0xff) / 255,
            blue: Double((value >> 8) & 0xff) / 255,
            opacity: Double(value & 0xff) / 255
        )
    }
}

/// Per-channel colour blending, approximating CSS `color-mix(in srgb, ...)`.
/// Used for the avatar tint (PARITY §4). Alpha is mixed alongside RGB, so a
/// translucent `secondary` stays translucent — a later pass can move to
/// premultiplied interpolation if a visual diff demands it.
enum ColorMix {
    /// `base * (1 - ratio) + tint * ratio`, channel-wise including alpha.
    static func mix(_ base: Color, _ tint: Color, ratio: Double) -> Color {
        let r = max(0, min(1, ratio))
        let a = components(base)
        let b = components(tint)
        return Color(
            .sRGB,
            red: a.r * (1 - r) + b.r * r,
            green: a.g * (1 - r) + b.g * r,
            blue: a.b * (1 - r) + b.b * r,
            opacity: a.a * (1 - r) + b.a * r
        )
    }

    private static func components(_ color: Color) -> (r: Double, g: Double, b: Double, a: Double) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b), Double(a))
    }
}
