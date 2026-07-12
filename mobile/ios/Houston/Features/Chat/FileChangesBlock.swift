import SwiftUI

/// The file-change summary attached after an assistant reply (PARITY §5): an
/// "Updates made" heading over new-file / files-updated counts and the changed
/// paths, on a soft card.
struct FileChangesBlock: View {
  @Environment(\.theme) private var theme
  let created: [String]
  let modified: [String]

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.space6) {
      HStack(spacing: Spacing.space6) {
        Image(systemName: "doc.badge.gearshape")
          .font(Typography.caption)
          .foregroundStyle(theme.inkMuted)
        Text(Strings.Chat.updatesMade)
          .font(Typography.label)
          .foregroundStyle(theme.ink)
      }
      ForEach(FileChangesSummary.lines(created: created, modified: modified), id: \.self) { line in
        Text(line)
          .font(Typography.caption)
          .foregroundStyle(theme.inkMuted)
      }
      ForEach(paths, id: \.self) { path in
        Text(path)
          .font(Typography.caption)
          .foregroundStyle(theme.inkMuted)
          .lineLimit(1)
          .truncationMode(.middle)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, Spacing.space12)
    .padding(.vertical, Spacing.space8)
    .background(theme.chipSubtle, in: RoundedRectangle(cornerRadius: Radius.lg))
  }

  private var paths: [String] { created + modified }
}
