import SwiftUI

/// The Settings tab, pared to quick-access only (founder ask): **Account**
/// (identity + sign out) and **Appearance** (device-local light/dark). The older
/// rows — workspace name, language, workspace/your context, report bug, danger
/// zone, version footer, and the AI Models / Integrations entry rows — were
/// removed to keep Settings short and focused. AI Models and Integrations still
/// exist in the app; they are simply unreachable from here for now.
///
/// Account identity comes straight off the GCIP session (`UserProfile`);
/// sign-out goes through ``AuthController``. Appearance is `@AppStorage`-backed
/// and device-local (``AppearanceRow`` / ``AppearancePreference``), so this
/// view needs no model.
struct SettingsView: View {
    @Environment(\.theme) private var theme
    @Environment(AuthController.self) private var auth

    private var profile: UserProfile? { auth.session.map(UserProfile.init) }

    var body: some View {
        NavigationStack {
            List {
                AccountSection(profile: profile, onSignOut: signOut)
                appearanceGroup
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(theme.input)
            .navigationTitle(Strings.Settings.title)
        }
        .tint(theme.action)
    }

    private var appearanceGroup: some View {
        Section {
            AppearanceRow()
        } header: {
            SettingsSectionHeader(Strings.Settings.appearanceTitle)
        }
        .listRowBackground(theme.card)
    }

    private func signOut() { Task { await auth.signOut() } }
}
