import Foundation

/// One render-ready row of the mission chat, carrying a STABLE id so a streaming
/// assistant/process row updates in place (no flicker, no re-identify) — the id
/// is the SDK's own `FeedItemVM.id`, preserved across streaming updates
/// (`vm-output.ts`).
struct ChatRow: Identifiable, Equatable {
  let id: String
  let kind: Kind

  enum Kind: Equatable {
    case user(text: String, author: String?)
    case assistant(text: String, streaming: Bool)
    /// Reasoning + tool activity folded into ONE collapsible process block
    /// (PARITY §4). `final_result` produces no row.
    case process(ProcessGroup)
    case toolRuntimeError(ToolRuntimeError)
    case providerError(ProviderError)
    case system(String)
    case contextCompacted
    case providerSwitched(provider: String, summarized: Bool)
    case fileChanges(created: [String], modified: [String])
  }
}

/// Folds the SDK conversation feed into render-ready rows, mirroring the desktop
/// UI-layer fold (`ui/chat/src/feed-to-messages.ts` + `chat-process-groups.ts`) —
/// the presentation catalog, not behavior:
/// - `thinking` + `tool_call`/`tool_result` collapse into ONE process block per
///   run of activity between visible messages (PARITY §4).
/// - `final_result` renders NOTHING (`feed-to-messages.ts:359` is flush-only);
///   the reply is the assistant bubble (PARITY §4).
/// - `cancelled` provider errors and unmodeled items are dropped.
/// - duplicate provider errors (same kind + provider) collapse to one card.
/// - a "Session error:" system line is suppressed once an error card covers the
///   conversation (no double-reporting).
/// - user bubbles carry an author label only in multiplayer (2+ authors).
enum MissionFeedFold {
  static func rows(from feed: [FeedItemVM], running: Bool = false) -> [ChatRow] {
    let multiAuthor = distinctAuthorCount(feed) >= 2
    let hasErrorCard = feed.contains { item in
      switch item.item {
      case let .providerError(err): return err.presentation != nil
      case .toolRuntimeError: return true
      default: return false
      }
    }

    var rows: [ChatRow] = []
    var seenProviderErrors = Set<String>()
    var process: [ProcessItem] = []
    var processId: String?
    var pendingTool: Int?

    func flushProcess() {
      defer { process = []; processId = nil; pendingTool = nil }
      guard let id = processId, !process.isEmpty else { return }
      rows.append(.init(id: id, kind: .process(ProcessGroup(id: id, items: process, active: false))))
    }

    for entry in feed {
      switch entry.item {
      case let .assistantText(text, streaming):
        flushProcess()
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
        rows.append(.init(id: entry.id, kind: .assistant(text: text, streaming: streaming)))

      case let .thinking(text, streaming):
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || streaming else {
          continue
        }
        if processId == nil { processId = entry.id }
        process.append(.reasoning(id: entry.id, text: text, streaming: streaming))
        pendingTool = nil

      case let .userMessage(text, author):
        flushProcess()
        let label = multiAuthor ? (author?.name ?? author?.userId) : nil
        rows.append(.init(id: entry.id, kind: .user(text: text, author: label)))

      case let .toolCall(call):
        if processId == nil { processId = entry.id }
        process.append(.tool(id: entry.id, call: call, result: nil))
        pendingTool = process.count - 1

      case let .toolResult(result):
        if let index = pendingTool, case let .tool(id, call, nil) = process[index] {
          process[index] = .tool(id: id, call: call, result: result)
        }
        pendingTool = nil

      case let .toolRuntimeError(err):
        flushProcess()
        rows.append(.init(id: entry.id, kind: .toolRuntimeError(err)))

      case let .providerError(err):
        flushProcess()
        guard err.presentation != nil else { continue }  // drops cancelled / future kinds
        guard seenProviderErrors.insert(err.dedupeKey).inserted else { continue }
        rows.append(.init(id: entry.id, kind: .providerError(err)))

      case let .systemMessage(text):
        flushProcess()
        if hasErrorCard && text.hasPrefix("Session error:") { continue }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
        rows.append(.init(id: entry.id, kind: .system(text)))

      case .contextCompacted:
        flushProcess()
        rows.append(.init(id: entry.id, kind: .contextCompacted))

      case let .providerSwitched(data):
        flushProcess()
        rows.append(
          .init(
            id: entry.id,
            kind: .providerSwitched(provider: data.provider, summarized: data.summarized)))

      case let .fileChanges(data):
        flushProcess()
        guard !data.created.isEmpty || !data.modified.isEmpty else { continue }
        rows.append(
          .init(id: entry.id, kind: .fileChanges(created: data.created, modified: data.modified)))

      case .finalResult:
        // PARITY §4: final_result flushes the turn and renders NOTHING; the reply
        // is the assistant bubble. It never duplicates the reply.
        flushProcess()

      case .unknown:
        continue  // inert: never breaks an open process group (BRIDGE.md §4)
      }
    }
    flushProcess()
    return markTrailingActive(rows, running: running)
  }

  /// The trailing process block of a still-running turn is the active one — its
  /// header shimmers and shows the present-tense verb (`chat-process-block.tsx`
  /// `isActive`). A settled turn, or one whose last row is a streaming reply,
  /// leaves every block settled.
  private static func markTrailingActive(_ rows: [ChatRow], running: Bool) -> [ChatRow] {
    guard running, let last = rows.indices.last,
      case let .process(group) = rows[last].kind
    else { return rows }
    var rows = rows
    rows[last] = .init(
      id: group.id, kind: .process(ProcessGroup(id: group.id, items: group.items, active: true)))
    return rows
  }

  private static func distinctAuthorCount(_ feed: [FeedItemVM]) -> Int {
    var ids = Set<String>()
    for entry in feed {
      if case let .userMessage(_, author) = entry.item {
        ids.insert(author?.userId ?? "")
      }
    }
    return ids.count
  }
}

extension ProviderError {
  /// Collapse key for duplicate-card suppression: `kind:provider`
  /// (`feed-to-messages.ts`). Only meaningful for kinds that render.
  var dedupeKey: String {
    switch self {
    case let .rateLimited(p, _, _, _): return "rate_limited:\(p)"
    case let .quotaExhausted(p, _, _, _, _): return "quota_exhausted:\(p)"
    case let .usageLimitPaused(p, _, _): return "usage_limit_paused:\(p)"
    case let .modelUnavailable(p, _, _, _, _): return "model_unavailable:\(p)"
    case let .unauthenticated(p, _, _, _): return "unauthenticated:\(p)"
    case let .networkUnreachable(p, _): return "network_unreachable:\(p)"
    case let .providerInternal(p, _, _): return "provider_internal:\(p)"
    case let .sessionResumeMissing(p, _): return "session_resume_missing:\(p)"
    case let .malformedResponse(p, _): return "malformed_response:\(p)"
    case let .spawnFailed(p, _, _): return "spawn_failed:\(p)"
    case let .cancelled(p): return "cancelled:\(p)"
    case let .unknown(p, _): return "unknown:\(p)"
    case let .unrecognized(kind, _): return "\(kind):"
    }
  }
}
