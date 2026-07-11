import SwiftUI

/// The signed-in shell: a three-tab bar — Agents, Mission Control, Settings.
///
/// Starting a new mission is a top-of-screen compose action on both the Agents
/// tab and Mission Control (their `square.and.pencil` toolbar buttons open the
/// agent picker, then an empty draft chat), not a tab — so this shell is a plain
/// `TabView` with no intercepted center action.
///
/// The Mission Control tab item carries a native badge fed by ``BadgeModel``
/// (the aggregate `needs_you` count across agents — see `PARITY.md` §4).
struct RootTabs: View {
    @Environment(BadgeModel.self) private var badge
    @Environment(\.colorScheme) private var systemScheme

    /// Device-local appearance choice (Settings › Appearance). Read here so the
    /// whole signed-in shell re-themes: nothing else applies `houstonTheme(...)`,
    /// so this is where the app's light/dark resolves. See `AppearancePreference`.
    @AppStorage(AppearancePreference.storageKey) private var appearance = ""

    @State private var selection: Tab = .agents

    private enum Tab: Hashable {
        case agents
        case missionControl
        case settings
    }

    private var themeMode: HoustonTheme {
        AppearancePreference.resolve(
            stored: appearance.isEmpty ? nil : appearance, system: systemScheme)
    }

    var body: some View {
        TabView(selection: $selection) {
            AgentsView()
                .tabItem { Label(Strings.Tabs.agents, systemImage: "person.2") }
                .tag(Tab.agents)

            MissionControlView()
                .tabItem {
                    Label(Strings.Tabs.missionControl, systemImage: "square.stack.3d.up")
                }
                .badge(badge.needsYouCount)
                .tag(Tab.missionControl)

            SettingsView()
                .tabItem {
                    Label(Strings.Tabs.settings, systemImage: "gearshape")
                }
                .tag(Tab.settings)
        }
        .houstonTheme(themeMode)
    }
}
