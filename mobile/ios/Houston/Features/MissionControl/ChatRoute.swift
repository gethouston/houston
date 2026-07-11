import SwiftUI

/// The value pushed onto a `NavigationStack` to open a mission's chat.
///
/// PINNED NAV CONTRACT: Mission Control, the archived list, search results, the
/// agent picker, and the per-agent screen all navigate to the same chat surface
/// by pushing a `ChatRoute`. It carries only what the chat needs to address a
/// session.
///
/// A route is either a real mission (a `sessionKey`) or a **draft** — an empty
/// conversation with a known agent but no session yet. The draft's activity is
/// created on the chat's first send (see ``ChatScreenModel``), so `sessionKey`
/// is `nil` until then. The chat opens the same `ChatView` either way.
///
/// SEAM: the **Chat** feature owns `ChatView`, whose init is
/// `ChatView(agentId:conversationId:title:)` — the chat's `conversationId` is
/// this route's `sessionKey` (`activity-<id>`), or `nil` for a draft. It is
/// opened through the injected `chatViewBuilder` so this module stays decoupled
/// from the Chat feature. The real builder is wired at the app root in
/// `HoustonApp` (`.environment(\.chatViewBuilder, ...)`); the placeholder below
/// is only the EnvironmentKey default.
struct ChatRoute: Hashable, Identifiable {
  /// The chat/session address — the activity's `sessionKey` (`activity-<id>`),
  /// or `nil` for a draft that has not created its activity yet.
  let sessionKey: String?
  /// The owning agent, for addressing the session's sandbox.
  let agentId: String
  /// The mission title (real) or the agent name (draft) for the chat's nav title.
  let title: String
  /// Stable navigation identity. The `sessionKey` for a real mission; a fresh
  /// per-push id for a draft (two drafts must not collapse to one nav entry).
  let id: String

  /// A real mission chat, addressed by its session key.
  init(sessionKey: String, agentId: String, title: String) {
    self.sessionKey = sessionKey
    self.agentId = agentId
    self.title = title
    self.id = sessionKey
  }

  /// A draft chat: agent known, no session yet — the activity is created on the
  /// chat's first send.
  static func draft(agentId: String, title: String) -> ChatRoute {
    ChatRoute(draftAgentId: agentId, title: title)
  }

  private init(draftAgentId: String, title: String) {
    self.sessionKey = nil
    self.agentId = draftAgentId
    self.title = title
    self.id = "draft:\(UUID().uuidString)"
  }

  /// True when this route opens an empty draft (create-on-first-send).
  var isDraft: Bool { sessionKey == nil }
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
