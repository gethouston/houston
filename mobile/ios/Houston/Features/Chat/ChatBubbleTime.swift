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

/// The WhatsApp-style delivery state of a user bubble, projected from the SDK's
/// `FeedItemVM.pending` / `failed` flags (`vm-output.ts`). Three states, not two:
/// an optimistic send is `sending` until the engine confirms it (`sent`), unless
/// the turn settled as a send failure that provably never landed (`failed`) — in
/// which case it must NEVER read as a confirmed check. The two SDK flags are
/// mutually exclusive by construction (a failure strips `pending`).
enum ChatDelivery: Equatable {
  case sending
  case sent
  case failed

  init(pending: Bool, failed: Bool) {
    if failed {
      self = .failed
    } else if pending {
      self = .sending
    } else {
      self = .sent
    }
  }
}

/// Selects the WhatsApp-style delivery glyph shown after a user bubble's time
/// (single-check grammar, adapted — Houston never double-checks): a clock while
/// unconfirmed (`sending`), a single check once delivered (`sent`), and an
/// exclamation when the send provably never landed (`failed`). Pure so the
/// mapping is unit-tested without a view; the swap animates in the bubble via
/// `.contentTransition(.symbolEffect(.replace))`, like the composer's send-button
/// morph.
enum ChatBubbleTick {
  /// SF Symbol name for the delivery state: `clock` sending, `checkmark` sent,
  /// `exclamationmark` failed.
  static func symbolName(for delivery: ChatDelivery) -> String {
    switch delivery {
    case .sending: return "clock"
    case .sent: return "checkmark"
    case .failed: return "exclamationmark"
    }
  }
}

extension ChatMetrics {
  /// Opacity of the in-bubble timestamp text (WhatsApp-muted): 60% of the
  /// bubble's `primaryFg` so the time reads as quiet metadata without competing
  /// with the message. Centralized here beside `bubbleRadius` — one source for
  /// bubble design values (colors still come from `Theme`).
  static let bubbleTimeOpacity: CGFloat = 0.6
}
