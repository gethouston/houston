import SwiftUI

/// Renders one folded ``ChatRow`` to its catalog view (PARITY §4/§5). The row is
/// already filtered by ``MissionFeedFold`` (cancelled/unknown dropped, results
/// paired, reasoning+tools folded), so this is a pure, total switch.
struct FeedRow: View {
  let row: ChatRow
  /// Wall-clock time of this row's source message, threaded to the user bubble
  /// only (assistant prose and other feed types show no in-line time this wave;
  /// day separators are handled by the feed). Optional: absent renders as before.
  let timestamp: Date?

  var body: some View {
    switch row.kind {
    case let .user(text, author):
      UserBubble(text: text, author: author, timestamp: timestamp)
    case let .assistant(text, _):
      AssistantMessage(text: text)
    case let .process(group):
      ProcessBlockView(group: group)
    case let .toolRuntimeError(error):
      ToolRuntimeErrorView(error: error)
    case let .providerError(error):
      // Non-nil by construction: the fold drops kinds whose presentation is nil.
      if let presentation = error.presentation {
        ProviderErrorCardView(presentation: presentation)
      }
    case let .system(text):
      SystemLineView(text: text)
    case .contextCompacted:
      FeedDivider(caption: Strings.Chat.contextCompacted)
    case let .providerSwitched(provider, summarized):
      FeedDivider(caption: ProviderSwitchCopy.label(provider: provider, summarized: summarized))
    case let .fileChanges(created, modified):
      FileChangesBlock(created: created, modified: modified)
    }
  }
}
