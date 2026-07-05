import Foundation

/// Cleans a persisted first-message body into a card/list preview.
///
/// Skill and attachment invocations persist a leading HTML-comment marker
/// (`<!--houston:skill …-->` / `<!--houston:attachments …-->`) ahead of the
/// model-facing prompt. Rendering the body verbatim would leak that marker JSON
/// onto a mission card (HOU-425). Mirrors the observable outcome of the desktop's
/// `messagePreviewText` (`ui/chat/src/message-preview.ts`): strip the leading
/// marker + its trailing blank lines, return the user's text trimmed.
///
/// Deviation (documented): the desktop additionally falls back to a Skill's
/// one-line description when the user sent a Skill with no text of their own.
/// Mobile v1 has no Skill catalog on this surface, so an empty remainder yields
/// "" and the card simply hides the description line.
enum MissionPreviewText {
  /// Leading `<!--houston:<kind> {json}-->` comment plus any immediate blank
  /// lines, matching the desktop marker regexes. Compiled once; a compile
  /// failure degrades to the raw (still trimmed) body rather than crashing.
  private static let markerRegex: Regex<AnyRegexOutput>? =
    try? Regex(#"^\s*<!--houston:[a-z_]+ \{[\s\S]*?\}-->\s*\n?\n?"#).ignoresCase()

  static func preview(_ body: String?) -> String {
    guard let body, !body.isEmpty else { return "" }
    let stripped = markerRegex.map { body.replacing($0, with: "") } ?? body
    return stripped.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
