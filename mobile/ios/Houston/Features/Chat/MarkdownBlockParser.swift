import Foundation

/// Parses markdown into render-ready ``MarkdownBlock``s by walking the
/// `presentationIntent` runs of `AttributedString(markdown:options:)` with
/// `interpretedSyntax: .full` (PARITY §3). Foundation does the CommonMark block +
/// inline parsing; this groups its runs into blocks and classifies each from its
/// intent components. Pure + non-throwing: a string that fails to parse degrades
/// to a single plain paragraph rather than dropping the message.
enum MarkdownBlockParser {
    static func parse(_ markdown: String) -> [MarkdownBlock] {
        let options = AttributedString.MarkdownParsingOptions(
            allowsExtendedAttributes: true,
            interpretedSyntax: .full,
            failurePolicy: .returnPartiallyParsedIfPossible)
        guard let attributed = try? AttributedString(markdown: markdown, options: options) else {
            return [.paragraph(AttributedString(markdown))]
        }

        var blocks: [MarkdownBlock] = []
        var currentKey: Int?
        var currentRuns: [Range<AttributedString.Index>] = []

        func flush() {
            guard !currentRuns.isEmpty else { return }
            if let block = block(from: currentRuns, in: attributed) { blocks.append(block) }
            currentRuns = []
        }

        for run in attributed.runs {
            // The innermost intent component identifies the block; `nil` intent
            // (bare text) forms its own paragraph group under key -1.
            let key = run.presentationIntent?.components.first?.identity ?? -1
            if key != currentKey { flush(); currentKey = key }
            currentRuns.append(run.range)
        }
        flush()
        return blocks.isEmpty ? [.paragraph(AttributedString(markdown))] : blocks
    }

    /// Classify one block from its runs' shared intent components.
    private static func block(
        from ranges: [Range<AttributedString.Index>], in attributed: AttributedString
    ) -> MarkdownBlock? {
        let components =
            attributed[ranges[0]].runs.first?.presentationIntent?.components ?? []

        for component in components {
            switch component.kind {
            case .thematicBreak:
                return .thematicBreak
            case let .codeBlock(language):
                let code = rawText(ranges, in: attributed)
                    .trimmingCharacters(in: .newlines)
                return .codeBlock(language: language, code: code)
            case let .header(level):
                return .heading(level: level, inline(ranges, in: attributed))
            case .blockQuote:
                return .blockquote(inline(ranges, in: attributed))
            default:
                continue
            }
        }

        if let list = listContext(components) {
            return .listItem(
                ordered: list.ordered, ordinal: list.ordinal, depth: list.depth,
                inline(ranges, in: attributed))
        }
        return .paragraph(inline(ranges, in: attributed))
    }

    /// Ordered/unordered + ordinal + nesting depth from a list item's components.
    private static func listContext(
        _ components: [PresentationIntent.IntentType]
    ) -> (ordered: Bool, ordinal: Int, depth: Int)? {
        var ordered = false
        var ordinal = 1
        var depth = 0
        var isList = false
        for component in components {
            switch component.kind {
            case let .listItem(number):
                isList = true
                ordinal = number
            case .orderedList:
                ordered = true
                depth += 1
            case .unorderedList:
                depth += 1
            default:
                continue
            }
        }
        return isList ? (ordered, ordinal, max(depth, 1)) : nil
    }

    /// The block's inline `AttributedString` (bold/italic/code/link preserved),
    /// with block-level `presentationIntent` stripped so the payload is clean.
    private static func inline(
        _ ranges: [Range<AttributedString.Index>], in attributed: AttributedString
    ) -> AttributedString {
        var result = AttributedString()
        for range in ranges { result.append(AttributedString(attributed[range])) }
        result.presentationIntent = nil
        return result
    }

    /// The raw concatenated characters of the block (for code blocks).
    private static func rawText(
        _ ranges: [Range<AttributedString.Index>], in attributed: AttributedString
    ) -> String {
        ranges.map { String(attributed[$0].characters) }.joined()
    }
}
