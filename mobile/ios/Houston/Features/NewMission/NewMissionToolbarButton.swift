import SwiftUI

/// The "new mission" compose button shared by the Agents tab and Mission Control
/// navigation bars. Uses the iOS-native compose idiom (`square.and.pencil`) in
/// the trailing slot, labelled with the existing "New mission" copy for
/// VoiceOver. Tapping it opens the agent picker (``AgentPickerSheet``).
///
/// One `ToolbarContent` so both top tabs stay pixel- and label-identical; each
/// owns the presentation state and passes `action` to flip it.
struct NewMissionToolbarButton: ToolbarContent {
  let action: () -> Void

  var body: some ToolbarContent {
    ToolbarItem(placement: .topBarTrailing) {
      Button(action: action) {
        Image(systemName: "square.and.pencil")
      }
      .accessibilityLabel(Strings.Board.newMission)
    }
  }
}
