import SwiftUI

// The resolved semantic palette for one theme mode.
//
// Every colour the app draws comes from here. `Theme` wraps the generated
// `HoustonColors` token pairs (packages/design-tokens/dist/swift) and resolves
// each pair against the app's own light/dark mode, matching how the web/desktop
// app toggles `[data-theme]` rather than following the system appearance.
//
// Roles mirror the `--ht-*` CSS custom properties one-for-one. NO raw hex or
// rgba may appear anywhere else in the app; reach for a role on `Theme` instead.
struct Theme: Equatable {
    let mode: HoustonTheme

    // Grounds — base (the app frame) then background (the main pane) then input (the white surface)
    var base: Color { HoustonColors.base.resolve(mode) }
    var background: Color { HoustonColors.background.resolve(mode) }
    var input: Color { HoustonColors.input.resolve(mode) }

    // Ink (text)
    var ink: Color { HoustonColors.ink.resolve(mode) }
    var inkMuted: Color { HoustonColors.inkMuted.resolve(mode) }

    // Elevated surfaces
    var card: Color { HoustonColors.card.resolve(mode) }
    var cardText: Color { HoustonColors.cardText.resolve(mode) }
    var cardSolid: Color { HoustonColors.cardSolid.resolve(mode) }
    var popover: Color { HoustonColors.popover.resolve(mode) }
    var popoverText: Color { HoustonColors.popoverText.resolve(mode) }

    // Accents / emphasis
    var action: Color { HoustonColors.action.resolve(mode) }
    var actionText: Color { HoustonColors.actionText.resolve(mode) }
    var chip: Color { HoustonColors.chip.resolve(mode) }
    var chipText: Color { HoustonColors.chipText.resolve(mode) }
    var chipSubtle: Color { HoustonColors.chipSubtle.resolve(mode) }
    var hover: Color { HoustonColors.hover.resolve(mode) }
    var hoverText: Color { HoustonColors.hoverText.resolve(mode) }

    // Status
    var danger: Color { HoustonColors.danger.resolve(mode) }
    var dangerText: Color { HoustonColors.dangerText.resolve(mode) }
    var success: Color { HoustonColors.success.resolve(mode) }
    var successText: Color { HoustonColors.successText.resolve(mode) }
    var warning: Color { HoustonColors.warning.resolve(mode) }
    var warningText: Color { HoustonColors.warningText.resolve(mode) }
    var highlight: Color { HoustonColors.highlight.resolve(mode) }
    var highlightText: Color { HoustonColors.highlightText.resolve(mode) }

    // Chrome
    var line: Color { HoustonColors.line.resolve(mode) }
    var lineInput: Color { HoustonColors.lineInput.resolve(mode) }
    var focus: Color { HoustonColors.focus.resolve(mode) }
    var sidebar: Color { HoustonColors.sidebar.resolve(mode) }
    var sidebarText: Color { HoustonColors.sidebarText.resolve(mode) }
    var sidebarLine: Color { HoustonColors.sidebarLine.resolve(mode) }
    var sidebarHover: Color { HoustonColors.sidebarHover.resolve(mode) }
    var sidebarHoverText: Color { HoustonColors.sidebarHoverText.resolve(mode) }

    /// The faint circle tint behind an agent's helmet: `chip 82% + agentColor 18%`
    /// (PARITY §4). `agentColor` is the agent's themed hex; nil falls back to Houston gray.
    func agentAvatarBackground(_ agentColor: Color?) -> Color {
        ColorMix.mix(chip, agentColor ?? AgentColor.fallback, ratio: 0.18)
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
