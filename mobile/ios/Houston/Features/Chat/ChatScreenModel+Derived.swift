import Foundation

/// The mission chat's derived view state: the pure projections of the live
/// conversation VM the view reads. Split out of ``ChatScreenModel`` so the model
/// file stays about lifecycle + actions. Every property here only READS the bound
/// `conversation` snapshot — no behavior, no mutation (client-architecture.md,
/// invariant 1). All resolve to sensible empties when `conversation` is `nil`
/// (an unsent draft), so the composer is active over an empty feed.
extension ChatScreenModel {
  var vm: ConversationVM? { conversation?.snapshot }
  var rows: [ChatRow] { MissionFeedFold.rows(from: vm?.feed ?? [], running: running) }
  var running: Bool { vm?.running ?? false }
  var isEmpty: Bool { vm?.feed.isEmpty ?? true }

  /// Wall-clock times keyed by ``ChatRow`` id, for the timeline's day separators,
  /// grouping, and floating date pill (``MissionFeed``). A folded row's id is its
  /// first feed entry's id, so keying by feed-entry id resolves every row. Frames
  /// without a `ts` (older data, unattributable frames) are simply omitted, so the
  /// timeline degrades to a flat feed — a read-only projection, no behavior.
  var timestampsById: [String: Date] {
    var map: [String: Date] = [:]
    for entry in vm?.feed ?? [] {
      if let ts = entry.ts { map[entry.id] = ts }
    }
    return map
  }

  /// Messages queued while the turn runs, rendered as pending bubbles above the
  /// composer (PARITY §7). Empty until the SDK bridge publishes a `queued` list.
  var queued: [QueuedMessageVM] { vm?.queued ?? [] }

  /// The in-flight display status (mirrors desktop `deriveStatus`, `chat-status.ts`).
  var chatStatus: ChatStatus { ChatStatus.derive(feed: vm?.feed ?? [], running: running) }

  /// Whether the pending-assistant slot (pulsing helmet) shows: a turn is in
  /// flight and no assistant text is streaming (`status == submitted`). It stays
  /// up through reasoning + tool phases and vanishes the instant the reply
  /// streams (PARITY §1, HOU-655).
  var showPending: Bool { running && chatStatus != .streaming }

  /// Whether the standalone "Mission in progress..." label shows above the
  /// helmet: only while pending AND no active process block already surfaces it
  /// (PARITY §1, desktop `shouldShowThinkingIndicator`).
  var showPendingLabel: Bool { showPending && !hasActiveProcess }

  /// The composer placeholder: a first message starts a mission; once the user
  /// has spoken it reads like a messenger. A draft has no feed yet, so it shows
  /// the new-mission prompt (selection lives in ``ComposerLogic/placeholder(hasUserMessage:)``).
  var composerPlaceholder: String {
    ComposerLogic.placeholder(hasUserMessage: hasUserMessage)
  }

  private var hasActiveProcess: Bool {
    if case let .process(group)? = rows.last?.kind { return group.active }
    return false
  }

  private var hasUserMessage: Bool {
    vm?.feed.contains { if case .userMessage = $0.item { return true }; return false } ?? false
  }
}
