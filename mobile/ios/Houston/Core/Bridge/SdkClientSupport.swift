import Foundation

/// The raw string pipe to the SDK running in a JavaScript engine — the seam
/// between ``SdkClient`` and the runtime agent's `JSRuntime`. The integration
/// agent adapts `JSRuntime` (`load` / `receive` / `dispose`) to this protocol.
///
/// Contract: `onOutbound` MUST be invoked on the main actor, once per SDK `send`,
/// in send order (BRIDGE.md §8). `JSRuntime` invokes its `onSend` on the JS
/// queue, so the adapter hops to the main queue with `DispatchQueue.main.async`
/// (FIFO — preserves send order) before calling `onOutbound`. The `@MainActor`
/// closure type makes the main-actor requirement a compile-time obligation.
@MainActor
protocol SdkBridgeTransport: AnyObject {
  /// Set by ``SdkClient``; the transport calls it for each SDK → host message.
  var onOutbound: (@MainActor (String) -> Void)? { get set }
  /// Boot the JS engine + bridge (load `houston-sdk.bridge.js`, run
  /// `HoustonSdkBridge.create({ send })`). Returns once the bridge is live.
  func boot() async throws
  /// Deliver one host → SDK message string into the engine (`receive`).
  func deliver(_ message: String)
}

/// A command awaiting its `result`, with the timeout guard that fails it loudly.
struct PendingCommand {
  let cont: CheckedContinuation<JSONValue?, Error>
  let timeout: Task<Void, Never>
}

/// A live scope subscription: the scope it watches and the sink each snapshot
/// value is delivered to. Keyed by the host-minted `sub` id in ``SdkClient``.
struct ScopeSubscriptionEntry {
  let scope: String
  let sink: @MainActor (JSONValue) -> Void
}

/// Failures the facade itself raises (distinct from a ``CommandError``).
enum SdkClientError: Error, Equatable {
  /// `start`/a command was attempted before a transport was attached.
  case noTransport
  /// The SDK's bridge major exceeds ``SdkClient/supportedBridgeVersion`` — the
  /// host must refuse to attach and prompt an update (BRIDGE.md §4).
  case updateRequired(Int)
}

/// The `result.value` decode target for a command that returns nothing.
struct SdkVoid: Decodable {}

/// The payload for a command that takes no arguments (encodes to `{}`).
struct SdkNoPayload: Encodable {}

/// The `session/setToken` payload. `token` is `nil` to clear the bearer.
struct SetTokenPayload: Encodable {
  let token: String?
}
