import Foundation

// Timeline day-separator copy (WhatsApp/Telegram day dividers). Added in its own
// file so this agent never collides on the shared `Strings+Chat.swift`; weekday
// and date labels are formatted (localized), not static strings.
extension Strings.Chat {
  enum Timeline {
    static let today = "Today"
    static let yesterday = "Yesterday"
  }
}
