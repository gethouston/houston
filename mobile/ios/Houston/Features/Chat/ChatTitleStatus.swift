import Foundation

/// The chat title bar's second line, mirroring WhatsApp's contact-status line
/// under the name. A pure projection of the live conversation so it is unit
/// tested without a running UI (client-architecture.md, invariant 1) — the view
/// only binds it.
///
/// Only two states earn a second line: a running turn ("working…", shimmered)
/// and a mission settled on something it is BLOCKED on ("needs your attention",
/// warning-tinted). Everything else is ``hidden`` — the name sits vertically
/// centred beside the avatar, no status line. `error` deliberately gets NO line
/// here: the typed error card in the feed is the surface for a real failure
/// (PARITY §1).
enum ChatTitleStatus: Equatable {
  /// A turn is in flight — "working…" with the live shimmer.
  case working
  /// Settled on a blocking step — "needs your attention", warning-tinted.
  case needsAttention
  /// No second line; the name centres beside the avatar.
  case hidden

  /// Derive the title-status from what the VM publishes. A live turn always
  /// wins (`running` → ``working``); once settled, the line shows only when the
  /// turn ended on a BLOCKING step — a question, a sign-in, a connection, a
  /// plan to approve (``PendingInteraction/hasBlockingSteps``).
  ///
  /// The board status is deliberately NOT the trigger. Missions no longer
  /// auto-route to `done`: every clean finish settles `needs_you` and only the
  /// user's own checkmark closes one, so `boardStatus == .needsYou` would leave
  /// a permanent "needs your attention" line under the name of EVERY finished
  /// conversation. The pending interaction is the honest signal — a mission
  /// that finished with offers (`suggest_actions` / `suggest_reusable`) or
  /// plainly finished carries no blocking step and shows no line.
  static func derive(
    running: Bool, pendingInteraction: PendingInteraction?
  ) -> ChatTitleStatus {
    if running { return .working }
    if pendingInteraction?.hasBlockingSteps == true { return .needsAttention }
    return .hidden
  }
}
