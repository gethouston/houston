import SwiftUI

/// Top-level routing between the three app states:
///   - SDK failed to start  → ``StartupErrorView`` (never a blank screen),
///   - signed out           → `SignInView` (owned by the auth layer),
///   - signed in            → ``RootTabs``.
///
/// ``AuthController`` is injected by ``HoustonApp`` (`Core/Auth/`); its `state`
/// machine drives the sign-in gate.
struct RootView: View {
    @Environment(AuthController.self) private var auth

    /// Non-nil when SDK startup failed; passed down from ``HoustonApp``.
    let startupError: String?

    var body: some View {
        if let startupError {
            StartupErrorView(message: startupError)
        } else if auth.state == .signedIn {
            RootTabs()
        } else {
            SignInView(controller: auth)
        }
    }
}

/// Full-screen fallback shown when the SDK could not reach the gateway on
/// launch. Uses only semantic system styling (no hard-coded colors) because it
/// runs before the app is usable; the rest of the UI styles through the
/// DesignSystem. The user reopens the app to retry once connectivity returns
/// (the SDK reconnects its streams on its own thereafter).
private struct StartupErrorView: View {
    let message: String

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40, weight: .regular))
                .foregroundStyle(.secondary)
            Text(Strings.Startup.failedTitle)
                .font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Text(Strings.Startup.failedHint)
                .font(.footnote)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
        }
        .padding(32)
    }
}
