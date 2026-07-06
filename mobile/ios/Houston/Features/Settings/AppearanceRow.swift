import SwiftUI

/// The Appearance row: a Light/Dark segmented control, DEVICE-LOCAL via
/// `@AppStorage` (PARITY-SETTINGS §1 — theme has no wire). Writing the key both
/// reflects here and re-themes the whole app: `RootTabs` reads the same key to
/// apply `houstonTheme(...)`.
struct AppearanceRow: View {
    @Environment(\.theme) private var theme
    @Environment(\.colorScheme) private var systemScheme
    @AppStorage(AppearancePreference.storageKey) private var stored = ""

    private var selection: AppearancePreference {
        AppearancePreference.selection(stored: stored.isEmpty ? nil : stored, system: systemScheme)
    }

    var body: some View {
        HStack(spacing: Spacing.space12) {
            Text(Strings.Settings.appearanceTitle)
                .font(Typography.bodyMedium)
                .foregroundStyle(theme.foreground)
            Spacer(minLength: Spacing.space8)
            Picker(
                Strings.Settings.appearanceTitle,
                selection: Binding(get: { selection }, set: { stored = $0.rawValue })
            ) {
                ForEach(AppearancePreference.allCases) { option in
                    Text(option.label).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .fixedSize()
        }
    }
}
