import SwiftUI

/// The per-provider monochrome marks, one SwiftUI view per component in
/// `app/src/components/shell/provider-logos.tsx`. Each renders a verbatim SVG
/// path (see `ProviderLogoPaths`) filled or stroked in the theme foreground,
/// defaulting to a 20×20 render — the same actual size the desktop uses.
///
/// Callers usually reach these through `ProviderGlyph(providerId:)` rather than
/// naming one directly.

// MARK: - Filled marks

struct ClaudeLogo: View {
    var size: CGFloat = 20
    var body: some View { FilledProviderLogo(paths: [ProviderLogoPaths.claude], size: size) }
}

struct OpenAILogo: View {
    var size: CGFloat = 20
    var body: some View { FilledProviderLogo(paths: [ProviderLogoPaths.openai], size: size) }
}

struct GeminiLogo: View {
    var size: CGFloat = 20
    var body: some View { FilledProviderLogo(paths: [ProviderLogoPaths.gemini], size: size) }
}

struct GitHubCopilotLogo: View {
    var size: CGFloat = 20
    var body: some View { FilledProviderLogo(paths: [ProviderLogoPaths.githubCopilot], size: size) }
}

struct DeepSeekLogo: View {
    var size: CGFloat = 20
    var body: some View { FilledProviderLogo(paths: [ProviderLogoPaths.deepseek], size: size) }
}

struct MiniMaxLogo: View {
    var size: CGFloat = 20
    var body: some View { FilledProviderLogo(paths: [ProviderLogoPaths.minimax], size: size) }
}

// MARK: - Stroked marks

struct OpenRouterLogo: View {
    var size: CGFloat = 20
    var body: some View {
        StrokedProviderLogo(
            paths: [ProviderLogoPaths.openRouter],
            filledEllipses: [dot(cx: 20, cy: 7), dot(cx: 20, cy: 17)],
            strokeWidth: 2,
            size: size
        )
    }

    /// An r=1.6 dot centred on (cx, cy) in the 24×24 viewBox.
    private func dot(cx: CGFloat, cy: CGFloat, r: CGFloat = 1.6) -> CGRect {
        CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2)
    }
}

/// `LocalModelLogo` — desktop-only in the provider catalog, but ported for
/// completeness and reachable via `ProviderGlyph("openai-compatible")`.
struct LocalModelLogo: View {
    var size: CGFloat = 20
    var body: some View {
        StrokedProviderLogo(
            paths: [ProviderLogoPaths.localModel],
            roundedRects: [.init(rect: CGRect(x: 3, y: 4, width: 18, height: 11), radius: 2)],
            strokeWidth: 2,
            size: size
        )
    }
}

struct AmazonBedrockLogo: View {
    var size: CGFloat = 20
    var body: some View {
        StrokedProviderLogo(paths: ProviderLogoPaths.amazonBedrock, strokeWidth: 1.8, size: size)
    }
}

// MARK: - OpenCode (two-tone)

/// OpenCode's two-tone brand mark (240×300 viewBox). The exact export hexes from
/// `globals.css:41-52` are brand values, not theme roles — an inner block over a
/// border frame ring, each in its own shade per theme. Shared by OpenCode + Go.
struct OpenCodeLogo: View {
    @Environment(\.theme) private var theme
    var size: CGFloat = 20

    private static let viewBox = CGSize(width: 240, height: 300)

    private var blockColor: Color {
        theme.mode == .dark
            ? Color(red: 0x4b / 255, green: 0x46 / 255, blue: 0x46 / 255)
            : Color(red: 0xcf / 255, green: 0xce / 255, blue: 0xcd / 255)
    }

    private var frameColor: Color {
        theme.mode == .dark
            ? Color(red: 0xf1 / 255, green: 0xec / 255, blue: 0xec / 255)
            : Color(red: 0x21 / 255, green: 0x1e / 255, blue: 0x1e / 255)
    }

    var body: some View {
        ZStack {
            FilledProviderLogo(
                viewBox: Self.viewBox, paths: [ProviderLogoPaths.opencodeBlock], size: size, color: blockColor
            )
            FilledProviderLogo(
                viewBox: Self.viewBox, paths: [ProviderLogoPaths.opencodeFrame],
                eoFill: true, size: size, color: frameColor
            )
        }
        .accessibilityHidden(true)
    }
}

// MARK: - First-initial fallback

/// The unknown-provider fallback: the provider id's first initial, mirroring the
/// desktop `<span text-[10px] font-semibold tracking-tight text-muted-foreground>`.
struct ProviderInitialFallback: View {
    @Environment(\.theme) private var theme
    let providerId: String
    var size: CGFloat = 20

    private var initial: String { providerId.isEmpty ? "" : String(providerId.prefix(1)).uppercased() }

    var body: some View {
        Text(initial)
            .font(.system(size: 10, weight: .semibold))
            .tracking(-0.25)
            .foregroundStyle(theme.inkMuted)
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}
