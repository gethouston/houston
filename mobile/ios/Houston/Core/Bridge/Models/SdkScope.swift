import Foundation

/// Typed builders for the SDK scope strings a surface subscribes to.
///
/// Scopes are opaque strings on the wire (`"agents"`, `"conversation/<agent>/<id>"`,
/// `"activities/<agentId>"`); centralizing their construction here keeps callers
/// from hand-formatting one and risking a typo. The values mirror the scope
/// helpers in `packages/sdk/src` verbatim.
enum SdkScope {
  /// One agent's conversation LIST — `conversations/<agentId>`
  /// (`conversationListScope`).
  static func conversations(agentId: String) -> String {
    "conversations/\(agentId)"
  }

  /// One conversation's live feed VM — `conversation/<agentPath>/<sessionKey>`
  /// (`conversationScope`, `packages/sdk/src/modules/turns/vm-output.ts`).
  ///
  /// Agent-qualified: a session key is unique only WITHIN one agent, so the
  /// scope carries both. Each component is `encodeURIComponent`-escaped exactly
  /// as the SDK escapes it (`encodeURIComponent(agentPath)/encodeURIComponent(
  /// sessionKey)`) — a mismatch here silently subscribes to a scope the SDK
  /// never publishes on, so the chat feed goes dead. `agentPath` is the SAME
  /// string this surface passes as `agentId` to the `turns/*` commands (the SDK
  /// uses the command's `agentId` verbatim as the scope's agent segment), which
  /// keeps the subscribe scope and the publish scope in lockstep.
  static func conversation(agentPath: String, sessionKey: String) -> String {
    "conversation/\(encodeURIComponent(agentPath))/\(encodeURIComponent(sessionKey))"
  }

  /// One agent's board/missions list — `activities/<agentId>`
  /// (`activitiesScope`).
  static func activities(agentId: String) -> String {
    "activities/\(agentId)"
  }

  /// The JS `encodeURIComponent` unreserved set: percent-encode everything
  /// EXCEPT `A-Z a-z 0-9 - _ . ! ~ * ' ( )`. Foundation's `.urlQueryAllowed`
  /// differs (it keeps `/`, `?`, `&`, `=`, … and treats non-ASCII letters as
  /// allowed), so it is NOT usable here — the set is spelled out ASCII-only.
  private static let encodeURIComponentAllowed: CharacterSet = CharacterSet(
    charactersIn:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")

  /// Escape one scope component exactly as JS `encodeURIComponent` does:
  /// UTF-8 bytes, uppercase hex, only the unreserved set left literal.
  /// `addingPercentEncoding` is total for a native `String` (always valid
  /// UTF-8), so the force-unwrap is a genuine invariant, not a swallowed error.
  static func encodeURIComponent(_ component: String) -> String {
    component.addingPercentEncoding(withAllowedCharacters: encodeURIComponentAllowed)!
  }
}
