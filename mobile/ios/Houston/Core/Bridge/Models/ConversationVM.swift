import Foundation

/// The reactive snapshot published to the `conversation/<id>` scope.
///
/// Mirrors the SDK's `ConversationVM` (`packages/sdk/src/modules/turns/
/// vm-output.ts`). Read `boardStatus` alongside `sessionStatus`, never
/// `sessionStatus` alone: a user Stop (and a logged-out provider) settles
/// `sessionStatus == .error` but `boardStatus == .needsYou`, so keying red off
/// `sessionStatus` renders a normal Stop as a failure (PARITY §1).
struct ConversationVM: Decodable, Equatable, Sendable {
  let feed: [FeedItemVM]
  /// Derived: `sessionStatus == .running`. The spinner/loading flag.
  let running: Bool
  let sessionStatus: SessionStatus
  /// The persisted board-card status, or `nil` before any turn ran. The
  /// handled-vs-error signal: `needsYou` = handled / attention, `error` = a real
  /// failure.
  var boardStatus: BoardStatus?
}

/// A single reactive feed entry: a stable id plus the raw push payload. The
/// typed `FeedItem` projection is derived on demand via ``item`` so a decode of
/// the whole VM never fails on an unrecognized `feed_type`.
struct FeedItemVM: Decodable, Equatable, Identifiable, Sendable {
  let id: String
  let feedType: String
  let data: JSONValue

  private enum CodingKeys: String, CodingKey {
    case id
    case feedType = "feed_type"
    case data
  }
}

/// The session statuses a streamed turn produces (SDK `SessionStatusValue`) plus
/// the pre-turn `idle`. `starting` exists in the legacy dialect and is preserved;
/// the machinery never emits it. Unknown values are kept verbatim.
enum SessionStatus: Decodable, Equatable, Sendable {
  case idle
  case starting
  case running
  case completed
  case error
  case unknown(String)

  init(raw: String) {
    switch raw {
    case "idle": self = .idle
    case "starting": self = .starting
    case "running": self = .running
    case "completed": self = .completed
    case "error": self = .error
    default: self = .unknown(raw)
    }
  }

  init(from decoder: Decoder) throws {
    self.init(raw: try decoder.singleValueContainer().decode(String.self))
  }

  /// A live turn is in flight (spinner). `starting` is the legacy dialect the
  /// machinery never emits but is preserved for forward-compat.
  var isActive: Bool { self == .starting || self == .running }
}

/// The board-card status a streamed turn writes (SDK `BoardStatus`): `running`
/// in flight, then a terminal `needsYou` / `error`. Unknown values preserved.
enum BoardStatus: Decodable, Equatable, Sendable {
  case running
  case needsYou
  case error
  case unknown(String)

  init(raw: String) {
    switch raw {
    case "running": self = .running
    case "needs_you": self = .needsYou
    case "error": self = .error
    default: self = .unknown(raw)
    }
  }

  init(from decoder: Decoder) throws {
    self.init(raw: try decoder.singleValueContainer().decode(String.self))
  }
}
