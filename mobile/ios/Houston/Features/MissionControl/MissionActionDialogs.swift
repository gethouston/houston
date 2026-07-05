import SwiftUI

/// The Rename / Archive / error dialogs for mission actions (PARITY §1/§2),
/// factored out of `MissionControlView` so that view stays about layout. Rename
/// is an alert with a text field; Archive is a confirmation dialog with the exact
/// confirm copy; a failed action surfaces a plain error alert (never silent).
struct MissionActionDialogs: ViewModifier {
  @Binding var renameTarget: MissionCardData?
  @Binding var renameText: String
  @Binding var archiveTarget: MissionCardData?
  @Binding var actionError: String?
  let onCommitRename: () -> Void
  let onCommitArchive: () -> Void

  private var renamePresented: Binding<Bool> {
    Binding(get: { renameTarget != nil }, set: { if !$0 { renameTarget = nil } })
  }
  private var archivePresented: Binding<Bool> {
    Binding(get: { archiveTarget != nil }, set: { if !$0 { archiveTarget = nil } })
  }
  private var errorPresented: Binding<Bool> {
    Binding(get: { actionError != nil }, set: { if !$0 { actionError = nil } })
  }

  func body(content: Content) -> some View {
    content
      .alert(Strings.MissionControl.renameTitle, isPresented: renamePresented) {
        TextField(Strings.MissionControl.renamePlaceholder, text: $renameText)
        Button(Strings.MissionControl.renameSave, action: onCommitRename)
        Button(Strings.MissionControl.cancel, role: .cancel) {}
      }
      .confirmationDialog(
        Strings.MissionControl.archiveConfirmTitle,
        isPresented: archivePresented, titleVisibility: .visible
      ) {
        Button(Strings.MissionControl.archiveConfirmAction, role: .destructive, action: onCommitArchive)
        Button(Strings.MissionControl.cancel, role: .cancel) {}
      } message: {
        Text(Strings.MissionControl.archiveConfirmBody(1))
      }
      .alert(Strings.MissionControl.actionFailedTitle, isPresented: errorPresented) {
        Button(Strings.MissionControl.cancel, role: .cancel) {}
      } message: {
        Text(actionError ?? "")
      }
  }
}

extension View {
  func missionActionDialogs(
    renameTarget: Binding<MissionCardData?>,
    renameText: Binding<String>,
    archiveTarget: Binding<MissionCardData?>,
    actionError: Binding<String?>,
    onCommitRename: @escaping () -> Void,
    onCommitArchive: @escaping () -> Void
  ) -> some View {
    modifier(MissionActionDialogs(
      renameTarget: renameTarget, renameText: renameText,
      archiveTarget: archiveTarget, actionError: actionError,
      onCommitRename: onCommitRename, onCommitArchive: onCommitArchive
    ))
  }
}
