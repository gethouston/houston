import SwiftUI

/// The Houston helmet glyph tinted `muted-foreground`, optionally pulsing
/// (PARITY §1). Reuses the ported `HelmetShape` from the design system — the same
/// bit-exact SVG the avatar draws — filled flat (no tinted disc, no glow). The
/// pulse mirrors Tailwind `animate-pulse`: opacity 1 → .5 → 1 over 2s ease-in-out
/// forever, NO translation. Reduce Motion renders it static.
struct PulsingHelmet: View {
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var size: CGFloat
    var pulsing: Bool = true

    @State private var dimmed = false

    var body: some View {
        HelmetShape()
            .fill(theme.inkMuted)
            .frame(width: size, height: size)
            .opacity(pulsing && !reduceMotion ? (dimmed ? 0.5 : 1) : 1)
            .animation(
                pulsing && !reduceMotion
                    ? .easeInOut(duration: 1).repeatForever(autoreverses: true) : nil,
                value: dimmed
            )
            .onAppear { if pulsing { dimmed = true } }
            .accessibilityHidden(true)
    }
}

/// The pending-assistant slot shown while a turn is in flight and no assistant
/// text is streaming yet (PARITY §1, desktop `chat-messages.tsx:219-229`): the
/// shimmer status label stacked ABOVE the pulsing helmet, left-aligned. The label
/// yields to the process-block header once tool activity takes over the status
/// line (`showLabel == false`); the helmet stays up for the whole turn and
/// vanishes the instant the reply streams.
struct PendingTurnIndicator: View {
    @Environment(\.theme) private var theme
    var showLabel: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.space16) {
            if showLabel {
                Text(Strings.Chat.missionInProgress)
                    .font(Typography.caption)
                    .foregroundStyle(theme.inkMuted)
                    .shimmer(active: true)
            }
            PulsingHelmet(size: ChatMetrics.loadingHelmetSize)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, Spacing.space4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Strings.Chat.missionInProgress)
    }
}
