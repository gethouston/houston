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
    static let title = "Integrations"

    /// Global-page hero copy (`home.*`).
    static let homeDescription = "Connect your apps once, then choose which agents can use each one."
    static let connectedTitle = "Connected apps"
    static let usedByNone = "No agents yet"
    static let usedByAll = "All agents"

    /// Not-configured full-screen state (`unavailable`).
    static let unavailable = "Integrations are not available in this setup."

    /// Signed-out full-screen state (`signin.*`).
    static let signinTitle = "Sign in to connect apps"
    static let signinBody =
      "Sign in to Houston to connect your apps. Your accounts stay yours; the agent acts on your behalf."

    /// First-load state (`loading.*`).
    static let loadingTitle = "Loading your integrations"
    static let loadingBody = "Checking your integrations provider…"

    /// Connection status labels (`status.*`).
    static func status(_ status: ConnectionStatus) -> String {
      switch status {
      case .active: return "Connected"
      case .pending: return "Finishing up"
      case .error: return "Needs reconnecting"
      case .unknown(let raw): return raw
      }
    }

    /// Per-app detail sheet (`detail.*`).
    static let detailActiveOn = "Agents that can use this"
    static let detailReconnect = "Reconnect"
    static let detailDisconnect = "Disconnect"
    static let detailNoAgents = "No agents can use this yet. Turn one on above."
    static let detailAllAgentsNote = "Every agent can use this app."

    /// Per-agent grant read failure (mobile-only — the desktop batches grant
    /// reads, so it has no per-agent read-error state). Retriable inline, never a
    /// silent "all agents allowed" fallback (no-silent-failures).
    static let grantsLoadError = "We couldn't load which agents can use this."
    static let grantsRetry = "Try again"

    /// Disconnect-everywhere confirm from the global page (`grants.disconnect.*`).
    static func disconnectConfirmTitle(_ name: String) -> String { "Disconnect \(name) everywhere?" }
    static func disconnectConfirmBody(_ name: String) -> String {
      "This removes \(name) for all of your agents, not just this one. You can reconnect it anytime."
    }
    static let disconnectConfirmAction = "Disconnect everywhere"
    static let cancel = "Cancel"

    /// "Used by N agents" chip line (`disconnect.affected_*`).
    static func usedBy(count: Int) -> String {
      count == 1 ? "Used by 1 agent" : "Used by \(count) agents"
    }

    /// The connect catalog (`connectMore.*`, `picker.*`, `browse.*`).
    static let connectMoreTitle = "Connect more apps"
    static let searchPlaceholder = "Search apps..."
    static let pickerConnected = "Connected"
    static let pickerNoResults = "No matching apps found."
    static let pickerLoading = "Loading apps..."
    static let allCategories = "All categories"
    static func loadMore(remaining count: Int) -> String { "Load more (\(count) remaining)" }

    /// Browser hand-off waiting sheet (`waiting.*`).
    static func waitingTitle(app: String) -> String { "Finish connecting \(app)" }
    static func waitingBody(app: String) -> String {
      "We opened \(app) in your browser. Sign in there, then come back here."
    }
    static let waitingReopen = "Reopen in browser"
    static let waitingCheck = "I have finished"

    /// Poll-outcome error copy (`connectResult.*`).
    static let connectTimeout = "The connection didn't finish. Please try again."
    static let connectFailed = "The app couldn't be connected. Please try again."

    /// Per-agent tab (`agentTab.*`) — reachable from the agent screen later.
    static let agentActiveTitle = "Apps this agent can use"
    static let agentAllAppsTitle = "Your other connected apps"
    static let agentAllAppsSubtitle = "Apps you connected that this agent can't use yet."
    static let agentDeactivate = "Remove from this agent"
    static let agentActivate = "Activate for this agent"
    static let agentEmptyTitle = "No apps yet"
    static let agentEmptyBody = "Add an app so this agent can act on it."
    static let agentManageAll = "Manage all integrations"
  }
}
