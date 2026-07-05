import SwiftUI

/// The Houston brand mark: the helmet glyph (`HelmetShape`) rendered in the
/// foreground colour. Used on the sign-in surface as the app wordless logo.
///
/// It carries no intrinsic size — it fills whatever frame the caller assigns
/// (`SignInView` sizes it 48×48). Theme is derived from `colorScheme` the same
/// way `SignInView` does, so the mark stays correct regardless of whether the
/// `\.theme` environment value has been injected on the surrounding hierarchy.
struct HoustonMark: View {
    @Environment(\.colorScheme) private var colorScheme

    private var theme: HoustonTheme { colorScheme == .dark ? .dark : .light }

    var body: some View {
        HelmetShape()
            .fill(HoustonColors.foreground.resolve(theme))
            .accessibilityHidden(true)
    }
}
