import Foundation

// Agent-picker sheet copy. Added on this surface (not the shared `Strings.swift`).
// The picker prompt itself lives in the shared `Strings.AgentPicker` (PARITY §6);
// this holds only the sheet chrome (nav title + cancel) and the no-agents state.
// The compose action that opens this sheet is created inside the DRAFT chat now,
// so there is no separate composer screen or its copy here anymore.
extension Strings {
  enum NewMission {
    /// Sheet/nav title for the picker.
    static let title = String(localized: "newMission.title", defaultValue: "New mission")
    /// Cancel / dismiss the sheet.
    static let cancel = String(localized: "newMission.cancel", defaultValue: "Cancel")
    /// Shown when there are no agents to pick from (mirrors the board's copy).
    static let noAgentsTitle = String(localized: "newMission.noAgentsTitle", defaultValue: "No agents yet")
    static let noAgentsDescription = String(localized: "newMission.noAgentsDescription", defaultValue: "Build your AI team and ship the impossible.")
  }
}
