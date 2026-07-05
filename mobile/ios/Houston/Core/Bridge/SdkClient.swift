import Foundation
import os

/// The one thing every surface talks to: a transport-only facade over the
/// `@houston/sdk` bridge (`packages/sdk/BRIDGE.md`).
///
/// It speaks JSON envelopes to the SDK running in a JavaScript engine — it does
/// NOT model the engine, the network, or storage. Those are the ports agent's:
/// the raw string pipe is an injected ``SdkBridgeTransport``, and native-port
/// traffic (`fetch/*`, `storage/*`) is offered to an injected ``portHandler``
/// (the ports agent's `SdkPortRouter.handle`) which claims and services it.
/// SdkClient itself only correlates commands, fans out scope snapshots, and
/// surfaces events — the reactive read/write core.
///
/// Threading: the whole facade is `@MainActor`. The transport MUST invoke
/// ``SdkBridgeTransport/onOutbound`` on the main actor, in SDK send order
/// (BRIDGE.md §8 — one JS thread, ordered `send`s); the `@MainActor` closure type
/// enforces that at the call site.
@MainActor
@Observable
final class SdkClient: ScopeSubscribing {
  /// The app-wide instance. Attach a transport (and port router) before `start`.
  static let shared = SdkClient()

  /// Bridge protocol major this host is built for (BRIDGE.md §4). A `ready.v`
  /// greater than this means the SDK is newer in a breaking way → update needed.
  static let supportedBridgeVersion = 1

  /// Command reply timeout. A missing reply fails the caller loudly. Injectable
  /// so tests can drive the timeout path without waiting 30 seconds.
  let commandTimeout: Duration

  private var transport: SdkBridgeTransport?

  /// Pluggable native-port demux: offered every outbound message BEFORE SDK
  /// decoding. Returns `true` when it claimed a `fetch/*` / `storage/*` frame.
  /// Wired by the integration agent to the ports agent's `SdkPortRouter.handle`;
  /// left `nil` when the transport demuxes ports upstream (both wirings work).
  var portHandler: ((String) -> Bool)?

  let log = Logger(subsystem: "ai.gethouston.sdk", category: "client")

  private var readyContinuation: CheckedContinuation<Void, Error>?
  var pending: [String: PendingCommand] = [:]
  var subscriptions: [String: ScopeSubscriptionEntry] = [:]
  var scopeStores: [String: AnyObject] = [:]
  var eventSinks: [UUID: AsyncStream<SdkEvent>.Continuation] = [:]

  init(commandTimeout: Duration = .seconds(30)) {
    self.commandTimeout = commandTimeout
  }

  init(
    transport: SdkBridgeTransport,
    portHandler: ((String) -> Bool)? = nil,
    commandTimeout: Duration = .seconds(30)
  ) {
    self.transport = transport
    self.portHandler = portHandler
    self.commandTimeout = commandTimeout
  }

  /// Attach the transport (and optional native-port handler). Call once before
  /// ``start(baseUrl:)``.
  func attach(transport: SdkBridgeTransport, portHandler: ((String) -> Bool)?) {
    self.transport = transport
    self.portHandler = portHandler
  }

  // MARK: Lifecycle

  /// Boot the engine, send `configure`, and resolve once the SDK replies
  /// `ready`. Throws ``SdkClientError/updateRequired(_:)`` if the SDK's bridge
  /// major exceeds ``supportedBridgeVersion``.
  func start(baseUrl: String) async throws {
    guard let transport else { throw SdkClientError.noTransport }
    transport.onOutbound = { [weak self] raw in self?.receiveOutbound(raw) }
    try await transport.boot()
    try await withCheckedThrowingContinuation {
      (cont: CheckedContinuation<Void, Error>) in
      readyContinuation = cont
      do {
        try deliver(.configure(baseUrl: baseUrl, native: NativePorts(storage: true, fetch: nil)))
      } catch {
        readyContinuation = nil
        cont.resume(throwing: error)
      }
    }
  }

