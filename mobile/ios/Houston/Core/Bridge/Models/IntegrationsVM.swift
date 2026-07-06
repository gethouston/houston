import Foundation

/// A connectable app in the Composio catalog (`IntegrationToolkit`,
/// `packages/runtime-client/src/types.ts`). `logoUrl` is a REMOTE image
/// (AsyncImage) — unlike provider logos, which are inline SVG (PARITY-SETTINGS
/// §7). Decodes tolerantly: unknown JSON members are ignored.
struct IntegrationToolkit: Decodable, Equatable, Identifiable, Sendable {
  /// The stable slug (`[a-z0-9_-]+`), also the grant key. Serves as `id`.
  let slug: String
  let name: String
  var description: String?
  var logoUrl: String?
  var categories: [String]?

  var id: String { slug }
}

/// The OAuth status of one connected account (`IntegrationConnection.status`).
/// Tolerant: an unrecognized value is preserved verbatim (BRIDGE.md §4).
enum ConnectionStatus: Decodable, Equatable, Sendable {
  case active
  case pending
  case error
  case unknown(String)

  init(raw: String) {
    switch raw {
    case "active": self = .active
    case "pending": self = .pending
    case "error": self = .error
    default: self = .unknown(raw)
    }
  }

  init(from decoder: Decoder) throws {
    self.init(raw: try decoder.singleValueContainer().decode(String.self))
  }
}

/// One of the acting user's connected accounts for a toolkit
/// (`IntegrationConnection`, types.ts §62-66).
struct IntegrationConnection: Decodable, Equatable, Identifiable, Sendable {
  let toolkit: String
  let connectionId: String
  let status: ConnectionStatus

  var id: String { connectionId }
}

/// Why integrations are not usable when `ready` is false
/// (`IntegrationsUnavailableReason`, integrations/types.ts §32):
///  - ``unavailable`` — the gateway has no Composio key (503); the tab shows the
///    "not available in this setup" message. Never crashes the tab.
///  - ``signin`` — the provider needs a Houston sign-in first.
/// A 401 is NOT a reason here — it routes through the shared `tokenExpired`
/// signal. An unrecognized value is preserved verbatim.
enum IntegrationsUnavailableReason: Decodable, Equatable, Sendable {
  case unavailable
  case signin
  case unknown(String)

  init(raw: String) {
    switch raw {
    case "unavailable": self = .unavailable
    case "signin": self = .signin
    default: self = .unknown(raw)
    }
  }

  init(from decoder: Decoder) throws {
    self.init(raw: try decoder.singleValueContainer().decode(String.self))
  }
}

/// The snapshot published under the `integrations` scope
/// (`IntegrationsViewModel`, integrations/types.ts §35-46). `loaded` is `false`
/// while loading / never fetched; `reason` is present only when `ready` is false.
struct IntegrationsViewModel: Decodable, Equatable, Sendable {
  let loaded: Bool
  let ready: Bool
  var reason: IntegrationsUnavailableReason?
  let toolkits: [IntegrationToolkit]
  let connections: [IntegrationConnection]
}

/// The result of a `integrations/connect` command: the URL the surface opens
/// (OAuth), plus the id to poll (`ConnectResult`, integrations/index.ts §47-50).
struct ConnectResult: Decodable, Equatable, Sendable {
  let redirectUrl: String
  let connectionId: String
}

// MARK: - Command payloads (`packages/sdk/src/modules/integrations`)

/// `integrations/connect` + `integrations/disconnect` — the toolkit slug.
struct IntegrationToolkitPayload: Encodable, Sendable {
  let toolkit: String
}

/// `integrations/pollConnection` — the connection id to poll.
struct PollConnectionPayload: Encodable, Sendable {
  let connectionId: String
}

/// `integrations/grants` — read the agent's granted toolkit slugs. The RESULT is
/// decoded as `[String]?`: **`null` means grants are UNSUPPORTED (no toggles),
/// distinct from `[]` which means nothing is granted** (PARITY-SETTINGS §3, the
/// 404-null vs empty-array landmine). Decoding a JSON `null` yields `nil`.
struct IntegrationGrantsPayload: Encodable, Sendable {
  let agentId: String
}

/// `integrations/setGrants` — replace the agent's granted toolkit slugs
/// (replace-set semantics; `[]` clears while keeping the record non-null).
struct SetGrantsPayload: Encodable, Sendable {
  let agentId: String
  let toolkits: [String]
}
