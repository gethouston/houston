import SwiftUI

/// The folded process block (PARITY §4): reasoning + tool activity in ONE inline,
/// collapsible block, collapsed by default. The header is the helmet (size 13) +
/// a muted shimmer label — "Mission in progress..." / "Mission in progress:
/// {action}" while active, "Mission log" once settled — with a chevron. Expanding
/// reveals the reasoning text and the per-tool rows.
struct ProcessBlockView: View {
    @Environment(\.theme) private var theme
    let group: ProcessGroup
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.space8) {
            header
            if expanded {
                VStack(alignment: .leading, spacing: Spacing.space12) {
                    ForEach(group.items) { item in row(for: item) }
                }
                .padding(.leading, Spacing.space6)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(.smooth(duration: Motion.fast), value: expanded)
    }

    private var header: some View {
        Button {
            expanded.toggle()
        } label: {
            HStack(spacing: Spacing.space6) {
                // Static helmet; only the label shimmers (desktop `chat-status-line`).
                PulsingHelmet(size: ChatMetrics.headerHelmetSize, pulsing: false)
                Text(ProcessHeader.label(for: group))
                    .font(Typography.caption)
                    .foregroundStyle(theme.mutedFg)
                    .lineLimit(1)
                    .shimmer(active: group.active)
                Image(systemName: "chevron.down")
                    .font(Typography.caption)
                    .foregroundStyle(theme.mutedFg)
                    .rotationEffect(.degrees(expanded ? 180 : 0))
                Spacer(minLength: 0)
            }
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func row(for item: ProcessItem) -> some View {
        switch item {
        case let .reasoning(_, text, streaming):
            VStack(alignment: .leading, spacing: Spacing.space4) {
                // "Thinking..." while streaming, "Thought for a few seconds"
                // once settled (PARITY §4 copy).
                Text(ThinkingCopy.label(streaming: streaming))
                    .font(Typography.label)
                    .foregroundStyle(theme.mutedFg)
                    .shimmer(active: streaming)
                if !text.isEmpty {
                    Text(text)
                        .font(Typography.callout)
                        .foregroundStyle(theme.mutedFg)
                        .textSelection(.enabled)
                }
            }
        case let .tool(_, call, result):
            ToolRowView(call: call, result: result, active: group.active)
        }
    }
}

/// One tool row inside a process block (PARITY §4): an SF-Symbol by tool + the
/// tense verb + " — {detail}", with a tap-to-expand monospace result preview.
/// v1 keeps a clean preview; the dark-Bash-slab and red/green diff are deferred.
private struct ToolRowView: View {
    @Environment(\.theme) private var theme
    let call: ToolCall
    var result: ToolResult?
    var active: Bool
    @State private var showResult = false

    /// Past tense once the result lands or the turn settles; present while it runs.
    private var done: Bool { result != nil || !active }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.space4) {
            Button {
                if result != nil { showResult.toggle() }
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: Spacing.space6) {
                    Image(systemName: ToolLabel.symbol(call.name))
                        .font(Typography.caption)
                        .foregroundStyle(theme.mutedFg)
                        .frame(width: Spacing.space16)
                    Text(label)
                        .font(Typography.caption)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer(minLength: 0)
                }
            }
            .buttonStyle(.plain)
            .disabled(result == nil)

            if showResult, let result {
                Text(result.content)
                    .font(.system(size: HoustonFontSize.xs, design: .monospaced))
                    .foregroundStyle(result.isError ? theme.destructive : theme.mutedFg)
                    .textSelection(.enabled)
                    .padding(Spacing.space8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(theme.secondary, in: RoundedRectangle(cornerRadius: Radius.md))
            }
        }
    }

    /// Verb in `muted-foreground`, detail dimmed to `muted-foreground/50` and
    /// joined with " — " (desktop `tool-block.tsx:98-101`).
    private var label: AttributedString {
        var verb = AttributedString(ToolLabel.action(call.name, done: done))
        verb.foregroundColor = theme.mutedFg
        guard let detail = ToolDetail.string(name: call.name, input: call.input), !detail.isEmpty
        else { return verb }
        var suffix = AttributedString(" — \(detail)")
        suffix.foregroundColor = theme.mutedFg.opacity(0.5)
        return verb + suffix
    }
}
