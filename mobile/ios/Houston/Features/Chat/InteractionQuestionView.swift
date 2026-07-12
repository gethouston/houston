import SwiftUI

/// The `question` step body: the agent's question, its tappable option rows, and
/// a hint that the composer below is a free-text answer. Ports desktop's question
/// step (`ui/chat/interaction-card.tsx`): picking an option commits its label
/// (``InteractionStepper``) — advancing to the next question, or sending the
/// combined answer body on the last; typing free text uses the live composer
/// instead (mobile keeps it, desktop replaced it). Options disable while a send
/// is in flight so a pick never double-fires.
struct InteractionQuestionView: View {
  @Environment(\.theme) private var theme

  let question: String
  let options: [InteractionOption]
  let isSending: Bool
  let onPick: (InteractionOption) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.space12) {
      Text(question)
        .font(Typography.bodyMedium)
        .foregroundStyle(theme.ink)
        .fixedSize(horizontal: false, vertical: true)

      if !options.isEmpty {
        VStack(spacing: Spacing.space8) {
          ForEach(options) { option in
            InteractionOptionRow(
              label: option.label,
              isSending: isSending,
              action: { onPick(option) })
          }
        }
      }

      Text(Strings.Interaction.freeTextHint)
        .font(Typography.caption)
        .foregroundStyle(theme.inkMuted)
    }
  }
}

/// One full-width option row: a raised `theme.chip` chip (Radius.lg) that
/// reads clickable at rest (no hover gate). Disabled — dimmed and inert — while a
/// send is in flight.
struct InteractionOptionRow: View {
  @Environment(\.theme) private var theme

  let label: String
  let isSending: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(label)
        .font(Typography.body)
        .foregroundStyle(theme.ink)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Spacing.space12)
        .padding(.vertical, Spacing.space10)
        .background(theme.chip, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(isSending)
    .opacity(isSending ? 0.5 : 1)
  }
}
