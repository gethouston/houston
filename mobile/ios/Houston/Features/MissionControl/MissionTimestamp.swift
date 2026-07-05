import Foundation

/// Formats an activity's `updatedAt` (ISO-8601 string) as a compact relative
/// label ("2h ago", "3d ago") for a mission card's metadata line (PARITY §3).
///
/// Pure and dependency-free so it unit-tests directly: the wire timestamp is
/// parsed with a fixed `ISO8601DateFormatter` (fractional-seconds tolerant), and
/// an unparseable/absent value returns `nil` so the card hides the line rather
/// than showing a wrong time.
enum MissionTimestamp {
  private static let withFraction: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
  }()

  private static let plain = ISO8601DateFormatter()

  private static let relative: RelativeDateTimeFormatter = {
    let f = RelativeDateTimeFormatter()
    f.unitsStyle = .short
    return f
  }()

  static func parse(_ iso: String?) -> Date? {
    guard let iso, !iso.isEmpty else { return nil }
    return withFraction.date(from: iso) ?? plain.date(from: iso)
  }

  /// Relative label for `iso` against `now`, or `nil` when it cannot be parsed.
  static func relativeLabel(_ iso: String?, now: Date = Date()) -> String? {
    guard let date = parse(iso) else { return nil }
    return relative.localizedString(for: date, relativeTo: now)
  }
}
