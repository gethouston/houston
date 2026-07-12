import Foundation
import os

/// SDK diagnostics arrive on the `log` frame (BRIDGE.md §9.3). They land under
/// the SDK subsystem, category `sdk`, beside the client/transport loggers.
private let sdkDiagnostics = Logger(subsystem: "ai.gethouston.sdk", category: "sdk")

/// The SDK → host receive path: offer native-port traffic to the ``portHandler``,
/// decode the rest as ``BridgeOutbound``, and dispatch it. Runs on the main
/// actor, in SDK send order (the transport's contract).
extension SdkClient {
  /// Entry point the transport calls for each outbound message string.
  func receiveOutbound(_ raw: String) {
    // Native-port frames (`fetch/*`, `storage/*`) are claimed by the handler.
    // Everything else, including the SDK `log` diagnostic frame (§9.3), decodes
    // as ``BridgeOutbound`` and is dispatched below.
    if portHandler?(raw) == true { return }
    guard let data = raw.data(using: .utf8) else {
      log.error("outbound message was not UTF-8")
      return
    }
    guard let message = try? JSONDecoder().decode(BridgeOutbound.self, from: data) else {
      log.error("could not decode outbound message")
      return
    }
    dispatch(message)
  }

  private func dispatch(_ message: BridgeOutbound) {
    switch message {
    case let .ready(v):
      resolveReady(v: v)
    case let .result(result):
      dispatchResult(result)
    case let .subscribed(sub, _, snapshot):
      if let snapshot { deliverSnapshot(sub: sub, value: snapshot) }
    case let .snapshot(sub, _, snapshot):
      deliverSnapshot(sub: sub, value: snapshot)
    case let .event(payload):
      emit(.event(type: payload.type, scope: payload.scope, data: payload.data))
    case let .fatal(reason, message):
      if reason == SdkFatalReason.tokenExpired {
        log.error("fatal: Houston session token expired")
      } else {
        log.error("fatal: \(reason, privacy: .public)")
      }
      emit(.fatal(reason: reason, message: message))
    case let .error(message, detail):
      log.error("protocol error: \(message, privacy: .public)")
      emit(.protocolError(message: message, detail: detail))
    case let .log(payload):
      dispatchLog(payload)
    case let .unknown(kind):
      // Inert per BRIDGE.md §4 — a future/unmodeled member, ignored not crashed.
      log.debug("ignoring inert outbound kind: \(kind, privacy: .public)")
    }
  }

  /// Route an SDK diagnostic line (BRIDGE.md §9.3) to os.Logger. One-way: no
  /// reply and no JS re-entry, just a cheap main-actor log call. An unknown level
  /// falls through to `.info` so a future severity never drops the line. Message
  /// text uses os.Logger's default redaction, like the `console` polyfill, since
  /// a diagnostic line may carry user content.
  private func dispatchLog(_ payload: SdkLogPayload) {
    switch payload.level {
    case "debug": sdkDiagnostics.debug("\(payload.message)")
    case "warn": sdkDiagnostics.warning("\(payload.message)")
    case "error": sdkDiagnostics.error("\(payload.message)")
    default: sdkDiagnostics.info("\(payload.message)")
    }
  }

  private func dispatchResult(_ result: CommandResult) {
    if result.ok {
      resolveCommand(id: result.id, result: .success(result.value))
    } else {
      let error = CommandError(
        status: result.error?.status,
        message: result.error?.message ?? "command failed")
      resolveCommand(id: result.id, result: .failure(error))
    }
  }
}
