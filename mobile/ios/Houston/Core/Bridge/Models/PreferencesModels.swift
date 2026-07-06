import Foundation

/// A workspace — the tenancy-index resource the host owns (`Workspace`,
/// `packages/protocol/src/domain/workspace.ts`). Returned by the `setLocale`
/// command. Decodes tolerantly: unknown JSON members are ignored (BRIDGE.md §4).
struct Workspace: Decodable, Equatable, Identifiable, Sendable {
  let id: String
  let name: String
  let isDefault: Bool
  /// ISO timestamp, as the wire carries it.
  let createdAt: String
  /// Per-workspace UI-locale override (BCP-47 base tag); `nil` inherits the
  /// global preference. Both an absent key and a JSON `null` decode to `nil`.
  var locale: String?
  var provider: String?
  var model: String?
}

// MARK: - Command payloads (`packages/sdk/src/modules/preferences/index.ts`)

/// `preferences/get` — read a preference value (the result is `String?`, `nil`
/// when unset).
struct GetPreferencePayload: Encodable, Sendable {
  let key: String
}

/// `preferences/set` — write (or, with a `nil` `value`, CLEAR) a preference.
/// `value` is `string | null` on the wire where **`null` clears** — so a `nil`
/// is encoded as an explicit JSON `null`, never omitted.
struct SetPreferencePayload: Encodable, Sendable {
  let key: String
  let value: String?

  private enum CodingKeys: String, CodingKey {
    case key
    case value
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(key, forKey: .key)
    // Encode the Optional itself (not `encodeIfPresent`) so a `nil` lands on the
    // wire as `null` — the clear signal — rather than dropping the key.
    try container.encode(value, forKey: .value)
  }
}

/// `workspace/setLocale` — set (or, with a `nil` `locale`, CLEAR) the workspace's
/// UI-locale override. `locale` is `string | null` where **`null` clears**, so a
/// `nil` is encoded as an explicit JSON `null`, never omitted.
struct SetLocalePayload: Encodable, Sendable {
  let workspaceId: String
  let locale: String?

  private enum CodingKeys: String, CodingKey {
    case workspaceId
    case locale
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(workspaceId, forKey: .workspaceId)
    try container.encode(locale, forKey: .locale)
  }
}
