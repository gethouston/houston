import SwiftUI

/// The standalone "pick an agent to start a new mission" sheet, presented by the
/// compose button in the Agents tab and Mission Control navigation bars. It reads
/// the shared cross-agent overview, lists agents recents-first (via
/// ``NewMissionAgentPicker``), and calls `onPick` with the chosen agent. The
/// caller then opens an empty DRAFT chat for that agent.
///
/// Picking dismisses the sheet and hands the agent back through `onPick`; the
/// caller drives navigation on the sheet's `onDismiss` so the push never races
/// the dismissal. There is no per-agent variant here — the per-agent screen
/// already knows its agent and opens a draft chat with no picker.
struct AgentPickerSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.agentsOverview) private var overview

  /// Called with the agent the user picked, just before the sheet dismisses.
  let onPick: (AgentListItem) -> Void

  var body: some View {
    NavigationStack {
      NewMissionAgentPicker(
        agents: MissionAggregation.filterAgents(overview.agents),
        onPick: { agent in
          onPick(agent)
          dismiss()
        }
      )
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(Strings.NewMission.cancel) { dismiss() }
        }
      }
    }
  }
}
