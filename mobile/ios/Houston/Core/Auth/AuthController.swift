import Foundation
import Observation

/// The observable auth state machine surfaces bind to. Owns the GCIP session
/// (Firebase ID token = the gateway bearer), the Keychain persistence,
/// proactive + on-demand token refresh, and the `SdkClient` token seam.
///
/// Sign-in flows live in `AuthController+SignIn.swift` (Google / Microsoft /
/// email code) and `AuthController+Apple.swift` (native Sign in with Apple);
/// refresh, scheduling, and the SDK `tokenExpired` seam live in
/// `AuthController+Refresh.swift`.
@Observable
@MainActor
final class AuthController {
    enum State: Equatable {
        case signedOut
        case signingIn
        case signedIn
    }

    /// Identity backends for one controller — injectable so tests never
    /// touch the network or the real client registrations.
    struct Configuration {
        var firebaseAPIKey: String
        var gatewayBaseURL: String
        var googleClientID: String
        var microsoftClientID: String
    }

    // Read-only for surfaces by convention; mutated across the Auth module's
    // own files (`AuthController+*.swift`), so not `private(set)`.
    var state: State = .signedOut
    /// User-facing error from the last auth action (nil when clear).
    var errorMessage: String?

    let gcip: GcipAuth
    let otp: EmailOtpClient
    let sdk: SdkClient
    let keychain: AuthKeychain
    let config: Configuration
    let urlSession: URLSession

    /// Refresh this far ahead of expiry so a token never lapses mid-request.
    let refreshMargin: TimeInterval = 60
    var refreshTask: Task<Void, Never>?
    var eventTask: Task<Void, Never>?
    var session: AuthSession?
    /// Raw nonce minted when the Sign in with Apple request was configured;
    /// consumed by the completion (`AuthController+Apple.swift`).
    var pendingAppleNonce: String?

    init(
        config: Configuration,
        sdk: SdkClient = .shared,
        keychain: AuthKeychain = .shared,
        urlSession: URLSession = .shared
    ) {
        self.config = config
        gcip = GcipAuth(apiKey: config.firebaseAPIKey, session: urlSession)
        otp = EmailOtpClient(gatewayBaseURL: config.gatewayBaseURL, session: urlSession)
        self.sdk = sdk
        self.keychain = keychain
        self.urlSession = urlSession
        observeSdkFatal()
    }

    /// Live controller reading the GCIP + OAuth-client constants from the app
    /// `Config` (owned by the scaffold target).
    static func live() -> AuthController {
        AuthController(
            config: Configuration(
                firebaseAPIKey: Config.firebaseAPIKey,
                gatewayBaseURL: Config.gatewayBaseURL,
                googleClientID: Config.googleIOSClientID,
                microsoftClientID: Config.microsoftClientID
            )
        )
    }

    /// Hard sign-out: cancel timers, wipe Keychain, detach the SDK token.
    func signOut() async {
        refreshTask?.cancel()
        refreshTask = nil
        session = nil
        do {
            try keychain.clear()
        } catch {
            // In-memory sign-out already happened and a future sign-in
            // overwrites the entry; surface the failure but still complete.
            errorMessage = AuthErrorCopy.message(for: error)
        }
        await sdk.setToken(nil)
        // Purge the previous user's cached scope snapshots so a different user
        // signing in on this device never reads them (fixed scope keys).
        sdk.purgeUserData()
        state = .signedOut
    }

    /// On launch: load the stored session, refresh if stale, attach the token.
    /// A legacy (Supabase-era) or corrupt blob loads as `nil` — signed out.
    func restore() async {
        let stored: AuthSession?
        do {
            stored = try keychain.load()
        } catch {
            errorMessage = AuthErrorCopy.message(for: error)
            state = .signedOut
            return
        }
        guard let stored else {
            state = .signedOut
            return
        }
        if stored.isExpiring(within: refreshMargin) {
            await refreshNow(using: stored)
        } else {
            await adopt(storedWithoutPersist: stored)
        }
    }

    /// Persist + attach a freshly obtained session, then schedule its refresh.
    func adopt(_ session: AuthSession) async throws {
        try keychain.save(session)
        await attach(session)
    }

    /// Attach an already-persisted session (restore path) without re-saving.
    func adopt(storedWithoutPersist session: AuthSession) async {
        await attach(session)
    }

    private func attach(_ session: AuthSession) async {
        self.session = session
        await sdk.setToken(session.idToken)
        state = .signedIn
        scheduleRefresh(for: session)
    }
}
