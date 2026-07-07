import Foundation

/// Formats a user bubble's in-bubble timestamp (WhatsApp convention): the short,
/// locale-aware wall-clock time shown bottom-right of the bubble. Pure so the
/// 12/24-hour behavior can be unit-tested without a view — `.shortened` follows
/// the locale's clock preference (e.g. "3:45 PM" in en_US, "15:45" in en_GB).
enum ChatBubbleTime {
  /// The short time label for `date` in `locale` (defaults to the current one).
  static func label(for date: Date, locale: Locale = .current) -> String {
    date.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(locale))
  }
}

extension ChatMetrics {
  /// Opacity of the in-bubble timestamp text (WhatsApp-muted): 60% of the
  /// bubble's `primaryFg` so the time reads as quiet metadata without competing
  /// with the message. Centralized here beside `bubbleRadius` — one source for
  /// bubble design values (colors still come from `Theme`).
  static let bubbleTimeOpacity: CGFloat = 0.6
}
