import Foundation

// Mission-state resolution helper and board-column vocabulary — the ONE
// resolution every surface must use. Mirrors PARITY §1 (mobile/PARITY.md)
// exactly. Logic only — no SwiftUI — so it is unit-tested directly.
//
// `SessionStatus` and `BoardStatus` (the wire vocabularies this reads) are the
// tolerant Decodable enums declared once in `Core/Bridge/Models/ConversationVM
// .swift`; they live with the model layer because they decode straight off the
// `conversation/<id>` scope. This file consumes them.

/// The resolved UI state for a mission. `needsYou` and `error` are kept distinct
/// (they share the "Needs you" column but differ in glow/affordance, PARITY §1).
enum MissionState: Equatable {
    case running
    case needsYou
    case done
    case error
    case archived
    case unknown(String)

    /// THE needs_you-vs-error pair rule (PARITY §1, vm-output.ts:36-47).
    ///
    /// Read the pair — never `sessionStatus` alone. A user Stop settles
    /// `sessionStatus == .error` but `boardStatus == .needsYou`; keying off the
    /// session status would paint a normal Stop red. A live turn dominates
    /// (moves the card to Running); once settled, `boardStatus` is authoritative.
    static func from(sessionStatus: SessionStatus?, boardStatus: BoardStatus?) -> MissionState {
        // 1. A live/active turn always wins → Running column + glow.
        if sessionStatus?.isActive == true { return .running }

        // 2. Settled: the persisted board status governs (this is where the
        //    Stop case lands as needsYou, not error).
        switch boardStatus {
        case .needsYou: return .needsYou
        case .error: return .error
        case .running: return .running
        case .unknown(let raw): return .unknown(raw)
        case nil: break
        }

        // 3. No board status recorded yet — derive from how the turn settled.
        switch sessionStatus {
        case .error: return .error
        case .completed: return .needsYou   // finished → your attention
        case .unknown(let raw): return .unknown(raw)
        case .idle, nil: return .running    // optimistic: activities start running
        case .starting, .running: return .running
        }
    }

    /// Map a persisted activity `status` string (PARITY §1 canonical wire
    /// statuses, `cancelled` folded into Done) to a state. Used for board cards
    /// whose state comes from the activity file rather than a live turn.
    static func from(activityStatus raw: String) -> MissionState {
        switch raw {
        case "running": return .running
        case "needs_you": return .needsYou
        case "done", "cancelled": return .done
        case "error": return .error
        case "archived": return .archived
        default: return .unknown(raw)
        }
    }

    /// The board column this state belongs in, or `nil` when it is off the
    /// active board (`archived`). `error` shares the Needs-you column (PARITY §1).
    var column: BoardColumn? {
        switch self {
        case .running: return .running
        case .needsYou, .error: return .needsYou
        case .done: return .done
        case .archived: return nil
        case .unknown: return nil   // unknown statuses render neutrally, off-board
        }
    }
}

/// The three kanban columns, left-to-right (PARITY §1). There is NO backlog/todo
/// column — three columns only.
enum BoardColumn: String, CaseIterable, Identifiable {
    case running
    case needsYou
    case done

    var id: String { rawValue }

    /// Left-to-right display order.
    static let ordered: [BoardColumn] = [.running, .needsYou, .done]

    /// Column header label (dashboard.json:columns).
    var label: String {
        switch self {
        case .running: return Strings.Board.columnRunning
        case .needsYou: return Strings.Board.columnNeedsYou
        case .done: return Strings.Board.columnDone
        }
    }
}
