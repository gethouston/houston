import Foundation

/// One block-level element of rendered markdown (PARITY §3). Assistant prose is
/// the common case for the non-technical target user, so the renderer walks the
/// full markdown block structure rather than dumping raw text.
///
/// Inline formatting (bold / italic / inline-code / links) is carried inside the
/// `AttributedString` payloads via their `inlinePresentationIntent` + `link`
/// attributes; block-level `presentationIntent` is stripped so the payload is a
/// clean inline string the view styles itself.
enum MarkdownBlock: Equatable {
    case paragraph(AttributedString)
    case heading(level: Int, AttributedString)
    /// A list row: `ordered` picks the marker style, `ordinal` the number for
    /// ordered lists, `depth` the nesting level (1 = top level).
    case listItem(ordered: Bool, ordinal: Int, depth: Int, AttributedString)
    case blockquote(AttributedString)
    /// A fenced code block: raw text, no syntax highlighting (v1 — highlighting
    /// deferred per PARITY §3). `language` is the info-string hint, if any.
    case codeBlock(language: String?, code: String)
    case thematicBreak

    /// The block's plain text (inline formatting flattened) — the basis for unit
    /// assertions and accessibility.
    var plainText: String {
        switch self {
        case let .paragraph(s), let .heading(_, s), let .blockquote(s),
            let .listItem(_, _, _, s):
            return String(s.characters)
        case let .codeBlock(_, code):
            return code
        case .thematicBreak:
            return ""
        }
    }
}
