import Foundation
import os

/// The connect / reconnect hand-off, owned by the surface so dismissing a sheet
/// never kills polling: mint the hosted OAuth link (`integrations/connect`), hand
/// the URL to `SFSafariViewController`, then poll `integrations/pollConnection`
/// until the OAuth finishes, errors, times out, or the user cancels. On a landed
/// connection the surface refreshes the VM so the app flips to "Connected".
///
/// The poll's inter-attempt wait is interruptible: "I have finished" wakes it to
/// check immediately, and `cancel()` wakes it to observe cancellation on the next
/// tick — no waiting out the full 2s interval (mirrors the desktop `Waker`).
@MainActor
@Observable
final class IntegrationsConnectFlow {
  /// ~5 min at 2s/attempt before the flow reports a timeout.
  static let maxAttempts = 150
  static let pollInterval: Duration = .seconds(2)

  /// The in-flight browser hand-off a waiting sheet renders. `id == toolkit` so
  /// it drives a `.sheet(item:)`.
  struct Session: Identifiable, Equatable {
    let toolkit: String
    let appName: String
    let redirectURL: URL
    let connectionId: String
    var id: String { toolkit }
  }

  /// The outcome the surface surfaces to the user after polling settles.
  enum Outcome: Equatable { case active, error, timeout, cancelled }

  /// The active waiting session, or `nil` when idle.
  private(set) var session: Session?
  /// The toolkit whose `connect` command is in flight (row spinner), pre-session.
  private(set) var connecting: String?
  /// The last settled outcome the surface may toast, consumed via ``takeOutcome``.
  private(set) var lastOutcome: Outcome?

  private let client: SdkClient
  private let onLanded: (String) -> Void
  private let log = Logger(subsystem: "ai.gethouston.app", category: "integrations.connect")

  private var pollTask: Task<Void, Never>?
  private var wake: (() -> Void)?
  private var cancelled = false

  /// `onLanded` receives the toolkit slug of a connection that flipped active,
  /// so an agent-scoped surface can refresh AND auto-grant it to the agent.
  init(client: SdkClient = .shared, onLanded: @escaping (String) -> Void) {
    self.client = client
    self.onLanded = onLanded
  }

  /// Start (or restart, e.g. Reconnect) a connect for `toolkit`. Single-flight:
  /// a second call while one flow owns the session is ignored.
  func connect(toolkit: String, appName: String) async {
    guard session == nil, connecting == nil else { return }
    connecting = toolkit
    cancelled = false
    defer { connecting = nil }
    do {
      let result: ConnectResult = try await client.command(
        IntegrationsCommand.connect, IntegrationToolkitPayload(toolkit: toolkit))
      guard let url = URL(string: result.redirectUrl) else {
        log.error("connect returned an invalid redirect URL")
        return
      }
      session = Session(
        toolkit: toolkit, appName: appName, redirectURL: url, connectionId: result.connectionId)
      startPolling(toolkit: toolkit, connectionId: result.connectionId)
    } catch {
      log.error("connect failed: \(String(describing: error), privacy: .public)")
    }
  }

  /// Wake the poll loop to check the connection right now ("I have finished").
  func checkNow() { wake?() }

  /// Stop the flow with no outcome toast; closing the sheet is the way back.
  func cancel() {
    cancelled = true
    wake?()
  }

  /// Read + clear the last settled outcome (so a toast fires once).
  func takeOutcome() -> Outcome? {
    defer { lastOutcome = nil }
    return lastOutcome
  }

  private func startPolling(toolkit: String, connectionId: String) {
    pollTask?.cancel()
    pollTask = Task { [weak self] in
      guard let self else { return }
      let outcome = await self.pollLoop(connectionId: connectionId)
      if outcome == .active { self.onLanded(toolkit) }
      if outcome != .cancelled { self.lastOutcome = outcome }
      self.session = nil
      self.pollTask = nil
    }
  }

  private func pollLoop(connectionId: String) async -> Outcome {
    for _ in 0..<Self.maxAttempts {
      if cancelled { return .cancelled }
      await waitInterruptible(Self.pollInterval)
      if cancelled { return .cancelled }
      guard let connection = await pollOnce(connectionId) else { continue }
      switch connection.status {
      case .active: return .active
      case .error: return .error
      case .pending, .unknown: continue
      }
    }
    return .timeout
  }

  private func pollOnce(_ connectionId: String) async -> IntegrationConnection? {
    do {
      return try await client.command(
        IntegrationsCommand.pollConnection, PollConnectionPayload(connectionId: connectionId))
    } catch {
      log.error("pollConnection failed: \(String(describing: error), privacy: .public)")
      return nil
    }
  }

  /// Sleep `duration`, resolving early if `wake()` fires first. All on the main
  /// actor, so the single-slot `wake` closure needs no locking.
  private func waitInterruptible(_ duration: Duration) async {
    await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
      var resumed = false
      let resumeOnce = {
        guard !resumed else { return }
        resumed = true
        cont.resume()
      }
      wake = resumeOnce
      Task {
        try? await Task.sleep(for: duration)
        resumeOnce()
      }
    }
    wake = nil
  }
}
