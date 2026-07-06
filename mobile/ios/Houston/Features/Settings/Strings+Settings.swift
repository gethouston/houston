import Foundation

// Settings-tab copy. Added as a namespaced extension on the shared `Strings`
// (DesignSystem/Strings.swift) so this surface never edits — or collides on —
// that shared file.
//
// PARITY IS LAW: every string below mirrors the EXACT en copy from
// `app/src/locales/en/settings.json` and `common.json` (the keys are noted per
// group). Strings that PARITY-SETTINGS does not pin (the honest "not available
// yet" states iOS shows where the SDK surface is absent, and the tab label) are
// product-voice and flagged as DEVIATIONs — no files/JSON/CLI mentions, no em
// dashes (workspace CLAUDE.md copy rules).
extension Strings {
    enum Settings {
        // Header (settings:title, settings:index.subtitle).
        static let title = "Settings"
        static let subtitle = "Manage your workspace and account."

        // AI Models + Integrations entry rows. DEVIATION: on desktop these are
        // top-level sidebar items (PARITY-SETTINGS §5); the phone folds them into
        // the Settings tab as nav rows. Titles reuse the surfaces' own copy
        // (Strings.AIModels.title / Strings.Integrations.title); this AI-models
        // subtitle is product-voice (the desktop nav item has no subtitle). The
        // integrations subtitle reuses the canonical `integrations:home.description`.
        static let aiModelsRow = "The AI models each agent can use"

        // Workspace name (settings:workspace.title).
        static let workspaceTitle = "Workspace name"

        // Appearance (settings:appearance.*).
        static let appearanceTitle = "Appearance"
        static let appearanceLight = "Light"
        static let appearanceDark = "Dark"

        // Language (settings:nav.language, common:language.toastChanged).
        static let languageTitle = "Language"
        static let languageChanged = "Language changed"

        // Account (settings:account.*).
        static let accountTitle = "Account"
        static let signOut = "Sign out"
        static let accountFallbackName = "Signed in"

        // Context group (settings:index.groups.context, nav.*, index.rows.*,
        // index.values.set).
        static let groupContext = "Context"
        static let workspaceContext = "Workspace context"
        static let userContext = "Your context"
        static let rowWorkspaceContext = "What every agent knows about this workspace"
        static let rowUserContext = "What every agent knows about you"
        static let valueSet = "Set"

        // Workspace-context editor (settings:workspaceContext.*).
        static let workspaceContextEmptyTitle = "Tell every agent about this workspace"
        static let workspaceContextEmptyDescription =
            "The company, the product, the customers. Loaded into every new chat in this workspace."

        // User-context editor (settings:userContext.*).
        static let userContextEmptyTitle = "Tell every agent about you"
        static let userContextEmptyDescription =
            "Your role, what you care about, how you like to work. Loaded into every new chat in this workspace."

        // Support group (settings:index.groups.support, nav.reportBug,
        // index.rows.reportBug).
        static let groupSupport = "Support"
        static let reportBug = "Report bug"
        static let rowReportBug = "Something broke? Tell us"

        // Report-bug editor (settings:reportBug.*).
        static let reportBugIntro =
            "Tell us what went wrong. We'll send your message along with the logs from your last activity so we can see what happened."
        static let reportBugTimingTip =
            "We only get the most recent activity, so send the report as soon as the bug happens for the most useful info."
        static let reportBugLabel = "What happened?"
        static let reportBugPlaceholder =
            "Describe the bug. What were you doing, what did you expect, what happened instead?"
        static let reportBugSend = "Send bug report"

        // Danger zone (settings:dangerZone.*).
        static let dangerTitle = "Danger zone"
        static let dangerDescription = "Permanently delete this workspace and all its agents."
        static let deleteButton = "Delete workspace"
        static let createAnotherFirst = "Create another workspace first before deleting this one."
        static func deleteConfirmTitle(name: String) -> String { "Delete \"\(name)\"?" }
        static let deleteConfirmDescription =
            "This will permanently delete this workspace and all its agents. This cannot be undone."
        static let deleteConfirmLabel = "Delete"

        // Version footer (settings:version, settings:toasts.version*).
        static func version(_ value: String) -> String { "Version \(value)" }
        static let versionCopied = "Version copied"
        static let versionCopyFailed = "Couldn't copy version"

        // MARK: - DEVIATIONS (no PARITY key — SDK surface absent on iOS)

        /// Shown on the read-only workspace-name row: hosted mode fixes the name
        /// server-side and the SDK exposes no rename, so the row can't be edited.
        static let workspaceNameReadOnly = "Managed for you"

        /// Title of the disabled context editors + delete row: the wire surface
        /// is not reachable from the phone yet.
        static let notAvailableYet = "Not available yet"

        /// Body for the disabled context editors.
        static let contextUnavailable =
            "Edit this from Houston on your computer for now. It will come to the phone soon."

        /// Body under the disabled Delete workspace button.
        static let deleteUnavailable =
            "Deleting a workspace is only available in Houston on your computer for now."

        /// Alert title when a settings action fails (no PARITY key; desktop uses
        /// a toast). Body is the surfaced engine reason (never swallowed).
        static let actionFailedTitle = "Something went wrong"
        static let actionFailedDismiss = "OK"
    }
}
