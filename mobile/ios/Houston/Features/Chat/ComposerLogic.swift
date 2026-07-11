import Foundation

/// The composer's pure send-state + placeholder logic, split out of the SwiftUI
/// view so it is unit-tested without a running UI (client-architecture.md,
/// invariant 1: derivable state is tested, not re-implemented in the view). No
/// SwiftUI, no side effects.
enum ComposerLogic {
  /// What the trailing button does for a given field + turn state.
  enum Action: Equatable {
    /// Idle with text: the button sends.
    case send
    /// A turn is in flight: the button cancels it.
    case stop
    /// Idle and empty: the button is inert (dimmed, non-interactive).
    case disabled
  }

  /// Trimmed non-empty text is "content" — the send trigger. Whitespace or
  /// newlines alone never send, matching ``ChatScreenModel/send()``.
  static func hasContent(_ text: String) -> Bool {
    !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  /// A running turn always offers Stop (even over empty text); otherwise text
  /// presence decides send vs. disabled.
  static func action(text: String, isRunning: Bool) -> Action {
    if isRunning { return .stop }
    return hasContent(text) ? .send : .disabled
  }

  /// The button is interactive — and drawn at full size — unless idle-and-empty.
  static func isActive(text: String, isRunning: Bool) -> Bool {
    action(text: text, isRunning: isRunning) != .disabled
  }

  /// The field placeholder: a fresh conversation invites the first mission; once
  /// the user has spoken it reads like a messenger ("Message"). Mobile diverges
  /// from desktop's "Send a follow-up..." on purpose — WhatsApp familiarity.
  static func placeholder(hasUserMessage: Bool) -> String {
    hasUserMessage ? Strings.Chat.followUpPlaceholder : Strings.Chat.newMissionPlaceholder
  }
}
