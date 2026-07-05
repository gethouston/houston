import Foundation

/// One render-ready row of the mission chat, carrying a STABLE id so a streaming
/// assistant/thinking bubble updates in place (no flicker, no re-identify) — the
/// id is the SDK's own `FeedItemVM.id`, preserved across streaming updates
/// (`vm-output.ts`).
struct ChatRow: Identifiable, Equatable {
  let id: String
  let kind: Kind

  enum Kind: Equatable {
    case user(text: String, author: String?)
    case assistant(text: String, streaming: Bool)
    case thinking(text: String, streaming: Bool)
    case tool(ToolCall, result: ToolResult?)
    case toolRuntimeError(ToolRuntimeError)
    case providerError(ProviderError)
    case system(String)
    case contextCompacted
    case providerSwitched(provider: String, summarized: Bool)
    case fileChanges(created: [String], modified: [String])
    case missionLog(FinalResult)
  }
}

/// Folds the SDK conversation feed into render-ready rows, mirroring the desktop
/// UI-layer fold (`ui/chat/src/feed-to-messages.ts`) — the presentation catalog,
/// not behavior:
/// - `cancelled` provider errors and unmodeled items are dropped (PARITY §5,
///   BRIDGE.md §4 inert).
/// - duplicate provider errors (same kind + provider) collapse to one card.
/// - a "Session error:" system line is suppressed once an error card covers the
///   conversation (no double-reporting).
/// - a `tool_result` attaches to its most recent unfilled `tool_call` chip.
/// - user bubbles carry an author label only when the conversation has 2+
///   distinct authors (multiplayer).
enum MissionFeedFold {
  static func rows(from feed: [FeedItemVM]) -> [ChatRow] {
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
    // Index (into `rows`) of the last tool chip still awaiting its result.
    var pendingToolRow: Int?

    for entry in feed {
      switch entry.item {
      case let .assistantText(text, streaming):
        pendingToolRow = nil
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
        rows.append(.init(id: entry.id, kind: .assistant(text: text, streaming: streaming)))

      case let .thinking(text, streaming):
        pendingToolRow = nil
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || streaming else {
          continue
        }
        rows.append(.init(id: entry.id, kind: .thinking(text: text, streaming: streaming)))

      case let .userMessage(text, author):
        pendingToolRow = nil
        let label = multiAuthor ? (author?.name ?? author?.userId) : nil
        rows.append(.init(id: entry.id, kind: .user(text: text, author: label)))

      case let .toolCall(call):
        rows.append(.init(id: entry.id, kind: .tool(call, result: nil)))
        pendingToolRow = rows.count - 1

      case let .toolResult(result):
        attach(result: result, to: pendingToolRow, in: &rows)
        pendingToolRow = nil

      case let .toolRuntimeError(err):
        pendingToolRow = nil
        rows.append(.init(id: entry.id, kind: .toolRuntimeError(err)))

      case let .providerError(err):
        pendingToolRow = nil
        guard err.presentation != nil else { continue }  // drops cancelled / future kinds
        guard seenProviderErrors.insert(err.dedupeKey).inserted else { continue }
        rows.append(.init(id: entry.id, kind: .providerError(err)))

      case let .systemMessage(text):
        pendingToolRow = nil
        if hasErrorCard && text.hasPrefix("Session error:") { continue }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
        rows.append(.init(id: entry.id, kind: .system(text)))

      case .contextCompacted:
        pendingToolRow = nil
        rows.append(.init(id: entry.id, kind: .contextCompacted))

      case let .providerSwitched(data):
        pendingToolRow = nil
        rows.append(
          .init(
            id: entry.id,
            kind: .providerSwitched(provider: data.provider, summarized: data.summarized)))

      case let .fileChanges(data):
        pendingToolRow = nil
        guard !data.created.isEmpty || !data.modified.isEmpty else { continue }
        rows.append(
          .init(id: entry.id, kind: .fileChanges(created: data.created, modified: data.modified)))

      case let .finalResult(result):
        pendingToolRow = nil
        rows.append(.init(id: entry.id, kind: .missionLog(result)))

      case .unknown:
        pendingToolRow = nil  // inert: render nothing (BRIDGE.md §4)
        continue
      }
    }
    return rows
  }

  private static func attach(result: ToolResult, to index: Int?, in rows: inout [ChatRow]) {
    guard let index, case let .tool(call, nil) = rows[index].kind else { return }
    rows[index] = .init(id: rows[index].id, kind: .tool(call, result: result))
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
    case let .unauthenticated(p, _, _): return "unauthenticated:\(p)"
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
