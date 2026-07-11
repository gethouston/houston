import Foundation

/// The chat title bar's second line, mirroring WhatsApp's contact-status line
/// under the name. A pure projection of the live conversation so it is unit
/// tested without a running UI (client-architecture.md, invariant 1) — the view
/// only binds it.
///
/// Only two states earn a second line: a running turn ("working…", shimmered)
/// and a settled `needs_you` mission ("needs your attention", warning-tinted).
/// Everything else is ``hidden`` — the name sits vertically centred beside the
/// avatar, no status line. `error` deliberately gets NO line here: the typed
/// error card in the feed is the surface for a real failure (PARITY §1), and a
/// user Stop settles as `needsYou`, not `error`.
enum ChatTitleStatus: Equatable {
  /// A turn is in flight — "working…" with the live shimmer.
  case working
  /// Settled and awaiting the user — "needs your attention", warning-tinted.
  case needsAttention
  /// No second line; the name centres beside the avatar.
  case hidden

  /// Derive the title-status from the pair the VM publishes. A live turn always
  /// wins (`running` → ``working``); once settled, a `needs_you` board status
  /// asks for attention. Read `boardStatus`, never `sessionStatus`, for the
  /// settled signal (a user Stop lands as `needsYou`, not `error`, PARITY §1).
  static func derive(running: Bool, boardStatus: BoardStatus?) -> ChatTitleStatus {
    if running { return .working }
    if boardStatus == .needsYou { return .needsAttention }
    return .hidden
  }
}
