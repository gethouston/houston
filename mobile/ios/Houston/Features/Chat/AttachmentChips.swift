import SwiftUI

/// The staged-attachment chips shown above the composer before send
/// (WhatsApp-style): each file as a doc-icon + name capsule with a remove
/// button. Horizontally scrollable so many files never push the composer around.
struct StagedAttachmentChips: View {
  @Environment(\.theme) private var theme
  let attachments: [StagedAttachment]
  let onRemove: (UUID) -> Void

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: Spacing.space8) {
        ForEach(attachments) { attachment in
          chip(attachment)
        }
      }
      .padding(.horizontal, ChatMetrics.inputBarHInset)
      .padding(.vertical, Spacing.space6)
    }
    .accessibilityLabel(Strings.Chat.Attachments.label)
  }

  private func chip(_ attachment: StagedAttachment) -> some View {
    HStack(spacing: Spacing.space6) {
      Image(systemName: "doc")
        .imageScale(.small)
        .foregroundStyle(theme.mutedFg)
      Text(attachment.name)
        .font(Typography.caption)
        .foregroundStyle(theme.foreground)
        .lineLimit(1)
      Button {
        onRemove(attachment.id)
      } label: {
        Image(systemName: "xmark.circle.fill")
          .imageScale(.small)
          .foregroundStyle(theme.mutedFg)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Strings.Chat.Attachments.remove(attachment.name))
    }
    .padding(.horizontal, Spacing.space10)
    .padding(.vertical, Spacing.space6)
    .background(theme.secondary, in: Capsule())
  }
}

/// A compact, read-only chips row rendered INSIDE a user bubble under the text
/// (doc icon + name on a `theme.secondary` capsule). Shown when a persisted user
/// message decodes to attachment references (``AttachmentMessage/decode(_:)``).
struct BubbleAttachmentChips: View {
  @Environment(\.theme) private var theme
  let names: [String]

  var body: some View {
    HStack(spacing: Spacing.space6) {
      ForEach(Array(names.enumerated()), id: \.offset) { _, name in
        HStack(spacing: Spacing.space4) {
          Image(systemName: "doc")
            .imageScale(.small)
          Text(name)
            .font(Typography.caption)
            .lineLimit(1)
        }
        .padding(.horizontal, Spacing.space8)
        .padding(.vertical, Spacing.space4)
        .foregroundStyle(theme.secondaryFg)
        .background(theme.secondary, in: Capsule())
      }
    }
    .accessibilityLabel(Strings.Chat.Attachments.label)
  }
}
