import PhotosUI
import SwiftUI

/// Presentation state for the composer's "+" menu and the surfaces it opens. A
/// small `@Observable` coordinator so ``ChatView`` holds ONE `@State` and the
/// heavy menu/importer/sheet wiring lives in ``ComposerAccessories`` — keeping
/// `ChatView` under the file cap.
@MainActor
@Observable
final class ComposerControls {
  var showMenu = false
  var showModelPicker = false
  var showEffort = false
  /// Opened from an interaction card's "sign in" / "connect" steps.
  var showAIModels = false
  var showIntegrations = false
  var importingFile = false
  var pickingPhoto = false
  var photoItems: [PhotosPickerItem] = []
}

extension View {
  /// Attach the composer's "+" menu, file/photo importers, and the model /
  /// effort / AI-models / integrations sheets, all driven by `controls`.
  func composerAccessories(model: ChatScreenModel, controls: ComposerControls) -> some View {
    modifier(ComposerAccessories(model: model, controls: controls))
  }
}

private struct ComposerAccessories: ViewModifier {
  let model: ChatScreenModel
  let controls: ComposerControls

  func body(content: Content) -> some View {
    @Bindable var controls = controls
    content
      .confirmationDialog(
        Strings.Chat.PlusMenu.title, isPresented: $controls.showMenu, titleVisibility: .visible
      ) {
        Button(Strings.Chat.Compose.attachFile) { controls.importingFile = true }
        Button(Strings.Chat.Compose.attachPhoto) { controls.pickingPhoto = true }
        Button(Strings.Chat.Compose.chooseModel) { controls.showModelPicker = true }
        Button(Strings.Chat.Compose.effort) { controls.showEffort = true }
      }
      .fileImporter(
        isPresented: $controls.importingFile, allowedContentTypes: [.item],
        allowsMultipleSelection: true, onCompletion: handleFileImport)
      .photosPicker(
        isPresented: $controls.pickingPhoto, selection: $controls.photoItems,
        maxSelectionCount: 0, matching: .images)
      .onChange(of: controls.photoItems) { _, items in loadPhotos(items) }
      .sheet(isPresented: $controls.showModelPicker) {
        ModelPickerSheet(agentId: model.agentId, selectedModel: model.selectedModel) {
          model.selectModel($0)
        }
      }
      .sheet(isPresented: $controls.showEffort) {
        EffortSheet(
          agentId: model.agentId, selectedModel: model.selectedModel,
          selectedEffort: model.selectedEffort
        ) { model.selectedEffort = $0 }
      }
      .sheet(isPresented: $controls.showAIModels) {
        settingsSheet { AIModelsAgentView(agentId: model.agentId) }
      }
      .sheet(isPresented: $controls.showIntegrations) {
        settingsSheet { AgentIntegrationsView(agentId: model.agentId) }
      }
  }

  /// Wrap an agent-scoped settings screen (AI Models / Integrations) for sheet
  /// presentation, adding a Done affordance — the same screens the Settings tab
  /// pushes, presented modally here since a chat has no nav stack of its own.
  private func settingsSheet(@ViewBuilder _ screen: () -> some View) -> some View {
    NavigationStack {
      screen()
        .toolbar {
          ToolbarItem(placement: .confirmationAction) {
            SheetDoneButton()
          }
        }
    }
  }

  /// Read the picked document URLs OFF the main thread (the read can force a
  /// slow iCloud/provider download), then stage what read and surface what
  /// didn't — mirroring the async photo path so the picker never freezes the UI.
  private func handleFileImport(_ result: Result<[URL], Error>) {
    switch result {
    case .success(let urls):
      Task {
        let read = await AttachmentIngest.read(urls: urls)
        model.stageAttachments(read.files)
        if !read.failed.isEmpty {
          model.actionError = Strings.Chat.Attachments.readFailed(
            read.failed.joined(separator: ", "))
        }
      }
    case .failure(let error):
      model.actionError = error.localizedDescription
    }
  }

  /// Load the picked photos' bytes, stage them, then clear the selection so the
  /// next pick re-fires `onChange`.
  private func loadPhotos(_ items: [PhotosPickerItem]) {
    guard !items.isEmpty else { return }
    Task {
      let loaded = await AttachmentIngest.load(items)
      model.stageAttachments(loaded.files)
      if loaded.failed > 0 {
        model.actionError = Strings.Chat.Attachments.readFailedPhotos(loaded.failed)
      }
      controls.photoItems = []
    }
  }
}

/// A Done button that dismisses the enclosing sheet (its own view so it can read
/// the sheet's `dismiss` environment).
private struct SheetDoneButton: View {
  @Environment(\.dismiss) private var dismiss
  var body: some View {
    Button(Strings.Chat.Compose.done) { dismiss() }
  }
}
