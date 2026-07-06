import Foundation

/// The wire id of an AI provider (`ProviderId`, `packages/protocol/src/
/// conversation.ts`). A closed union on the wire, but iOS treats it as an opaque
/// identifier it maps through the provider catalog (PARITY-SETTINGS §2a — two id
/// namespaces: `openai` vs `openai-codex`, `google`/`gemini`), so it is carried
/// as a raw `String`: an unknown id is preserved, never dropped.
typealias ProviderId = String

/// The lifecycle of an in-flight OAuth login (`LoginStatus`, conversation.ts).
/// Tolerant: an unrecognized value is preserved verbatim (BRIDGE.md §4).
enum LoginStatus: Decodable, Equatable, Sendable {
  case starting
  case awaitingUser
  case complete
  case error
  case unknown(String)

  init(raw: String) {
    switch raw {
    case "starting": self = .starting
    case "awaiting_user": self = .awaitingUser
    case "complete": self = .complete
    case "error": self = .error
    default: self = .unknown(raw)
    }
  }

  init(from decoder: Decoder) throws {
    self.init(raw: try decoder.singleValueContainer().decode(String.self))
  }
}

/// How the user completes a login (`LoginInfo` discriminated union,
/// conversation.ts §39-50). The surface renders the matching flow:
///  - ``url`` — open it; the engine catches the loopback redirect (LOCAL only,
///    never hosted). Nothing to paste.
///  - ``authCode`` — open `url`, approve, then paste the shown code via
///    `completeLogin`. The headless path.
///  - ``deviceCode`` — open `verificationUri`, enter `userCode`, poll status.
/// An unrecognized `kind` is preserved as ``unrecognized`` (never dropped).
enum LoginInfo: Decodable, Equatable, Sendable {
  case url(url: String)
  case authCode(url: String, instructions: String?)
  case deviceCode(verificationUri: String, userCode: String)
  /// A future `kind` this host does not model yet; the whole payload is kept.
  case unrecognized(kind: String, raw: JSONValue)

  init(from decoder: Decoder) throws {
    let raw = try JSONValue(from: decoder)
    switch raw["kind"]?.stringValue ?? "" {
    case "url":
      self = .url(url: raw["url"]?.stringValue ?? "")
    case "auth_code":
      self = .authCode(
        url: raw["url"]?.stringValue ?? "",
        instructions: raw["instructions"]?.stringValue)
    case "device_code":
      self = .deviceCode(
        verificationUri: raw["verificationUri"]?.stringValue ?? "",
        userCode: raw["userCode"]?.stringValue ?? "")
    case let kind:
      self = .unrecognized(kind: kind, raw: raw)
    }
  }
}

/// The in-flight/last OAuth login state a surface polls on (`LoginState`,
/// conversation.ts §52-56). `info` is present while there is something to show;
/// `error` carries a failure reason.
struct LoginState: Decodable, Equatable, Sendable {
  let status: LoginStatus
  var info: LoginInfo?
  var error: String?
}

/// One provider inside the `providers/<agentId>` snapshot: the `ProviderInfo`
/// fields (`GET /providers`) enriched with the `GET /auth/status` overlay
/// (`ProviderVM`, `packages/sdk/src/modules/providers/types.ts`). Decodes
/// tolerantly — unknown JSON members are ignored.
struct ProviderVM: Decodable, Equatable, Identifiable, Sendable {
  let id: ProviderId
  let name: String
  /// Credential present (auth-status truth; falls back to the list's flag).
  let configured: Bool
  /// `id == activeProvider` — the provider new turns run under.
  let isActive: Bool
  /// The runtime's active model for this provider (empty pre-connect).
  let activeModel: String
  /// The provider's selectable models (empty for an auth-only provider).
  let models: [String]
  /// In-flight/last OAuth state, or `nil` when idle / not in `/auth/status`.
  /// Both an absent key and a JSON `null` decode to `nil` (idle).
  var login: LoginState?
  /// GitHub Copilot Enterprise domain the credential was issued for, else `nil`.
  var enterpriseUrl: String?
}

/// The `providers/<agentId>` view-model: the whole snapshot, republished on any
/// change (`ProvidersViewModel`, types.ts §61-65). `loaded` is `false` until the
/// first merge resolves; `activeProvider` is absent when the runtime has none.
struct ProvidersViewModel: Decodable, Equatable, Sendable {
  let loaded: Bool
  let providers: [ProviderVM]
  var activeProvider: ProviderId?
}

// MARK: - Command payloads (`packages/sdk/src/modules/providers/payloads.ts`)

/// `providers/refresh` + `providers/refreshStatus` — the agent to (re)read.
struct ProviderRefreshPayload: Encodable, Sendable {
  let agentId: String
}

/// `providers/login` — start an OAuth login. Hosted mode defaults `deviceAuth`
/// true at the operations layer (no loopback); `enterpriseDomain` is Copilot
/// only. Absent optionals are omitted, matching the TS `undefined`.
struct ProviderLoginPayload: Encodable, Sendable {
  let agentId: String
  let provider: ProviderId
  var deviceAuth: Bool?
  var enterpriseDomain: String?
}

/// `providers/cancelLogin` + `providers/logout` — a provider action on an agent.
struct ProviderActionPayload: Encodable, Sendable {
  let agentId: String
  let provider: ProviderId
}

/// `providers/completeLogin` — submit a pasted `auth_code`.
struct CompleteLoginPayload: Encodable, Sendable {
  let agentId: String
  let provider: ProviderId
  let code: String
}

/// `providers/setApiKey` — store an API key for an api-key provider.
struct SetApiKeyPayload: Encodable, Sendable {
  let agentId: String
  let provider: ProviderId
  let key: String
}

/// `providers/setModel` — a model/effort/provider switch (resolveModelSettings).
/// Absent optionals are omitted, matching the TS `SetModelArgs`.
struct SetModelPayload: Encodable, Sendable {
  let agentId: String
  var model: String?
  var effort: String?
  var provider: ProviderId?
}
