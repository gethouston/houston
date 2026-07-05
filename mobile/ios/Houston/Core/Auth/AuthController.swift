import Foundation
import Observation

/// The observable auth state machine surfaces bind to. Owns the PKCE sign-in,
/// Keychain-backed session, proactive + on-demand token refresh, and the
/// `SdkClient` token seam.
///
/// Refresh, scheduling, and the SDK `tokenExpired` seam live in
/// `AuthController+Refresh.swift`.
@Observable
@MainActor
final class AuthController {
    enum State: Equatable {
        case signedOut
        case signingIn
        case signedIn
    }

    // Read-only for surfaces by convention; mutated across the Auth module's
    // own files (`AuthController+Refresh.swift`), so not `private(set)`.
    var state: State = .signedOut
    /// User-facing error from the last auth action (nil when clear).
    var errorMessage: String?

    let auth: SupabaseAuth
    let sdk: SdkClient
    let keychain: AuthKeychain
    let callbackScheme: String

    /// Refresh this far ahead of expiry so a token never lapses mid-request.
    let refreshMargin: TimeInterval = 60
    var refreshTask: Task<Void, Never>?
    var eventTask: Task<Void, Never>?
    var session: AuthSession?

    init(
        config: SupabaseAuthConfig,
        sdk: SdkClient = .shared,
        keychain: AuthKeychain = .shared,
        urlSession: URLSession = .shared
    ) {
        auth = SupabaseAuth(config: config, session: urlSession)
        self.sdk = sdk
        self.keychain = keychain
        callbackScheme = config.callbackScheme
        observeSdkFatal()
    }

    /// Live controller reading Supabase creds from the app `Config` (owned by
    /// the scaffold target). `houston://auth-callback` is already in the
    /// Supabase redirect allow-list.
    static func live() -> AuthController {
        // `Config.supabaseURL` is a compile-time constant, known-valid URL; a
        // parse failure here is a build-time misconfiguration, not a runtime
        // condition, so it is a programmer error rather than a recoverable one.
        guard let baseURL = URL(string: Config.supabaseURL) else {
            preconditionFailure("Config.supabaseURL is not a valid URL: \(Config.supabaseURL)")
        }
        return AuthController(
            config: SupabaseAuthConfig(
                baseURL: baseURL,
                anonKey: Config.supabaseAnonKey,
                redirectURL: Config.authCallbackURL
            )
        )
    }

    /// Begin Google sign-in: mint PKCE, open the browser, exchange the code.
    func signIn() async {
        guard state != .signingIn else { return }
        state = .signingIn
        errorMessage = nil
        do {
            let verifier = PKCE.makeCodeVerifier()
            let challenge = PKCE.challenge(for: verifier)
            guard let url = auth.authorizeURL(provider: "google", challenge: challenge) else {
                throw SupabaseAuthError.malformedURL
            }
            let web = WebAuthSession()
            let callback = try await web.start(url: url, callbackScheme: callbackScheme)
            switch AuthCallback.parse(callback) {
            case let .code(code):
                let tokens = try await auth.exchangeCode(code, verifier: verifier)
                try await adopt(AuthSession(from: tokens))
            case let .error(code, description):
                throw SupabaseAuthError.badResponse(status: 400, body: description ?? code)
            case .none:
                throw WebAuthSession.WebAuthError.noCallback
            }
        } catch WebAuthSession.WebAuthError.cancelled {
            // User backed out of the browser sheet — return quietly, no banner.
            state = .signedOut
        } catch {
            errorMessage = Self.describe(error)
            state = .signedOut
        }
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
            errorMessage = Self.describe(error)
        }
        await sdk.setToken(nil)
        state = .signedOut
    }

    /// On launch: load the stored session, refresh if stale, attach the token.
    func restore() async {
        let stored: AuthSession?
        do {
            stored = try keychain.load()
        } catch {
            errorMessage = Self.describe(error)
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
        await sdk.setToken(session.accessToken)
        state = .signedIn
        scheduleRefresh(for: session)
    }

    static func describe(_ error: Error) -> String {
        switch error {
        case let SupabaseAuthError.badResponse(status, body):
            return "Sign-in failed (\(status)). \(body)"
        case let SupabaseAuthError.transport(underlying):
            return "Network error: \(underlying.localizedDescription)"
        case SupabaseAuthError.malformedURL:
            return "Sign-in is misconfigured (bad Supabase URL)."
        default:
            return error.localizedDescription
        }
    }
}
