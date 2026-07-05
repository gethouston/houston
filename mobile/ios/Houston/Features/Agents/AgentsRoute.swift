import Foundation

/// The navigation stack owned by the Agents tab. One `NavigationStack` roots the
/// whole tab, so every push — an agent's missions screen, a mission's chat, an
/// agent's archived list — is a value on this route. Centralizing the routes
/// here (rather than nesting a stack per screen) lets `AgentMissionsView` and
/// `AgentArchivedMissionsView` push chat/archived through simple callbacks
/// without owning navigation state themselves.
///
/// `Hashable` is implemented over a stable string `key` because the payloads —
/// ``AgentListItem`` — are not `Hashable` (owned by the bridge models); the
/// agent `id` (and, for chat, the session key) is the stable navigation key.
enum AgentsNavRoute: Hashable {
    /// An agent's per-agent missions screen (pushed from a contact row).
    case missions(AgentListItem)
    /// A mission's chat (pushed from a mission row or the archived list).
    case chat(ChatRoute)
    /// An agent's archived missions list (PARITY §2), pushed from its bottom row.
    case archived(AgentListItem)

    private var key: String {
        switch self {
        case let .missions(agent): return "missions:\(agent.id)"
        case let .chat(route): return "chat:\(route.sessionKey)"
        case let .archived(agent): return "archived:\(agent.id)"
        }
    }

    static func == (lhs: AgentsNavRoute, rhs: AgentsNavRoute) -> Bool { lhs.key == rhs.key }
    func hash(into hasher: inout Hasher) { hasher.combine(key) }
}
