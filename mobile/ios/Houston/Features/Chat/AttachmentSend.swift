import Foundation

/// The attachment-aware send pipeline for ``ChatScreenModel``: staging picked
/// files, uploading them, weaving the saved paths into the message, and the
/// two send flows (into an existing conversation vs. a draft's first send).
/// Split from the model's lifecycle so ``ChatScreenModel`` stays under the file
/// cap; the flow is unchanged (client-architecture.md, invariant 1 — behavior
/// lives in `@houston/sdk`, this only orchestrates its commands).
extension ChatScreenModel {
  /// Send into an already-bound conversation: upload attachments, weave, send.
  /// On success ONLY the just-sent files clear; on failure they stay staged and
  /// the draft text is restored so the user can retry (no silent loss).
  func sendExisting(conversationId: String, text: String, files: [StagedAttachment]) async {
    do {
      let message = try await weave(text: text, files: files, scopeId: conversationId)
      try await commands.send(
        agentId: agentId, conversationId: conversationId, text: message,
        model: selectedModel, effort: selectedEffort)
      clearSent(files)
    } catch {
      draft = text
      actionError = (error as? CommandError)?.message ?? error.localizedDescription
    }
  }

  /// A draft's first send: create the activity, then upload + send the first
  /// turn, then bind + observe the real conversation. Subscribe BEFORE sending
  /// so no live frame is missed. On failure, roll the activity back and restore
  /// the draft text (staged files stay staged) so the user can retry (PARITY §6
  /// / `create-mission.ts`).
  func createAndSend(text: String, files: [StagedAttachment]) async {
    let title = MissionTitle.fallback(from: text)
    do {
      let created = try await commands.create(agentId: agentId, title: title, description: text)
      do {
        bindConversation(sessionKey: created.sessionKey)
        let message = try await weave(text: text, files: files, scopeId: created.sessionKey)
        try await commands.send(
          agentId: agentId, conversationId: created.sessionKey, text: message,
          model: selectedModel, effort: selectedEffort)
      } catch {
        unbindConversation()
        await rollback(activityId: created.id)
        throw error
      }
      clearSent(files)
      await observe()
      // deferred: no title-summarize command is exposed over the SDK bridge
      // (only activities/{create,setStatus,rename,delete}); the fallback title
      // stands, and the engine may still refresh it server-side.
    } catch {
      draft = text
      actionError = (error as? CommandError)?.message ?? error.localizedDescription
    }
  }

  /// Upload staged files under `scopeId`, then weave the saved paths into the
  /// message via ``AttachmentMessage``. No files → the text is returned
  /// unchanged (no upload round-trip). An upload failure throws, so the caller
  /// keeps the attachments staged and surfaces the reason.
  private func weave(
    text: String, files: [StagedAttachment], scopeId: String
  ) async throws -> String {
    guard !files.isEmpty else { return text }
    let uploads = files.map {
      AttachmentUpload(name: $0.name, contentBase64: $0.data.base64EncodedString())
    }
    let paths = try await commands.saveAttachments(
      agentId: agentId, scopeId: scopeId, files: uploads)
    return AttachmentMessage.encode(text: text, paths: paths, names: files.map(\.name))
  }

  /// Drop ONLY the files that were just sent, by id, so anything the user staged
  /// DURING the in-flight upload/send (the composer's "+" stays live) survives
  /// for the next send instead of being wiped by a blanket clear — no silent loss.
  private func clearSent(_ sent: [StagedAttachment]) {
    let sentIds = Set(sent.map(\.id))
    stagedAttachments.removeAll { sentIds.contains($0.id) }
  }

  /// Stage picked files (from the file importer or photo picker), applying the
  /// per-file AND total-batch size caps. A file that breaches either cap is
  /// reported in an alert (its own copy per reason) rather than silently dropped.
  func stageAttachments(_ picked: [(name: String, data: Data)]) {
    var current = stagedAttachments
    var rejected: [AttachmentStaging.Rejection] = []
    for item in picked {
      let outcome = AttachmentStaging.adding(current, name: item.name, data: item.data)
      current = outcome.staged
      rejected.append(contentsOf: outcome.rejected)
    }
    stagedAttachments = current
    let tooLarge = rejected.filter { $0.reason == .fileTooLarge }.map(\.name)
    let batchFull = rejected.filter { $0.reason == .batchFull }.map(\.name)
    if !tooLarge.isEmpty {
      attachmentError = Strings.Chat.Attachments.tooLargeBody(tooLarge.joined(separator: ", "))
    } else if !batchFull.isEmpty {
      attachmentError = Strings.Chat.Attachments.batchFullBody(batchFull.joined(separator: ", "))
    }
  }
}
