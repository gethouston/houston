import Foundation
import os

/// The seam ``ScopeStore`` uses to open/close its bridge subscription without
/// depending on the concrete ``SdkClient``. One implementation (``SdkClient``)
/// mints the `sub` id, sends `subscribe`/`unsubscribe`, and routes matching
/// `subscribed`/`snapshot` frames back to the sink.
@MainActor
protocol ScopeSubscribing: AnyObject {
  /// Open a subscription on `scope`; `sink` receives each raw snapshot value.
  /// Returns the host-minted `sub` id.
  func openScopeSubscription(scope: String, sink: @escaping @MainActor (JSONValue) -> Void) -> String
  /// Close a previously opened subscription.
  func closeScopeSubscription(sub: String)
}

/// The type-erased seam ``SdkClient/purgeUserData()`` uses to reset every cached
/// ``ScopeStore`` (which are held as `AnyObject`, keyed by scope) on sign-out,
/// without knowing each store's concrete snapshot type.
@MainActor
protocol ScopePurgeable: AnyObject {
  /// Drop the cached snapshot and detach from the current subscription so a
  /// different user's session never reads the previous user's data.
  func purge()
}

/// A reactive, decoded view of one SDK scope's latest snapshot.
///
/// Observation-driven lifecycle: the bridge subscription opens on the FIRST
/// retention and closes on the LAST (refcounted), so a scope streams only while
/// a surface is watching it. The latest decoded snapshot is cached in
/// ``snapshot``; a decode failure NEVER silently leaves a stale value — it
/// surfaces on ``lastError`` and is logged (`os_log`), keeping the prior
/// snapshot so the UI still renders the last-good state.
@MainActor
@Observable
final class ScopeStore<T: Decodable & Sendable> {
  /// The latest successfully decoded snapshot, or `nil` before the first one.
  private(set) var snapshot: T?
  /// The most recent decode failure, or `nil` when the last snapshot decoded.
  private(set) var lastError: String?

  let scope: String
  private weak var owner: ScopeSubscribing?
  private let log: Logger
  private var refCount = 0
  private var sub: String?

  init(scope: String, owner: ScopeSubscribing) {
    self.scope = scope
    self.owner = owner
    self.log = Logger(subsystem: "ai.gethouston.sdk", category: "scope")
  }

  /// Begin observing this scope. The first retention opens the subscription; the
  /// returned token closes it when the last retention is released (on `deinit`
  /// or an explicit `cancel()`). Hold it for as long as the surface is on screen
  /// (e.g. in SwiftUI `@State`, released when the view disappears).
  func retain() -> ScopeRetention {
    refCount += 1
    if refCount == 1 { open() }
    return ScopeRetention { [weak self] in
      // `deinit` is nonisolated; hop to the main actor to touch store state.
      Task { @MainActor in self?.release() }
    }
  }

  private func open() {
    sub = owner?.openScopeSubscription(scope: scope) { [weak self] value in
      self?.apply(value)
    }
  }

  private func release() {
    guard refCount > 0 else { return }
    refCount -= 1
    if refCount == 0, let sub {
      owner?.closeScopeSubscription(sub: sub)
      self.sub = nil
    }
  }

  private func apply(_ value: JSONValue) {
    do {
      snapshot = try value.decode(T.self)
      lastError = nil
    } catch {
      lastError = String(describing: error)
      log.error(
        "scope \(self.scope, privacy: .public) decode failed: \(self.lastError ?? "", privacy: .public)")
    }
  }
}

extension ScopeStore: ScopePurgeable {
  /// Reset to the pre-first-snapshot state: publish an unloaded snapshot (so a
  /// bound view drops the previous user's data instead of showing it until a
  /// refetch) and forget the current subscription. The bridge `unsubscribe` is
  /// sent once, centrally, by ``SdkClient/purgeUserData()``; this only clears the
  /// local `sub`/refcount so a later ``retain()`` reopens a fresh subscription.
  func purge() {
    snapshot = nil
    lastError = nil
    sub = nil
    refCount = 0
  }
}

/// A retention handle for a ``ScopeStore`` subscription. Releasing it (explicit
/// `cancel()` or `deinit`) decrements the store's refcount; the last release
/// tears the bridge subscription down. Fires exactly once, and always hops to
/// the main actor (so the release is async — await a turn before asserting it).
final class ScopeRetention {
  private let onRelease: @Sendable () -> Void
  private let lock = NSLock()
  private var released = false

  init(onRelease: @escaping @Sendable () -> Void) { self.onRelease = onRelease }

  private func fireOnce() {
    lock.lock()
    let first = !released
    released = true
    lock.unlock()
    if first { onRelease() }
  }

  /// Release now instead of waiting for `deinit`.
  func cancel() { fireOnce() }

  deinit { fireOnce() }
}
