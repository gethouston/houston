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
  /// Messages typed while a turn runs — held and flushed as ONE combined send
  /// when the turn settles (additive; absent when none). Rendered as pending
  /// bubbles above the composer so the user sees their queued texts. Queueing
  /// itself is behavior owned by the SDK/engine adapter, never the surface; this
  /// surface only mirrors the published list (client-architecture.md invariant 1).
  var queued: [QueuedMessageVM]?
}

/// A message queued while a turn runs (SDK `QueuedMessageVM`, `vm-output.ts`):
/// a stable id, the user's text, and any attachment names. Rendered visually
/// pending; removable once the SDK bridge exposes the remove seam.
struct QueuedMessageVM: Decodable, Equatable, Identifiable, Sendable {
  let id: String
  let text: String
  /// Attachment file names shown alongside the queued text; absent when none.
  var attachmentNames: [String]?
}

/// A single reactive feed entry: a stable id plus the raw push payload. The
/// typed `FeedItem` projection is derived on demand via ``item`` so a decode of
/// the whole VM never fails on an unrecognized `feed_type`.
struct FeedItemVM: Decodable, Equatable, Identifiable, Sendable {
  let id: String
  let feedType: String
  let data: JSONValue
  /// Wall-clock time this frame is attributed to, projected from the SDK's
  /// optional `ts` (epoch milliseconds → `Date`). The SDK sets it only for frames
  /// it can attribute to a source message (`history.ts` / `vm-output.ts`), so it
  /// is ABSENT on older data and on unattributable frames — every consumer treats
  /// it as optional. Decoded by hand because the wire value is a millisecond
  /// number, not a `Date` the default strategy would understand.
  let ts: Date?

  private enum CodingKeys: String, CodingKey {
    case id
    case feedType = "feed_type"
    case data
    case ts
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decode(String.self, forKey: .id)
    feedType = try container.decode(String.self, forKey: .feedType)
    data = try container.decode(JSONValue.self, forKey: .data)
    if let millis = try container.decodeIfPresent(Double.self, forKey: .ts) {
      ts = Date(timeIntervalSince1970: millis / 1000)
    } else {
      ts = nil
    }
  }

  /// Direct construction for tests and in-memory feeds; `ts` defaults absent.
  init(id: String, feedType: String, data: JSONValue, ts: Date? = nil) {
    self.id = id
    self.feedType = feedType
    self.data = data
    self.ts = ts
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
