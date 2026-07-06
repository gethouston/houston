import SwiftUI

/// The signed-in shell: a three-tab bar with an intercepted middle tab.
///
/// ## The intercepted "New Mission" tab
/// The middle tab never actually becomes the selected tab. Selecting it is a
/// gesture to *start a new mission*, so we intercept the selection change,
/// present ``NewMissionSheet`` as a modal, and immediately restore whichever
/// real tab the user was on. This is the standard SwiftUI pattern for a
/// "center action tab": drive `TabView` from a `selection` binding, watch it
/// with `onChange`, and veto the sentinel value.
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
    /// The last *real* tab, restored when the New Mission tab is intercepted.
    @State private var lastRealSelection: Tab = .agents
    @State private var presentingNewMission = false

    private enum Tab: Hashable {
        case agents
        case newMission   // sentinel — never actually shown
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

            // Placeholder content: this tab is never displayed. Selecting it is
            // intercepted below to present the New Mission sheet instead.
            Color.clear
                .tabItem {
                    Label(Strings.Tabs.newMission, systemImage: "plus.circle.fill")
                }
                .tag(Tab.newMission)

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
        .onChange(of: selection) { _, newValue in
            guard newValue == .newMission else {
                lastRealSelection = newValue
                return
            }
            // Veto the sentinel: open the sheet, snap selection back.
            presentingNewMission = true
            selection = lastRealSelection
        }
        .sheet(isPresented: $presentingNewMission) {
            NewMissionSheet()
        }
    }
}
