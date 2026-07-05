import Foundation

// New-mission flow copy. Added on this surface (not the shared `Strings.swift`).
// Agent-picker copy already lives in the shared `Strings.AgentPicker` (PARITY §6);
// this holds only the composer + sheet chrome.
extension Strings {
  enum NewMission {
    /// Sheet/nav title for the whole flow.
    static let title = "New mission"
    /// Composer prompt placeholder.
    static let composerPlaceholder = "Describe the mission..."
    /// Send action.
    static let send = "Send"
    /// Cancel / dismiss the sheet.
    static let cancel = "Cancel"
    /// Shown when there are no agents to pick from (mirrors the board's copy).
    static let noAgentsTitle = "No agents yet"
    static let noAgentsDescription = "Build your AI team and ship the impossible."
  }
}
