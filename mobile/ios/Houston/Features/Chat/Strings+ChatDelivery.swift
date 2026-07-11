import Foundation

// Delivery-tick accessibility labels for the user bubble's time cluster. Added in
// a Chat-owned file separate from `Strings+Chat.swift` so parallel surface work
// never collides on that file (same convention as `Strings+ChatBubble.swift`).
extension Strings.Chat {
  /// VoiceOver label for the clock tick — the message is not yet confirmed by the
  /// engine (WhatsApp-style optimistic send).
  static let deliveryPending = "Sending"
  /// VoiceOver label for the check tick — the engine has confirmed the message.
  static let deliverySent = "Sent"
  /// VoiceOver label for the error tick — the send provably never reached the
  /// agent (a lost / rejected / refused send); the message must be sent again.
  static let deliveryFailed = "Not delivered"
}
