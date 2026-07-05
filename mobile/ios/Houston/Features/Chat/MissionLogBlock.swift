import SwiftUI

/// The settled turn summary (PARITY §5): the `final_result` flushed as a
/// "Mission log" block — a heading over the result text, with optional duration
/// and cost metadata when the provider reported them.
struct MissionLogBlock: View {
  @Environment(\.theme) private var theme
  let result: FinalResult

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.space6) {
      HStack(spacing: Spacing.space6) {
        Image(systemName: "checkmark.seal")
          .font(Typography.caption)
          .foregroundStyle(theme.success)
        Text(Strings.Chat.missionLog)
          .font(Typography.label)
          .foregroundStyle(theme.foreground)
      }
      if !result.result.isEmpty {
        Text(result.result)
          .font(Typography.callout)
          .foregroundStyle(theme.foreground)
          .fixedSize(horizontal: false, vertical: true)
          .textSelection(.enabled)
      }
      if let meta = metadata {
        Text(meta)
          .font(Typography.caption)
          .foregroundStyle(theme.mutedFg)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(Spacing.space12)
    .background(theme.muted, in: RoundedRectangle(cornerRadius: Radius.lg))
  }

  /// A compact "· "-joined metadata line, or `nil` when nothing was reported.
  private var metadata: String? {
    var parts: [String] = []
    if let ms = result.durationMs, ms > 0 {
      parts.append(String(format: "%.1fs", ms / 1000))
    }
    if let cost = result.costUsd, cost > 0 {
      parts.append(String(format: "$%.2f", cost))
    }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
  }
}
