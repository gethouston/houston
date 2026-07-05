import SwiftUI

// The resolved semantic palette for one theme mode.
//
// Every colour the app draws comes from here. `Theme` wraps the generated
// `HoustonColors` token pairs (packages/design-tokens/dist/swift) and resolves
// each pair against the app's own light/dark mode — matching how the web/desktop
// app toggles `[data-theme]` rather than following the system appearance.
//
// Roles mirror the `--ht-*` CSS custom properties one-for-one. NO raw hex or
// rgba may appear anywhere else in the app; reach for a role on `Theme` instead.
struct Theme: Equatable {
    let mode: HoustonTheme

    // Surfaces
    var background: Color { HoustonColors.background.resolve(mode) }
    var foreground: Color { HoustonColors.foreground.resolve(mode) }
    var card: Color { HoustonColors.card.resolve(mode) }
    var cardFg: Color { HoustonColors.cardFg.resolve(mode) }
    var cardRest: Color { HoustonColors.cardRest.resolve(mode) }
    var popover: Color { HoustonColors.popover.resolve(mode) }
    var popoverFg: Color { HoustonColors.popoverFg.resolve(mode) }
    var canvasGutter: Color { HoustonColors.canvasGutter.resolve(mode) }
    var canvasScreen: Color { HoustonColors.canvasScreen.resolve(mode) }

    // Accents / emphasis
    var primary: Color { HoustonColors.primary.resolve(mode) }
    var primaryFg: Color { HoustonColors.primaryFg.resolve(mode) }
    var secondary: Color { HoustonColors.secondary.resolve(mode) }
    var secondaryFg: Color { HoustonColors.secondaryFg.resolve(mode) }
    var muted: Color { HoustonColors.muted.resolve(mode) }
    var mutedFg: Color { HoustonColors.mutedFg.resolve(mode) }
    var accent: Color { HoustonColors.accent.resolve(mode) }
    var accentFg: Color { HoustonColors.accentFg.resolve(mode) }

    // Status
    var destructive: Color { HoustonColors.destructive.resolve(mode) }
    var destructiveFg: Color { HoustonColors.destructiveFg.resolve(mode) }
    var success: Color { HoustonColors.success.resolve(mode) }
    var successFg: Color { HoustonColors.successFg.resolve(mode) }
    var warning: Color { HoustonColors.warning.resolve(mode) }
    var warningFg: Color { HoustonColors.warningFg.resolve(mode) }
    var highlight: Color { HoustonColors.highlight.resolve(mode) }
    var highlightFg: Color { HoustonColors.highlightFg.resolve(mode) }

    // Chrome
    var border: Color { HoustonColors.border.resolve(mode) }
    var input: Color { HoustonColors.input.resolve(mode) }
    var ring: Color { HoustonColors.ring.resolve(mode) }
    var sidebar: Color { HoustonColors.sidebar.resolve(mode) }
    var sidebarFg: Color { HoustonColors.sidebarFg.resolve(mode) }
    var sidebarBorder: Color { HoustonColors.sidebarBorder.resolve(mode) }
    var sidebarAccent: Color { HoustonColors.sidebarAccent.resolve(mode) }
    var sidebarAccentFg: Color { HoustonColors.sidebarAccentFg.resolve(mode) }

    /// The faint circle tint behind an agent's helmet: `secondary 82% + agentColor 18%`
    /// (PARITY §4). `agentColor` is the agent's themed hex; nil falls back to Houston gray.
    func agentAvatarBackground(_ agentColor: Color?) -> Color {
        ColorMix.mix(secondary, agentColor ?? AgentColor.fallback, ratio: 0.18)
    }
}

private struct ThemeKey: EnvironmentKey {
    static let defaultValue = Theme(mode: .light)
}

extension EnvironmentValues {
    /// The active Houston theme. Read it with `@Environment(\.theme) private var theme`.
    var theme: Theme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

extension View {
    /// Publish a Houston theme mode to the subtree and pin the SwiftUI colour
    /// scheme to it (Houston drives its own light/dark, not the system one).
    func houstonTheme(_ mode: HoustonTheme) -> some View {
        environment(\.theme, Theme(mode: mode))
            .preferredColorScheme(mode == .dark ? .dark : .light)
    }
}
