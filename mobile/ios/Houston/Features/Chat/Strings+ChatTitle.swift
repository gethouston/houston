import Foundation

// Chat title-bar copy (the WhatsApp-style name + status line). A separate
// Chat-owned extension file so surface agents never collide on the shared
// `Strings+Chat.swift` — the same collision-avoidance pattern that file itself
// documents. Mobile-only chrome: the desktop has no per-chat title bar.
extension Strings.Chat {
  enum TitleBar {
    /// The running status line under the agent name (shimmered).
    static let working = "Working…"
    /// The settled needs-you status line under the agent name (warning-tinted).
    static let needsAttention = "Needs your attention"
  }
}
