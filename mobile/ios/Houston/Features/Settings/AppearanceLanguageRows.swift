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

/// The Language row: an en/es/pt menu bound to ``SettingsModel``. Selecting one
/// persists to the engine (`workspace/setLocale`, with a `preferences/set`
/// fallback) and toasts "Language changed"; a failed write reverts and surfaces
/// (the model owns that logic).
struct LanguageRow: View {
    @Environment(\.theme) private var theme
    let model: SettingsModel
    let onChanged: () -> Void

    var body: some View {
        HStack(spacing: Spacing.space12) {
            Text(Strings.Settings.languageTitle)
                .font(Typography.bodyMedium)
                .foregroundStyle(theme.foreground)
            Spacer(minLength: Spacing.space8)
            Picker(
                Strings.Settings.languageTitle,
                selection: Binding(get: { model.locale }, set: select)
            ) {
                ForEach(AppLocale.allCases) { locale in
                    Text(locale.displayName).tag(locale)
                }
            }
            .pickerStyle(.menu)
            .labelsHidden()
            .tint(theme.foreground)
            .disabled(!model.localeLoaded)
        }
    }

    private func select(_ next: AppLocale) {
        guard next != model.locale else { return }
        Task {
            await model.changeLocale(next)
            if model.locale == next { onChanged() }  // toast only when it stuck
        }
    }
}
