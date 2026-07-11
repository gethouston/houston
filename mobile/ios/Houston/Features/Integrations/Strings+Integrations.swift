import Foundation

// Integrations-surface copy, mirrored VERBATIM from the desktop locale file
// (`app/src/locales/en/integrations.json`) — PARITY-SETTINGS §3 is law. Added as
// a namespaced extension on the shared `Strings` (DesignSystem/Strings.swift) so
// this surface never edits — or collides on — that shared file.
//
// Interpolated keys ({{name}}, {{app}}, {{count}}) become functions; the rest are
// plain `static let`s. es/pt mirror these keys in the desktop bundle.
extension Strings {
  enum Integrations {
    /// Tab / navigation title (`title`).
    static let title = String(localized: "integrations.title", defaultValue: "Integrations")

    /// Global-page hero copy (`home.*`).
    static let homeDescription = String(localized: "integrations.homeDescription", defaultValue: "Connect your apps once, then choose which agents can use each one.")
    static let connectedTitle = String(localized: "integrations.connectedTitle", defaultValue: "Connected apps")
    static let usedByNone = String(localized: "integrations.usedByNone", defaultValue: "No agents yet")
    static let usedByAll = String(localized: "integrations.usedByAll", defaultValue: "All agents")

    /// Not-configured full-screen state (`unavailable`).
    static let unavailable = String(localized: "integrations.unavailable", defaultValue: "Integrations are not available in this setup.")

    /// Signed-out full-screen state (`signin.*`).
    static let signinTitle = String(localized: "integrations.signinTitle", defaultValue: "Sign in to connect apps")
    static let signinBody =
      String(localized: "integrations.signinBody", defaultValue: "Sign in to Houston to connect your apps. Your accounts stay yours; the agent acts on your behalf.")

    /// First-load state (`loading.*`).
    static let loadingTitle = String(localized: "integrations.loadingTitle", defaultValue: "Loading your integrations")
    static let loadingBody = String(localized: "integrations.loadingBody", defaultValue: "Checking your integrations provider…")

    /// Connection status labels (`status.*`).
    static func status(_ status: ConnectionStatus) -> String {
      switch status {
      case .active: return String(localized: "integrations.status.active", defaultValue: "Connected")
      case .pending: return String(localized: "integrations.status.pending", defaultValue: "Finishing up")
      case .error: return String(localized: "integrations.status.error", defaultValue: "Needs reconnecting")
      case .unknown(let raw): return raw
      }
    }

    /// Per-app detail sheet (`detail.*`).
    static let detailActiveOn = String(localized: "integrations.detailActiveOn", defaultValue: "Agents that can use this")
    static let detailReconnect = String(localized: "integrations.detailReconnect", defaultValue: "Reconnect")
    static let detailDisconnect = String(localized: "integrations.detailDisconnect", defaultValue: "Disconnect")
    static let detailNoAgents = String(localized: "integrations.detailNoAgents", defaultValue: "No agents can use this yet. Turn one on above.")
    static let detailAllAgentsNote = String(localized: "integrations.detailAllAgentsNote", defaultValue: "Every agent can use this app.")

    /// Per-agent grant read failure (mobile-only — the desktop batches grant
    /// reads, so it has no per-agent read-error state). Retriable inline, never a
    /// silent "all agents allowed" fallback (no-silent-failures).
    static let grantsLoadError = String(localized: "integrations.grantsLoadError", defaultValue: "We couldn't load which agents can use this.")
    static let grantsRetry = String(localized: "integrations.grantsRetry", defaultValue: "Try again")

    /// Disconnect-everywhere confirm from the global page (`grants.disconnect.*`).
    static func disconnectConfirmTitle(_ name: String) -> String { String(localized: "integrations.disconnectConfirmTitle", defaultValue: "Disconnect \(name) everywhere?") }
    static func disconnectConfirmBody(_ name: String) -> String {
      String(localized: "integrations.disconnectConfirmBody", defaultValue: "This removes \(name) for all of your agents, not just this one. You can reconnect it anytime.")
    }
    static let disconnectConfirmAction = String(localized: "integrations.disconnectConfirmAction", defaultValue: "Disconnect everywhere")
    static let cancel = String(localized: "integrations.cancel", defaultValue: "Cancel")

    /// "Used by N agents" chip line (`disconnect.affected_*`).
    static func usedBy(count: Int) -> String {
      String(localized: "integrations.usedBy", defaultValue: "Used by \(count) agents")
    }

    /// The connect catalog (`connectMore.*`, `picker.*`, `browse.*`).
    static let connectMoreTitle = String(localized: "integrations.connectMoreTitle", defaultValue: "Connect more apps")
    static let searchPlaceholder = String(localized: "integrations.searchPlaceholder", defaultValue: "Search apps...")
    static let pickerConnected = String(localized: "integrations.pickerConnected", defaultValue: "Connected")
    static let pickerNoResults = String(localized: "integrations.pickerNoResults", defaultValue: "No matching apps found.")
    static let pickerLoading = String(localized: "integrations.pickerLoading", defaultValue: "Loading apps...")
    static let allCategories = String(localized: "integrations.allCategories", defaultValue: "All categories")
    static func loadMore(remaining count: Int) -> String { String(localized: "integrations.loadMore", defaultValue: "Load more (\(count) remaining)") }

    /// Browser hand-off waiting sheet (`waiting.*`).
    static func waitingTitle(app: String) -> String { String(localized: "integrations.waitingTitle", defaultValue: "Finish connecting \(app)") }
    static func waitingBody(app: String) -> String {
      String(localized: "integrations.waitingBody", defaultValue: "We opened \(app) in your browser. Sign in there, then come back here.")
    }
    static let waitingReopen = String(localized: "integrations.waitingReopen", defaultValue: "Reopen in browser")
    static let waitingCheck = String(localized: "integrations.waitingCheck", defaultValue: "I have finished")

    /// Poll-outcome error copy (`connectResult.*`).
    static let connectTimeout = String(localized: "integrations.connectTimeout", defaultValue: "The connection didn't finish. Please try again.")
    static let connectFailed = String(localized: "integrations.connectFailed", defaultValue: "The app couldn't be connected. Please try again.")

    /// Per-agent tab (`agentTab.*`) — reachable from the agent screen later.
    static let agentActiveTitle = String(localized: "integrations.agentActiveTitle", defaultValue: "Apps this agent can use")
    static let agentAllAppsTitle = String(localized: "integrations.agentAllAppsTitle", defaultValue: "Your other connected apps")
    static let agentAllAppsSubtitle = String(localized: "integrations.agentAllAppsSubtitle", defaultValue: "Apps you connected that this agent can't use yet.")
    static let agentDeactivate = String(localized: "integrations.agentDeactivate", defaultValue: "Remove from this agent")
    static let agentActivate = String(localized: "integrations.agentActivate", defaultValue: "Activate for this agent")
    static let agentEmptyTitle = String(localized: "integrations.agentEmptyTitle", defaultValue: "No apps yet")
    static let agentEmptyBody = String(localized: "integrations.agentEmptyBody", defaultValue: "Add an app so this agent can act on it.")
    static let agentManageAll = String(localized: "integrations.agentManageAll", defaultValue: "Manage all integrations")
  }
}
