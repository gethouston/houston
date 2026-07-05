import Foundation

/// One board item (mission) inside the `activities/<agentId>` scope snapshot.
///
/// Mirrors the SDK activities module's `ActivityItem`
/// (`packages/sdk/src/modules/activities/types.ts`). `status` is a tolerant enum
/// (unknown values preserved verbatim) because the domain forward-compat rule
/// preserves unrecognized statuses and a surface renders them neutrally
/// (PARITY §1).
struct ActivityItem: Decodable, Equatable, Identifiable, Sendable {
  let id: String
  let title: String
  /// The user's first message (raw; a surface decodes the `houston:` marker).
  var description: String?
  /// Canonical status incl. `archived`; unknown values pass through unchanged.
  let status: ActivityStatus
  /// ISO timestamp of the last change, when the wire carries one.
  var updatedAt: String?
  /// The chat/session address — the wire `session_key`, or `activity-<id>`.
  let sessionKey: String
  /// Present when this activity is a routine's chat.
  var routineId: String?
  /// The agent-mode/config the mission runs under, when set.
  var agent: String?
  var worktreePath: String?
  var provider: String?
  var model: String?
}

/// The `activities/<agentId>` scope view-model: the whole snapshot, republished
/// on any change. `loaded` is `false` until the first list resolves.
struct ActivitiesViewModel: Decodable, Equatable, Sendable {
  let loaded: Bool
  let items: [ActivityItem]
}

/// The canonical activity statuses (`packages/domain/src/activities.ts`), plus a
/// tolerant `unknown` case that preserves an unrecognized wire value. `cancelled`
/// is a tolerant alias the board folds into Done (PARITY §1) — kept as `unknown`
/// here so the surface owns the column mapping.
enum ActivityStatus: Decodable, Equatable, Sendable {
  case running
  case needsYou
  case done
  case error
  case archived
  case unknown(String)

  init(raw: String) {
    switch raw {
    case "running": self = .running
    case "needs_you": self = .needsYou
    case "done": self = .done
    case "error": self = .error
    case "archived": self = .archived
    default: self = .unknown(raw)
    }
  }

  init(from decoder: Decoder) throws {
    self.init(raw: try decoder.singleValueContainer().decode(String.self))
  }

  var raw: String {
    switch self {
    case .running: return "running"
    case .needsYou: return "needs_you"
    case .done: return "done"
    case .error: return "error"
    case .archived: return "archived"
    case let .unknown(value): return value
    }
  }
}
