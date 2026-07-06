import Foundation

/// The chat's in-flight display state, mirroring the desktop `ChatStatus`
/// (`ui/chat/src/chat-panel-types.ts`) and its `deriveStatus` reclassification
/// (`ui/chat/src/chat-status.ts`).
///
/// Only `assistant_text_streaming` counts as `.streaming`: it is the ONE feed
/// type whose progressively-appearing content is visible on screen, so the
/// loading indicator would just compete with it. `thinking_streaming` used to
/// count too, but since HOU-448 the reasoning streams inside a collapsed block —
/// nothing moves on screen — so treating it as streaming flickered the loading
/// state off during every thinking stretch (HOU-655). EVERY in-flight case with
/// no visible text streaming resolves to `.submitted` so the loading indicator
/// stays visible through reasoning + tool phases.
enum ChatStatus: Equatable, Sendable {
  /// Settled — no loading indicator.
  case ready
  /// Assistant text is streaming; the bubble IS the progress signal, so the
  /// standalone loading indicator is suppressed.
  case streaming
  /// A turn is in flight with nothing visibly streaming — show the loading
  /// indicator (the only signal during reasoning / tool / silent-gap stretches).
  case submitted

  /// Reclassify the feed + running flag into a status, byte-for-byte the desktop
  /// `deriveStatus(items, isLoading)`: last frame `assistant_text_streaming` →
  /// `.streaming`; otherwise any running turn (or a just-sent optimistic
  /// `user_message`) → `.submitted`; else `.ready`.
  static func derive(feed: [FeedItemVM], running: Bool) -> ChatStatus {
    let lastType = feed.last?.feedType
    if lastType == "assistant_text_streaming" { return .streaming }
    if running { return .submitted }
    if lastType == "user_message" { return .submitted }
    return .ready
  }
}
