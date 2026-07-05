import Foundation
import os

/// Wires the concrete bridge stack into ``SdkClient`` once, on launch.
///
/// The pieces are built by separate agents and meet here:
///   - ``JSRuntime`` — the JavaScriptCore engine (runtime layer),
///   - ``JSRuntimeTransport`` — adapts it to ``SdkBridgeTransport``,
///   - ``SdkPortRouter`` — services native `fetch/*` / `storage/*` requests.
///
/// One ``JSRuntime`` backs both directions: the transport boots it and pumps
/// host→SDK messages; the port router writes its replies back through the same
/// engine via `runtime.receive`. `SdkClient` retains the transport strongly, and
/// the `router.handle` bound method retains the router, so the whole stack lives
/// as long as `SdkClient.shared` (the app lifetime).
///
/// Call ``attach(to:)`` before ``SdkClient/start(baseUrl:)``; it is idempotent.
@MainActor
enum SdkBootstrap {
  private static let log = Logger(subsystem: "ai.gethouston.sdk", category: "bootstrap")
  private static var wired = false

  /// Build the transport + port router over a shared ``JSRuntime`` and attach
  /// them to the client. Idempotent: a second call is a no-op so a re-entrant
  /// bootstrap cannot double-wire the singleton.
  static func attach(to client: SdkClient = .shared) {
    guard !wired else { return }
    wired = true

    let transport = JSRuntimeTransport()
    let runtime = transport.runtime

    // Storage/fetch backend failures have no SDK error channel, so the router
    // still settles the JS promise with a safe reply; we surface the underlying
    // failure here rather than let it vanish (no silent failures).
    let router = SdkPortRouter(
      send: { message in runtime.receive(message) },
      onError: { detail in
        log.error("native port error: \(detail, privacy: .public)")
      }
    )

    client.attach(transport: transport, portHandler: router.handle)
  }
}
