import Foundation

/// The client-side fallback title for a new mission (PARITY §6), ported from the
/// desktop's `fallbackMissionTitle` (`app/src/lib/mission-title-text.ts`)
/// character-for-character so a mission card reads identically across surfaces:
///   - collapse all whitespace runs to single spaces and trim,
///   - empty input → "New mission",
///   - ≤ 40 characters → the text unchanged,
///   - otherwise take 40 characters, cut back to the last word boundary, and
///     append an ellipsis.
enum MissionTitle {
  private static let maxChars = 40

  static func fallback(from text: String) -> String {
    let normalized = normalizeSpaces(text)
    if normalized.isEmpty { return "New mission" }

    let chars = Array(normalized)
    if chars.count <= maxChars { return normalized }

    let slice = String(chars.prefix(maxChars))
    if let lastSpace = slice.lastIndex(of: " "), lastSpace > slice.startIndex {
      let base = String(slice[slice.startIndex..<lastSpace])
      return trimEnd(base) + "..."
    }
    return trimEnd(slice) + "..."
  }

  private static func normalizeSpaces(_ value: String) -> String {
    value
      .split(whereSeparator: { $0.isWhitespace })
      .joined(separator: " ")
  }

  private static func trimEnd(_ value: String) -> String {
    var s = Substring(value)
    while let last = s.last, last.isWhitespace { s = s.dropLast() }
    return String(s)
  }
}
