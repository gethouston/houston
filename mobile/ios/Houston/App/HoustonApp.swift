import SwiftUI

/// App entry point (SwiftUI lifecycle).
///
/// Responsibilities are deliberately thin — this type only:
///   1. owns the app-wide observables (``AuthController``, ``BadgeModel``) and
///      injects them into the environment,
///   2. starts the SDK session against the gateway once, on launch, then
///      restores any stored auth session (which attaches the token).
///
/// All UI decisions live in ``RootView`` / ``RootTabs``; all engine behavior
/// lives behind ``SdkClient`` (`Core/Bridge/SdkClient.swift`). The Google
/// sign-in hop uses `ASWebAuthenticationSession` (`Core/Auth/WebAuthSession`),
/// which captures the `houston://auth-callback` redirect itself — so there is
/// no app-level `onOpenURL` handler for auth.
@main
struct HoustonApp: App {
    /// Auth state + Supabase session management. Owns the `SdkClient` token
    /// seam (`Core/Auth/AuthController.swift`).
    @State private var auth = AuthController.live()

    /// Cross-surface "needs you" badge counter (see ``BadgeModel``).
    @State private var badge = BadgeModel()

    /// The single cross-agent aggregation shared by the Agents, Mission Control,
    /// and New Mission surfaces (`AgentsOverviewProviding` seam). Owned once here
    /// so the per-agent `activities/<id>` fan-out happens exactly once.
    @State private var overview = AgentsOverviewModel()

    /// Set when the SDK failed to start; surfaced by ``RootView`` instead of a
    /// blank screen. We never swallow the startup error.
    @State private var startupError: String?

    var body: some Scene {
        WindowGroup {
            RootView(startupError: startupError)
                .environment(auth)
                .environment(badge)
                .environment(\.agentsOverview, overview)
                .environment(\.chatViewBuilder, Self.chatViewBuilder)
                .task { await bootstrap() }
        }
    }

    /// Builds the chat destination for a `ChatRoute`. Injected so Mission
    /// Control / New Mission stay decoupled from the Chat feature; the route's
    /// `sessionKey` is the chat's `conversationId` (`activity-<id>`).
    private static let chatViewBuilder: ChatViewBuilder = { route in
        AnyView(
            ChatView(
                agentId: route.agentId,
                conversationId: route.sessionKey,
                title: route.title
            )
        )
    }

    /// Configure the SDK bridge (wait for `ready`), then restore a stored auth
    /// session so its token is attached. Runs once on launch. The SDK must be
    /// started before `restore()` so the token attach has a live session.
    private func bootstrap() async {
        startupError = nil
        // Wire the JavaScriptCore engine + native ports into the client before
        // starting (idempotent). Without this the client has no transport and
        // `start` throws `SdkClientError.noTransport`.
        SdkBootstrap.attach()
        do {
            try await SdkClient.shared.start(baseUrl: Config.gatewayBaseURL)
        } catch {
            startupError = error.localizedDescription
            return
        }
        await auth.restore()
    }
}
