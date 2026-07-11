import Foundation

// Mission Control surface copy. Added here (not in the shared `Strings.swift`) so
// this surface owns its strings without colliding on the shared file. The EXACT
// en copy from PARITY.md / the desktop locale files (dashboard.json, board.json).
extension Strings {
  enum MissionControl {
    // Card action confirmations (board.json:bulk.confirmArchive, singular form).
    static let archiveConfirmTitle = String(localized: "missionControl.archiveConfirmTitle", defaultValue: "Archive missions?")
    static func archiveConfirmBody(_ count: Int) -> String {
      String(localized: "missionControl.archiveConfirmBody", defaultValue: "Archive \(count) missions? You can reopen them from the Archived tab.")
    }
    static let archiveConfirmAction = String(localized: "missionControl.archiveConfirmAction", defaultValue: "Archive")
    /// The menu/swipe action label (board.json:bulk.archive).
    static let archiveAction = String(localized: "missionControl.archiveAction", defaultValue: "Archive")
    static let cancel = String(localized: "missionControl.cancel", defaultValue: "Cancel")

    // Rename dialog (board.json:cardActions.rename → "Change title").
    static let renameTitle = String(localized: "missionControl.renameTitle", defaultValue: "Change title")
    static let renamePlaceholder = String(localized: "missionControl.renamePlaceholder", defaultValue: "Mission title")
    static let renameSave = String(localized: "missionControl.renameSave", defaultValue: "Save")

    // Segmented status pager (accessibility + labels come from BoardColumn).
    static let statusPagerLabel = String(localized: "missionControl.statusPagerLabel", defaultValue: "Mission status")

    // Generic title for a failed card action (the message carries the detail).
    static let actionFailedTitle = String(localized: "missionControl.actionFailedTitle", defaultValue: "Something went wrong")

    // Placeholder when the Chat feature is not yet wired (pre-integration).
    static let chatUnavailable = String(localized: "missionControl.chatUnavailable", defaultValue: "Opening this mission's chat is not available yet.")
  }
}
