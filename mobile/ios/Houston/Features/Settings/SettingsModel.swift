import Foundation
import Observation
import os

/// The Settings-tab view-model: the small amount of state the grouped list binds
/// to. It owns NO behavior of its own beyond wiring the reachable SDK commands
/// (client-architecture.md invariant 1) — locale read/write and resolving the
/// workspace id/name from the `agents` scope.
///
/// SDK-SURFACE REALITY (drives what the UI can and can't do — PARITY-SETTINGS §1,
/// §4 "SDK gaps"). The iOS path is Swift → `@houston/sdk` → `@houston/runtime-client`,
/// which exposes exactly: `preferences/get`, `preferences/set`, `workspace/setLocale`,
/// and the `agents` scope. It does NOT expose:
///   - a workspace rename (and hosted mode fixes the name server-side) → the
///     name row is READ-ONLY,
///   - any workspace read (`GET /v1/workspaces` is unwrapped) → the name is only
///     known once `workspace/setLocale` echoes a `Workspace`,
///   - workspace-context / user-context docs → those editors are DISABLED,
///   - a workspace delete or a workspace list/count → Delete is DISABLED and the
///     "blocked if last" rule can't be evaluated.
/// Each gap is rendered honestly (read-only / disabled) and reported.
@MainActor
@Observable
final class SettingsModel {
    /// Compile-time facts of the reachable SDK surface (see the type doc).
    static let renameAvailable = false
    static let contextAvailable = false
    static let deleteAvailable = false

    private let client: SdkClient
    private let log = Logger(subsystem: "ai.gethouston.app", category: "settings")

    private let agentsStore: ScopeStore<AgentsViewModel>
    private var agentsRetention: ScopeRetention?

    /// The workspace record, cached from a `workspace/setLocale` response. `nil`
    /// until the first locale write, because no SDK call reads a workspace.
    private(set) var workspace: Workspace?

    /// The locale the picker shows. Optimistically set on selection, reverted if
    /// the engine write fails.
    private(set) var locale: AppLocale = .en
    private(set) var localeLoaded = false

    /// The last user-action failure, surfaced as an alert (never swallowed).
    var errorMessage: String?

    init(client: SdkClient = .shared) {
        self.client = client
        agentsStore = client.scope(SdkScope.agents, as: AgentsViewModel.self)
    }

    /// The current workspace id, resolved from the agent list (personal tier →
    /// one workspace, so every agent shares it). `nil` before agents load or in
    /// an empty workspace.
    var workspaceId: String? { agentsStore.snapshot?.items.first?.workspaceId }

    /// The workspace name to show read-only, once known.
    var workspaceName: String? { workspace?.name }

    // MARK: Lifecycle

    /// Retain the `agents` scope (so `workspaceId` resolves) and load the current
    /// locale. Idempotent — safe to call from `.onAppear`.
    func start() {
        guard agentsRetention == nil else { return }
        agentsRetention = agentsStore.retain()
        Task {
            await refreshAgents()
            await loadLocale()
        }
    }

    /// Release the `agents` subscription when the tab goes away.
    func stop() {
        agentsRetention?.cancel()
        agentsRetention = nil
    }

    // MARK: Locale

    /// Switch language: optimistically reflect the choice, persist to the engine,
    /// revert + surface on failure.
    func changeLocale(_ next: AppLocale) async {
        guard next != locale else { return }
        let previous = locale
        locale = next
        do {
            try await persistLocale(next)
        } catch {
            locale = previous
            errorMessage = error.localizedDescription
            log.error("setLocale failed: \(String(describing: error), privacy: .public)")
        }
    }

    private func loadLocale() async {
        do {
            let value: String? = try await client.command(
                Command.getPreference, GetPreferencePayload(key: Self.localeKey))
            locale = AppLocale.selection(for: value)
        } catch {
            locale = .en
            log.error("load locale failed: \(String(describing: error), privacy: .public)")
        }
        localeLoaded = true
    }

    /// Parity path: PATCH the workspace's locale override, which also echoes the
    /// `Workspace` (the sole SDK source of the workspace name). Without a
    /// workspace id (empty workspace) fall back to the user-scoped global locale
    /// preference so the choice still persists — an engine write, not a no-op.
    private func persistLocale(_ next: AppLocale) async throws {
        if let workspaceId {
            let updated: Workspace = try await client.command(
                Command.setLocale,
                SetLocalePayload(workspaceId: workspaceId, locale: next.rawValue))
            workspace = updated
        } else {
            let _: String? = try await client.command(
                Command.setPreference,
                SetPreferencePayload(key: Self.localeKey, value: next.rawValue))
        }
    }

    private func refreshAgents() async {
        do {
            let _: SdkVoid = try await client.command(Command.agentsRefresh)
        } catch {
            log.error("agents/refresh failed: \(String(describing: error), privacy: .public)")
        }
    }

    /// The engine preference key for the UI locale (`LOCALE_PREF_KEY`,
    /// `app/src/lib/locale.ts`).
    private static let localeKey = "locale"

    /// The reachable command types (mirror the SDK command constants —
    /// `PreferencesCommand`, `AgentsCommand`).
    private enum Command {
        static let getPreference = "preferences/get"
        static let setPreference = "preferences/set"
        static let setLocale = "workspace/setLocale"
        static let agentsRefresh = "agents/refresh"
    }
}
