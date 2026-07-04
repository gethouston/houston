import Foundation

/// Token refresh: the proactive margin timer, on-demand refresh, and the SDK
/// `tokenExpired` seam (`SdkClient.events` fatal → refresh → re-attach).
extension AuthController {
    /// Refresh now using the given session's refresh token. On success adopts
    /// the new session; on failure drops to signed-out so the user re-auths.
    @discardableResult
    func refreshNow(using stored: AuthSession) async -> Bool {
        do {
            let tokens = try await auth.refresh(refreshToken: stored.refreshToken)
            try await adopt(AuthSession(from: tokens))
            return true
        } catch {
            errorMessage = Self.describe(error)
            await forceSignOut()
            return false
        }
    }

    /// Arm a one-shot timer to refresh `refreshMargin` seconds before expiry.
    /// The on-demand `tokenExpired` seam and `restore()` cover the case where
    /// this timer is suspended in the background and misses its window.
    func scheduleRefresh(for session: AuthSession) {
        refreshTask?.cancel()
        let fireAt = session.expiresAt.addingTimeInterval(-refreshMargin)
        let delay = max(0, fireAt.timeIntervalSinceNow)
        refreshTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard let self, !Task.isCancelled else { return }
            await refreshNow(using: session)
        }
    }

    /// Subscribe to the SDK event stream and react to the fatal `tokenExpired`
    /// signal (gateway 401 on a lapsed Supabase JWT) by refreshing and
    /// re-attaching, so existing subscriptions resume (BRIDGE.md §6.6).
    func observeSdkFatal() {
        eventTask = Task { [weak self] in
            guard let self else { return }
            for await event in sdk.events {
                if case let .fatal(reason, _) = event, reason == "tokenExpired" {
                    await handleTokenExpired()
                }
            }
        }
    }

    /// The SDK reported a fatal token expiry. Refresh the Supabase session and
    /// re-attach the new token; if we have no session to refresh, sign out.
    func handleTokenExpired() async {
        guard let current = session else {
            await forceSignOut()
            return
        }
        await refreshNow(using: current)
    }

    /// Tear the session down after an unrecoverable refresh failure. The real
    /// reason is already surfaced via `errorMessage`; the Keychain clear here
    /// is best-effort teardown.
    func forceSignOut() async {
        refreshTask?.cancel()
        refreshTask = nil
        session = nil
        try? keychain.clear()
        await sdk.setToken(nil)
        state = .signedOut
    }
}
