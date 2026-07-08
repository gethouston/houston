import Foundation

// Per-agent missions-screen copy. Added as a namespaced extension on the shared
// `Strings` (DesignSystem/Strings.swift) so this surface never edits — or
// collides on — that shared file. Section headers ("Needs you" / "Running" /
// "Done"), the Archived row, the composer, and the Rename / Archive action labels
// all reuse the existing desktop-exact copy (`Strings.Board.*` /
// `Strings.MissionControl.*`); only the Delete confirmation is new here.
//
// The Delete confirmation has no desktop dialog to mirror (desktop deletes from
// a per-card icon without a modal), so the copy below is product-voice — no
// files/JSON/CLI mentions, no em dash — matching the Houston voice rules.
extension Strings {
    enum AgentMissions {
        /// The errored-mission second line — the same "snag" phrasing as the
        /// Agents-home row (`Strings.Agents.lastActivity(state: .error, …)`), but
        /// title-less here because the mission title already sits on line 1.
        /// Keeping the title off avoids the duplicate-signal this sober list is
        /// built to remove. (`working` reuses `Strings.Chat.TitleBar.working`.)
        static let snag = "Hit a snag"

        /// Destructive delete confirmation (title + body); the confirm button
        /// reuses `Strings.Board.delete` ("Delete").
        static let deleteConfirmTitle = "Delete mission?"
        static let deleteConfirmBody = "This removes the mission and its chat for good. You can't undo this."
    }
}
