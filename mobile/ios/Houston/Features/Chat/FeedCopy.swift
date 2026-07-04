import Foundation

/// Pure copy derivations for the feed catalog, kept out of the SwiftUI views so
/// they are unit-testable (PARITY §5 exact copy).

enum ThinkingCopy {
  /// The label above a reasoning block. While streaming it shimmers "Thinking...";
  /// once finalized the VM carries no duration, so we use the exact
  /// "Thought for a few seconds" fallback rather than fabricate a count
  /// (chat.json:reasoning). If the VM later exposes elapsed seconds, switch to
  /// ``Strings/Chat/thoughtFor(seconds:)``.
  static func label(streaming: Bool) -> String {
    streaming ? Strings.Chat.thinking : Strings.Chat.thoughtForFew
  }
}

enum FileChangesSummary {
  /// The "Updates made" block's detail lines: new-file and updated-file counts,
  /// omitting a line when its count is zero (chat.json:summary + filesUpdated_*).
  static func lines(created: [String], modified: [String]) -> [String] {
    var lines: [String] = []
    if !created.isEmpty { lines.append(Strings.Chat.newFiles(created.count)) }
    if !modified.isEmpty { lines.append(Strings.Chat.filesUpdated(modified.count)) }
    return lines
  }
}

enum ProviderSwitchCopy {
  /// The divider caption for a provider switch (chat.json:providerSwitch.divider*).
  static func label(provider: String, summarized: Bool) -> String {
    summarized
      ? Strings.Chat.continuedWithSummarized(provider: provider)
      : Strings.Chat.continuedWith(provider: provider)
  }
}
