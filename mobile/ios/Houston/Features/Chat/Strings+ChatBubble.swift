import Foundation

// Bubble long-press copy action. Added in a Chat-owned file separate from
// `Strings+Chat.swift` so parallel surface work never collides on that file.
extension Strings.Chat {
  /// Long-press context-menu action that copies a message's raw text.
  static let copy = String(localized: "chat.copy", defaultValue: "Copy")
}
