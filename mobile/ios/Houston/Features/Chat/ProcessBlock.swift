import Foundation

/// One folded process block (PARITY §4/§5): a run of reasoning + tool activity
/// between two visible messages, collapsed into a single collapsible block with a
/// helmet + shimmer header. Mirrors the desktop process block
/// (`chat-process-block.tsx`), whose segments are flattened here into an ordered
/// item list — enough for a faithful v1 without the desktop's per-segment panes.
struct ProcessGroup: Equatable, Identifiable {
    /// Stable id = the first item's feed id, preserved across streaming updates.
    let id: String
    var items: [ProcessItem]
    /// True only for the trailing block of a still-running turn (drives the
    /// shimmer header + present-tense verb).
    var active: Bool
}

/// One entry inside a ``ProcessGroup``: a reasoning span or a tool call (with its
/// result once it lands).
enum ProcessItem: Equatable, Identifiable {
    case reasoning(id: String, text: String, streaming: Bool)
    case tool(id: String, call: ToolCall, result: ToolResult?)

    var id: String {
        switch self {
        case let .reasoning(id, _, _): return id
        case let .tool(id, _, _): return id
        }
    }
}

/// The process-block header label (PARITY §5, `chat-process-header.ts`): while
/// active it surfaces the one current action in present tense ("Mission in
/// progress: Reading file"); before the first tool it is the bare active label;
/// once settled it reads "Mission log". Never a count of tools.
enum ProcessHeader {
    static func label(for group: ProcessGroup) -> String {
        guard group.active else { return Strings.Chat.missionLog }
        guard let name = currentActionTool(group.items) else {
            return Strings.Chat.missionInProgress
        }
        return Strings.Chat.missionInProgress(action: ToolLabel.action(name, done: false))
    }

    /// The most recently invoked tool in the block — the current step (held for
    /// the life of the active turn, not just while running), `chat-process-header`.
    private static func currentActionTool(_ items: [ProcessItem]) -> String? {
        for item in items.reversed() {
            if case let .tool(_, call, _) = item { return call.name }
        }
        return nil
    }
}

/// Tool-name → human verb (PARITY §5, `tool-labels.ts`). `done` picks past vs.
/// present tense. Intentionally English — `ui/` stays i18n-agnostic and the app
/// passes no `toolLabels`, so tool verbs read in English in every locale.
enum ToolLabel {
    private static let active: [String: String] = [
        "Read": "Reading file", "Write": "Writing file", "Edit": "Editing file",
        "Bash": "Running command", "Glob": "Searching files", "Grep": "Searching code",
        "WebSearch": "Searching the web", "WebFetch": "Fetching page",
        "ToolSearch": "Looking up tools", "Agent": "Delegating task",
    ]
    private static let done: [String: String] = [
        "Read": "Read file", "Write": "Wrote file", "Edit": "Edited file",
        "Bash": "Ran command", "Glob": "Searched files", "Grep": "Searched code",
        "WebSearch": "Searched the web", "WebFetch": "Fetched page",
        "ToolSearch": "Looked up tools", "Agent": "Delegated task",
    ]

    static func action(_ name: String, done isDone: Bool) -> String {
        let short = shortName(name)
        let map = isDone ? done : active
        return map[short] ?? short.replacingOccurrences(of: "_", with: " ")
    }

    /// SF Symbol for a tool row (PARITY §4). Falls back to a wrench.
    static func symbol(_ name: String) -> String {
        switch shortName(name) {
        case "Bash": return "terminal"
        case "Read": return "doc.text"
        case "Edit": return "pencil"
        case "Write": return "doc.badge.plus"
        case "Grep": return "magnifyingglass"
        case "Glob": return "folder"
        case "WebSearch": return "globe"
        case "WebFetch": return "arrow.down.circle"
        default: return "wrench.and.screwdriver"
        }
    }

    /// The bare tool name with any MCP `server__tool` prefix stripped.
    static func shortName(_ name: String) -> String {
        name.contains("__") ? (name.components(separatedBy: "__").last ?? name) : name
    }
}
