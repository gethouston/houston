import SwiftUI

/// The value pushed onto a `NavigationStack` to open a mission's chat.
///
/// PINNED NAV CONTRACT: Mission Control, the archived list, search results, and
/// the New Mission flow all navigate to the same chat surface by pushing a
/// `ChatRoute`. It carries only what the chat needs to address a session.
///
/// SEAM: the **Chat** feature owns `ChatView`, whose init is
/// `ChatView(agentId:conversationId:title:)` — the chat's `conversationId` is
/// this route's `sessionKey` (`activity-<id>`). It is opened through the injected
/// `chatViewBuilder` so this module stays decoupled from the Chat feature. The
/// real builder is wired at the app root in `HoustonApp`
/// (`.environment(\.chatViewBuilder, ...)`); the placeholder below is only the
/// EnvironmentKey default.
struct ChatRoute: Hashable, Identifiable {
  /// The chat/session address — the activity's `sessionKey` (`activity-<id>`).
  let sessionKey: String
  /// The owning agent, for addressing the session's sandbox.
  let agentId: String
  /// The mission title, for the chat's nav title before its own load.
  let title: String

  var id: String { sessionKey }
}

/// Builds the destination view for a `ChatRoute`. Injected so Mission Control /
/// New Mission stay decoupled from the Chat feature (see FLAG above).
typealias ChatViewBuilder = @MainActor (ChatRoute) -> AnyView

private struct ChatViewBuilderKey: EnvironmentKey {
  static let defaultValue: ChatViewBuilder = { AnyView(ChatUnavailableView(route: $0)) }
}

extension EnvironmentValues {
  /// The chat-destination builder. Defaults to a placeholder until integration
  /// injects the real `ChatView`.
  var chatViewBuilder: ChatViewBuilder {
    get { self[ChatViewBuilderKey.self] }
    set { self[ChatViewBuilderKey.self] = newValue }
  }
}

/// Placeholder shown when no real chat builder is injected (pre-integration).
/// Never a blank screen — states plainly that the chat surface is not wired yet.
private struct ChatUnavailableView: View {
  @Environment(\.theme) private var theme
  let route: ChatRoute

  var body: some View {
    EmptyStateView(
      title: route.title,
      description: Strings.MissionControl.chatUnavailable,
      systemImage: "bubble.left.and.bubble.right"
    )
    .navigationTitle(route.title)
    .navigationBarTitleDisplayMode(.inline)
    .background(theme.background)
  }
}