  /// Attach / rotate the Houston session bearer (`session/setToken`, BRIDGE.md
  /// §6.1). Non-throwing per the facade contract: a failure is logged, and a
  /// genuinely lapsed token surfaces separately as a `fatal` on ``events``.
  func setToken(_ token: String?) async {
    do {
      let _: SdkVoid = try await command("session/setToken", SetTokenPayload(token: token))
    } catch {
      log.error("setToken failed: \(String(describing: error), privacy: .public)")
    }
  }

  // MARK: Commands

  /// Dispatch a command with no payload and decode its `result.value` as `T`.
  func command<T: Decodable>(_ type: String) async throws -> T {
    try await command(type, SdkNoPayload())
  }

  /// Dispatch a command and decode its `result.value` as `T`. Throws
  /// ``CommandError`` on `ok: false` or timeout; a shape mismatch throws a
  /// `DecodingError`. Correlated by a freshly minted id.
  func command<P: Encodable, T: Decodable>(_ type: String, _ payload: P) async throws -> T {
    let id = UUID().uuidString
    let envelope = CommandEnvelope(id: id, type: type, payload: try encodeToJSON(payload))
    let value: JSONValue? = try await withCheckedThrowingContinuation { cont in
      startCommand(id: id, type: type, envelope: envelope, cont: cont)
    }
    return try (value ?? .object([:])).decode(T.self)
  }

  private func startCommand(
    id: String, type: String, envelope: CommandEnvelope,
    cont: CheckedContinuation<JSONValue?, Error>
  ) {
    let duration = commandTimeout
    let timeout = Task { [weak self] in
      try? await Task.sleep(for: duration)
      guard !Task.isCancelled else { return }
      self?.resolveCommand(id: id, result: .failure(.timeout(type: type, after: duration)))
    }
    pending[id] = PendingCommand(cont: cont, timeout: timeout)
    do {
      try deliver(.command(envelope))
    } catch {
      pending[id] = nil
      timeout.cancel()
      cont.resume(throwing: error)
    }
  }

  /// Settle a pending command exactly once, cancelling its timeout guard.
  func resolveCommand(id: String, result: Result<JSONValue?, CommandError>) {
    guard let p = pending.removeValue(forKey: id) else { return }
    p.timeout.cancel()
    switch result {
    case let .success(value): p.cont.resume(returning: value)
    case let .failure(error): p.cont.resume(throwing: error)
    }
  }

  // MARK: Events

  /// A fresh stream of decoded events. Multiple concurrent consumers each get
  /// their own stream; a `fatal` (incl. `tokenExpired`) is delivered to all.
  var events: AsyncStream<SdkEvent> {
    AsyncStream { continuation in
      let id = UUID()
      eventSinks[id] = continuation
      continuation.onTermination = { [weak self] _ in
        Task { @MainActor in self?.eventSinks[id] = nil }
      }
    }
  }

  func emit(_ event: SdkEvent) {
    for sink in eventSinks.values { sink.yield(event) }
  }

  func resolveReady(v: Int) {
    if v > Self.supportedBridgeVersion {
      log.error("bridge requires update: SDK protocol v\(v, privacy: .public) > host v\(Self.supportedBridgeVersion, privacy: .public)")
      readyContinuation?.resume(throwing: SdkClientError.updateRequired(v))
    } else {
      // The one success milestone of the boot handshake: configure round-tripped
      // through the JS bridge and the SDK replied `ready`. Logged so the boot of
      // the full JSC → bundle → dispatcher stack is observable in os_log.
      log.notice("bridge ready (SDK protocol v\(v, privacy: .public))")
      readyContinuation?.resume(returning: ())
    }
    readyContinuation = nil
  }

  // MARK: Send helpers

  /// Serialize and hand one inbound message to the transport.
  func deliver(_ message: BridgeInbound) throws {
    guard let transport else { throw SdkClientError.noTransport }
    transport.deliver(try message.serialized())
  }

  private func encodeToJSON<P: Encodable>(_ payload: P) throws -> JSONValue {
    let data = try JSONEncoder().encode(payload)
    return try JSONDecoder().decode(JSONValue.self, from: data)
  }
}
