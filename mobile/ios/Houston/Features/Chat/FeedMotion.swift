import SwiftUI

/// The mission feed's send/receive motion (WhatsApp-style): a newly appended row
/// slides up into place with a fade while the user is pinned to the bottom, and
/// nothing else moves. The decision is a pure function so it unit-tests without a
/// view; the transition + spring are the SwiftUI values ``MissionFeed`` binds.
///
/// Two invariants keep it calm:
/// - The INITIAL history load never animates — appends are gated on
///   `hasLoadedOnce`, which a view flips true only after its first snapshot.
/// - A streaming row mutating in place never re-transitions — the feed drives the
///   append animation off the row-id set, which a same-id text delta leaves
///   unchanged, so only genuine insertions animate.
enum FeedMotion {
  /// Whether a structural feed change (an append) should animate. `false` on the
  /// first load (so seeded history never slides) and whenever the user is reading
  /// history (`atBottom == false`, so off-screen appends don't yank the view);
  /// `true` only once loaded AND pinned to the bottom.
  static func animatesAppend(hasLoadedOnce: Bool, atBottom: Bool) -> Bool {
    hasLoadedOnce && atBottom
  }

  /// The spring driving an animated append — snappy, matching the composer's
  /// send-button morph so a sent bubble and its button share one feel.
  static let appendSpring: Animation = .snappy(duration: Motion.fast)

  /// The per-row insertion transition: a gentle slide up from the bottom with a
  /// fade (both the optimistic user bubble and an arriving reply use it).
  /// Reduce-motion collapses the slide to a plain cross-fade (opacity only).
  static func rowTransition(reduceMotion: Bool) -> AnyTransition {
    reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity)
  }
}
