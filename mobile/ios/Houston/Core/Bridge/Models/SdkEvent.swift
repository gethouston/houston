import Foundation

/// A decoded signal surfaced on ``SdkClient/events``.
///
/// The bridge delivers three non-snapshot signals; this enum unifies them for a
/// surface, keeping the load-bearing distinction the contract insists on: a
/// lapsed *Houston session* token is a `fatal` (whole-session, re-attach), never
/// a plain `event` (BRIDGE.md §5). The `fatal` case carries the raw `reason`
/// string so a consumer matches it directly (`reason == SdkFatalReason.tokenExpired`);
/// ``isFatalTokenExpired`` names that canonical check.
enum SdkEvent: Sendable, Equatable {
  /// A one-shot module signal (`approval/needed`, …). `data` is left as raw JSON
  /// because its shape is owned by the emitting module, not this layer.
  case event(type: String, scope: String?, data: JSONValue?)
  /// The whole SDK session is unusable. `reason` is the raw bridge reason;
  /// `tokenExpired` is the canonical, distinguished case (BRIDGE.md §6.6).
  case fatal(reason: String, message: String)
  /// A protocol-level rejection of one inbound message (BRIDGE.md §5.0).
  /// Correlates to nothing and is never fatal.
  case protocolError(message: String, detail: JSONValue?)

  /// True for the canonical fatal token-expiry signal — the whole-session lapse
  /// a host recovers by refreshing its Supabase JWT and re-attaching.
  var isFatalTokenExpired: Bool {
    if case let .fatal(reason, _) = self { return reason == SdkFatalReason.tokenExpired }
    return false
  }
}

/// Well-known `fatal` reason strings (BRIDGE.md §5). `tokenExpired` is the
/// distinguished whole-session lapse; naming it here defeats magic-string drift.
enum SdkFatalReason {
  static let tokenExpired = "tokenExpired"
}
