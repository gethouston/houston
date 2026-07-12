import SwiftUI

/// The search surface body (PARITY §3): renders one of the four states for a
/// non-empty query — searching, results (title + highlighted snippet), no match,
/// or failure — using the exact `Strings.Search` copy. A result row opens the
/// mission's chat on tap. `.idle` is never rendered here (the parent shows the
/// board instead when the query is empty).
struct MissionSearchResultsView: View {
  @Environment(\.theme) private var theme
  let state: MissionSearchState
  let query: String
  let onOpen: (ChatRoute) -> Void

  var body: some View {
    Group {
      switch state {
      case .idle:
        EmptyView()
      case .searching:
        EmptyStateView(
          title: Strings.Search.searchingTitle,
          description: Strings.Search.searchingDescription,
          systemImage: "magnifyingglass"
        )
      case .empty:
        EmptyStateView(
          title: Strings.Search.emptyTitle,
          description: Strings.Search.emptyDescription,
          systemImage: "magnifyingglass"
        )
      case .failed:
        EmptyStateView(
          title: Strings.Search.historyErrorTitle,
          description: Strings.Search.historyErrorDescription,
          systemImage: "exclamationmark.triangle"
        )
      case let .results(matches):
        resultsList(matches)
      }
    }
    .background(theme.input)
  }

  private func resultsList(_ matches: [MissionMatch]) -> some View {
    List {
      ForEach(matches) { match in
        Button { onOpen(match.chatRoute) } label: {
          row(match)
        }
        .buttonStyle(.plain)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
  }

  private func row(_ match: MissionMatch) -> some View {
    VStack(alignment: .leading, spacing: Spacing.space4) {
      Text(match.title)
        .font(Typography.bodyMedium)
        .foregroundStyle(theme.ink)
        .lineLimit(2)
      if match.matchedIn.showsSnippet, let snippet = match.snippet, !snippet.isEmpty {
        HighlightedText(text: snippet, query: query)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, Spacing.space6)
  }
}
