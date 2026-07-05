import SwiftUI

/// Renders a text snippet with every case-insensitive occurrence of `query`
/// highlighted, using the `highlight` / `highlightFg` tokens. Backs the search
/// result "highlighted snippet under the title" (PARITY §3). When the match sits
/// deep in a long string, the text is windowed around the first hit with a
/// leading ellipsis so the match stays visible.
struct HighlightedText: View {
    @Environment(\.theme) private var theme
    let text: String
    let query: String
    var contextRadius: Int = 32
    var lineLimit: Int = 2

    var body: some View {
        Text(attributed)
            .font(Typography.callout)
            .foregroundStyle(theme.mutedFg)
            .lineLimit(lineLimit)
    }

    private var attributed: AttributedString {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let snippet = windowedSnippet(for: trimmed)
        var attr = AttributedString(snippet)
        guard !trimmed.isEmpty else { return attr }

        // Match on the plain string, then map character offsets onto the
        // AttributedString's character view — avoids AttributedSubstring search
        // API differences and is exact for character-based highlighting.
        let chars = attr.characters
        var from = snippet.startIndex
        while let match = snippet.range(of: trimmed, options: .caseInsensitive, range: from..<snippet.endIndex) {
            let lower = snippet.distance(from: snippet.startIndex, to: match.lowerBound)
            let upper = snippet.distance(from: snippet.startIndex, to: match.upperBound)
            let aLower = chars.index(chars.startIndex, offsetBy: lower)
            let aUpper = chars.index(chars.startIndex, offsetBy: upper)
            attr[aLower..<aUpper].backgroundColor = theme.highlight
            attr[aLower..<aUpper].foregroundColor = theme.highlightFg
            from = match.upperBound
        }
        return attr
    }

    /// A window of the source around the first match, prefixed with "…" when it
    /// does not start at the beginning. Returns the whole string when the match
    /// is near the start or absent.
    private func windowedSnippet(for query: String) -> String {
        guard !query.isEmpty,
              let match = text.range(of: query, options: .caseInsensitive) else { return text }
        let leadCount = text.distance(from: text.startIndex, to: match.lowerBound)
        guard leadCount > contextRadius else { return text }
        let windowStart = text.index(match.lowerBound, offsetBy: -contextRadius)
        return "…" + String(text[windowStart...])
    }
}
