import SwiftUI

/// Renders one folded ``ChatRow`` to its catalog view (PARITY §5). The row is
/// already filtered by ``MissionFeedFold`` (cancelled/unknown dropped, results
/// paired), so this is a pure, total switch — every rendered case has a home.
struct FeedRow: View {
  let row: ChatRow

  var body: some View {
    switch row.kind {
    case let .user(text, author):
      UserBubble(text: text, author: author)
    case let .assistant(text, streaming):
      AssistantBubble(text: text, streaming: streaming)
    case let .thinking(text, streaming):
      ThinkingBlock(text: text, streaming: streaming)
    case let .tool(call, result):
      ToolChipView(call: call, result: result)
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
    case let .missionLog(result):
      MissionLogBlock(result: result)
    }
  }
}
