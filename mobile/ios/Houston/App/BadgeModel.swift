import Observation

/// The shared "needs you" counter surfaced on the Mission Control tab item.
///
/// This is a tiny piece of cross-surface app state: the Agents / Mission Control
/// surfaces compute how many of the user's conversations currently sit in
/// `needs_you` (see `PARITY.md` §1/§4) and write the aggregate here; ``RootTabs``
/// reads it to badge the tab. Keeping it a single observable avoids each surface
/// re-deriving the total and lets the tab badge update from anywhere.
///
/// The count is a raw total; the tab badge renders it verbatim. The "99+" cap
/// from `PARITY.md` §4 applies to the in-surface `NeedsYouChip`, not the native
/// tab badge.
@Observable
final class BadgeModel {
    /// Total conversations across all agents currently in `needs_you`.
    var needsYouCount: Int = 0

    init() {}
}
