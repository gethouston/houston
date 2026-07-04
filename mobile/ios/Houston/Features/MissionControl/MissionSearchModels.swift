import Foundation

/// One ranked mission match returned by the `missions/search` command. Mirrors
/// the SDK's `MissionMatch` (`packages/sdk/src/modules/missions-search`): a title
/// match carries no snippet (the title already shows the phrase); description and
/// content matches carry a highlighted snippet (PARITY §3).
struct MissionMatch: Decodable, Equatable, Identifiable, Sendable {
  let agentId: String
  let activityId: String
  let sessionKey: String
  let title: String
  var snippet: String?
  let matchedIn: MatchedIn

  var id: String { activityId }

  var chatRoute: ChatRoute {
    ChatRoute(sessionKey: sessionKey, agentId: agentId, title: title)
  }
}

/// Where in a mission the query matched (ranked title → description → content).
/// Tolerant: an unrecognized wire value is preserved rather than dropped.
enum MatchedIn: Decodable, Equatable, Sendable {
  case title
  case description
  case content
  case unknown(String)

  init(from decoder: Decoder) throws {
    switch try decoder.singleValueContainer().decode(String.self) {
    case "title": self = .title
    case "description": self = .description
    case "content": self = .content
    case let other: self = .unknown(other)
    }
  }

  /// A title match never highlights a snippet (PARITY §3).
  var showsSnippet: Bool { self != .title }
}

/// The `missions/search` command payload.
struct MissionSearchPayload: Encodable {
  let query: String
  var agentId: String?
}

/// The rendered state of the search surface (PARITY §3 copy in `Strings.Search`).
enum MissionSearchState: Equatable {
  /// No active query — the board/archived view shows instead.
  case idle
  /// A debounced query is in flight (shows the "Searching mission text" state).
  case searching
  /// Ranked results (never empty in this case).
  case results([MissionMatch])
  /// The query resolved with no matches ("No matching missions").
  case empty
  /// The search command failed ("Couldn't search every mission").
  case failed
}
