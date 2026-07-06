import SwiftUI

/// The Settings tab: a grouped list (the iOS idiom for the desktop
/// SettingsView/SettingsIndex — PARITY-SETTINGS §1, §5). Groups follow the
/// desktop order: top card (Workspace name · Appearance · Language) → Account →
/// Context → Support → Danger zone → Version footer.
///
/// Behavior lives in ``SettingsModel`` (locale + workspace) and ``AuthController``
/// (account + sign out); this view only binds them to native rows. The gaps in
/// the reachable SDK surface (rename, context docs, delete — see `SettingsModel`)
/// are rendered read-only / disabled, never faked.
struct SettingsView: View {
    @Environment(\.theme) private var theme
    @Environment(AuthController.self) private var auth

    @State private var model = SettingsModel()
    @State private var path: [SettingsRoute] = []
    @State private var toast: String?

    private var profile: UserProfile? { UserProfile.decode(jwt: auth.session?.accessToken) }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                topGroup
                connectGroup
                AccountSection(profile: profile, onSignOut: signOut)
                contextGroup
                supportGroup
                DangerZoneSection()
                VersionFooter(onCopied: { showToast(Strings.Settings.versionCopied) })
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(theme.background)
            .navigationTitle(Strings.Settings.title)
            .navigationDestination(for: SettingsRoute.self, destination: destination)
        }
        .tint(theme.primary)
        .onAppear { model.start() }
        .onDisappear { model.stop() }
        .settingsToast(toast)
        .alert(
            Strings.Settings.actionFailedTitle,
            isPresented: Binding(
                get: { model.errorMessage != nil },
                set: { if !$0 { model.errorMessage = nil } })
        ) {
            Button(Strings.Settings.actionFailedDismiss, role: .cancel) { model.errorMessage = nil }
        } message: {
            if let message = model.errorMessage { Text(message) }
        }
    }

    // MARK: Groups

    private var topGroup: some View {
        Section {
            WorkspaceNameRow(name: model.workspaceName)
            AppearanceRow()
            LanguageRow(model: model, onChanged: { showToast(Strings.Settings.languageChanged) })
        }
        .listRowBackground(theme.card)
    }

    /// AI Models + Integrations. On desktop these are top-level sidebar peers of
    /// Settings (PARITY-SETTINGS §5); the phone reaches them as nav rows from the
    /// Settings tab. Both surfaces render inside this stack (AI Models opens its
    /// own agent picker, Integrations reads the user-scoped `integrations` scope).
    private var connectGroup: some View {
        Section {
            NavigationLink(value: SettingsRoute.aiModels) {
                SettingsLabeledRow(title: Strings.AIModels.title, subtitle: Strings.Settings.aiModelsRow)
            }
            NavigationLink(value: SettingsRoute.integrations) {
                SettingsLabeledRow(
                    title: Strings.Integrations.title, subtitle: Strings.Integrations.homeDescription)
            }
        }
        .listRowBackground(theme.card)
    }

    private var contextGroup: some View {
        Section {
            ContextRow(title: Strings.Settings.workspaceContext, subtitle: Strings.Settings.rowWorkspaceContext)
            ContextRow(title: Strings.Settings.userContext, subtitle: Strings.Settings.rowUserContext)
        } header: {
            SettingsSectionHeader(Strings.Settings.groupContext)
        }
        .listRowBackground(theme.card)
    }

    private var supportGroup: some View {
        Section {
            NavigationLink(value: SettingsRoute.reportBug) {
                SettingsLabeledRow(title: Strings.Settings.reportBug, subtitle: Strings.Settings.rowReportBug)
            }
        } header: {
            SettingsSectionHeader(Strings.Settings.groupSupport)
        }
        .listRowBackground(theme.card)
    }

    @ViewBuilder private func destination(_ route: SettingsRoute) -> some View {
        switch route {
        case .reportBug: ReportBugView()
        case .aiModels: AIModelsView()
        case .integrations: IntegrationsView()
        }
    }

    // MARK: Actions

    private func signOut() { Task { await auth.signOut() } }

    private func showToast(_ text: String) {
        toast = text
        Task {
            try? await Task.sleep(for: .seconds(1.6))
            if toast == text { toast = nil }
        }
    }
}

/// The Settings drill-in routes (only Report bug has a real editor; the context
/// editors are disabled inline, so they are not routes — see `ContextRow`).
enum SettingsRoute: Hashable {
    case reportBug
    /// The global AI Models entry (opens an agent picker — credentials are
    /// per-agent-pod, PARITY-SETTINGS landmine 1).
    case aiModels
    /// The global, user-scoped Integrations surface.
    case integrations
}
