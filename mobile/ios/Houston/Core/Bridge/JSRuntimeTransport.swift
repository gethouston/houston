import Foundation
import os

/// A private logger for the transport seam. Declared at file scope (not on the
/// `@MainActor` class) so the `onFatal` callback — which fires on the JS queue —
/// can use it without a cross-actor hop. `Logger` is `Sendable`.
private let transportLog = Logger(subsystem: "ai.gethouston.sdk", category: "transport")

/// Adapts the runtime agent's ``JSRuntime`` to the facade's
/// ``SdkBridgeTransport``. This is the seam the facade documents: `JSRuntime`
/// is the concrete JavaScriptCore engine; ``SdkClient`` speaks only the abstract
/// transport protocol.
///
/// ## Threading contract (BRIDGE.md §8)
/// `JSRuntime` invokes its `onSend` on the JS queue. ``SdkBridgeTransport``
/// requires ``onOutbound`` to be called on the **main actor, in send order**.
/// We bridge the two with `DispatchQueue.main.async` — a FIFO hop that preserves
/// the SDK's send ordering — then `MainActor.assumeIsolated` to satisfy the
/// `@MainActor` closure type (the block already runs on the main thread).
///
/// The same ``JSRuntime`` instance backs the native-port replies: the
/// ``SdkPortRouter`` writes `fetch/*` / `storage/*` responses via
/// `runtime.receive`, which is thread-safe (it marshals onto the JS queue). The
/// bootstrap (`SdkBootstrap`) shares one runtime across both.
@MainActor
final class JSRuntimeTransport: SdkBridgeTransport {
  /// Set by ``SdkClient/start(baseUrl:)`` before ``boot()``; invoked for each
  /// SDK → host message on the main actor.
  var onOutbound: (@MainActor (String) -> Void)?

  /// The shared JavaScriptCore engine. Exposed so the bootstrap can wire the
  /// ``SdkPortRouter``'s reply pipe to the same engine.
  let runtime: JSRuntime

  private let bundle: Bundle

  init(runtime: JSRuntime = JSRuntime(), bundle: Bundle = .main) {
    self.runtime = runtime
    self.bundle = bundle
  }

  /// Load `houston-sdk.bridge.js` and construct the bridge. `JSRuntime.load`
  /// runs its setup synchronously on the JS queue and rethrows setup exceptions,
  /// so a boot failure surfaces to ``SdkClient/start(baseUrl:)`` (which the app
  /// reports as a startup error — never a blank screen, never swallowed).
  func boot() async throws {
    try runtime.load(
      from: bundle,
      onSend: { [weak self] message in
        // JS queue → main actor. `DispatchQueue.main.async` keeps FIFO order
        // (BRIDGE.md §8); `assumeIsolated` is valid because the block runs on
        // the main thread, where `MainActor` is bound. `self` is captured
        // weakly (on this outer closure) so `runtime` — which retains this
        // handler — does not form a retain cycle back to the transport.
        DispatchQueue.main.async {
          MainActor.assumeIsolated { self?.onOutbound?(message) }
        }
      },
      onFatal: { error in
        // An uncaught JS exception is catastrophic but rare. It is logged
        // loudly (never silently dropped); the SDK's own protocol-level
        // `fatal` frames (e.g. `tokenExpired`) still flow through `onOutbound`.
        transportLog.error("JS runtime fatal: \(String(describing: error), privacy: .public)")
      }
    )
  }

  /// Deliver one host → SDK message into the engine (thread-safe).
  func deliver(_ message: String) {
    runtime.receive(message)
  }

  /// Tear down the engine (app-lifetime singleton normally never calls this).
  func teardown() {
    runtime.dispose()
  }
}
