import Foundation

/// Parses a mission's ISO 8601 `updatedAt` wire string into a `Date`. The wire
/// carries plain internet date-times ("2026-07-01T10:00:00Z") and, on some
/// frames, fractional seconds — both are accepted; anything unparseable yields
/// `nil` (the row then shows no time label). Pure so it unit-tests directly.
enum ActivityTimestamp {
    static func date(from iso: String) -> Date? {
        if let withFraction = fractional.date(from: iso) { return withFraction }
        return plain.date(from: iso)
    }

    private static let plain = ISO8601DateFormatter()

    private static let fractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
