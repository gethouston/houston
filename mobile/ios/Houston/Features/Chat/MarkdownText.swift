import SwiftUI

/// Renders assistant markdown as native SwiftUI blocks (PARITY §3): paragraphs,
/// headings, lists, blockquotes, fenced code slabs, thematic breaks, and inline
/// bold / italic / inline-code / tappable links. No third-party packages, no
/// syntax highlighting (v1). Blocks are parsed once per text value; a streaming
/// reply re-parses in place under a stable row id so the prose updates smoothly.
struct MarkdownText: View {
    @Environment(\.theme) private var theme
    let text: String

    private var blocks: [MarkdownBlock] { MarkdownBlockParser.parse(text) }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.space8) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                view(for: block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .tint(theme.primary)
        .textSelection(.enabled)
    }

    @ViewBuilder private func view(for block: MarkdownBlock) -> some View {
        switch block {
        case let .paragraph(content):
            Text(content).font(Typography.body).foregroundStyle(theme.foreground)
        case let .heading(level, content):
            Text(content)
                .font(headingFont(level))
                .foregroundStyle(theme.foreground)
                .padding(.top, Spacing.space4)
        case let .listItem(ordered, ordinal, depth, content):
            listRow(ordered: ordered, ordinal: ordinal, depth: depth, content: content)
        case let .blockquote(content):
            HStack(spacing: Spacing.space8) {
                Rectangle().fill(theme.border).frame(width: 2)
                Text(content).font(Typography.body).foregroundStyle(theme.mutedFg)
            }
        case let .codeBlock(_, code):
            CodeSlab(code: code)
        case .thematicBreak:
            Rectangle().fill(theme.border).frame(height: 1).padding(.vertical, Spacing.space4)
        }
    }

    private func listRow(
        ordered: Bool, ordinal: Int, depth: Int, content: AttributedString
    ) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.space8) {
            Text(ordered ? "\(ordinal)." : "•")
                .font(Typography.body)
                .foregroundStyle(theme.mutedFg)
                .monospacedDigit()
            Text(content).font(Typography.body).foregroundStyle(theme.foreground)
        }
        .padding(.leading, CGFloat(depth - 1) * Spacing.space16)
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: return Typography.h1
        case 2: return Typography.title
        default: return Typography.bodyMedium
        }
    }
}

/// A fenced code block: monospace text on a subtle `bg-secondary` slab that
/// scrolls horizontally rather than forcing the message wide (PARITY §3). No
/// syntax highlighting (v1); the dark-Bash-slab treatment is deferred.
private struct CodeSlab: View {
    @Environment(\.theme) private var theme
    let code: String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Text(code)
                .font(.system(size: HoustonFontSize.sm, design: .monospaced))
                .foregroundStyle(theme.foreground)
                .textSelection(.enabled)
                .padding(Spacing.space12)
        }
        .background(theme.secondary, in: RoundedRectangle(cornerRadius: Radius.lg))
    }
}
