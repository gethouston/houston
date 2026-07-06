import Foundation

/// Scope read surface: the typed ``ScopeStore`` factory and the `subscribe` /
/// `unsubscribe` plumbing it drives. Snapshots arriving on a `sub` are routed to
/// that subscription's sink; the store decodes them to its `T`.
extension SdkClient {
  /// The shared typed store for `scope`. One store per scope string, cached, so
  /// every surface watching a scope shares one bridge subscription (refcounted
  /// in ``ScopeStore``). Call with a consistent `T` per scope.
  func scope<T: Decodable & Sendable>(_ scope: String, as type: T.Type = T.self) -> ScopeStore<T> {
    if let existing = scopeStores[scope] as? ScopeStore<T> {
      return existing
    }
    let store = ScopeStore<T>(scope: scope, owner: self)
    scopeStores[scope] = store
    return store
  }

  // MARK: ScopeSubscribing

  func openScopeSubscription(scope: String, sink: @escaping @MainActor (JSONValue) -> Void) -> String {
    let sub = UUID().uuidString
    subscriptions[sub] = ScopeSubscriptionEntry(scope: scope, sink: sink)
    do {
      try deliver(.subscribe(sub: sub, scope: scope))
    } catch {
      log.error("subscribe to \(scope, privacy: .public) failed: \(String(describing: error), privacy: .public)")
    }
    return sub
  }

  func closeScopeSubscription(sub: String) {
    subscriptions[sub] = nil
    do {
      try deliver(.unsubscribe(sub: sub))
    } catch {
      log.error("unsubscribe \(sub, privacy: .public) failed: \(String(describing: error), privacy: .public)")
    }
  }

  /// Route a snapshot frame to its subscription's sink (a no-op for an unknown
  /// `sub`, e.g. one already unsubscribed).
  func deliverSnapshot(sub: String, value: JSONValue) {
    subscriptions[sub]?.sink(value)
  }

  /// Drop every trace of the signed-in user's SCOPE data so a different user
  /// signing in on the same device never reads the previous user's snapshots
  /// (the scope keys `agents`/`integrations` are fixed, so a stale snapshot would
  /// otherwise show through until a refetch landed). Closes every live scope
  /// subscription on the bridge, clears the subscription table, and resets every
  /// cached ``ScopeStore`` to an unloaded snapshot (bound views drop stale data).
  ///
  /// Event sinks and in-flight commands are transient — not cached user data —
  /// and are intentionally left intact so the app-lifetime `tokenExpired`
  /// observer (``AuthController/observeSdkFatal()``) keeps working across the next
  /// sign-in. Call from EVERY sign-out exit (``AuthController/signOut()`` and the
  /// `forceSignOut`/`tokenExpired` terminal path).
  func purgeUserData() {
    for sub in subscriptions.keys {
      do {
        try deliver(.unsubscribe(sub: sub))
      } catch {
        log.error("purge unsubscribe \(sub, privacy: .public) failed: \(String(describing: error), privacy: .public)")
      }
    }
    subscriptions.removeAll()
    for store in scopeStores.values {
      (store as? ScopePurgeable)?.purge()
    }
  }
}
