import Foundation

// Mission Control surface copy. Added here (not in the shared `Strings.swift`) so
// this surface owns its strings without colliding on the shared file. The EXACT
// en copy from PARITY.md / the desktop locale files (dashboard.json, board.json).
extension Strings {
  enum MissionControl {
    // Card action confirmations (board.json:bulk.confirmArchive, singular form).
    static let archiveConfirmTitle = "Archive missions?"
    static func archiveConfirmBody(_ count: Int) -> String {
      count == 1
        ? "Archive 1 mission? You can reopen it from the Archived tab."
        : "Archive \(count) missions? You can reopen them from the Archived tab."
    }
    static let archiveConfirmAction = "Archive"
    /// The menu/swipe action label (board.json:bulk.archive).
    static let archiveAction = "Archive"
    static let cancel = "Cancel"

    // Rename dialog (board.json:cardActions.rename → "Change title").
    static let renameTitle = "Change title"
    static let renamePlaceholder = "Mission title"
    static let renameSave = "Save"

    // Segmented status pager (accessibility + labels come from BoardColumn).
    static let statusPagerLabel = "Mission status"

    // Generic title for a failed card action (the message carries the detail).
    static let actionFailedTitle = "Something went wrong"

    // Placeholder when the Chat feature is not yet wired (pre-integration).
    static let chatUnavailable = "Opening this mission's chat is not available yet."
  }
}
