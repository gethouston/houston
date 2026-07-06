import SwiftUI

/// The two not-ready full-screen states of the Integrations surface, rendered
/// with the shared `EmptyStateView` so they read like every other empty state.
///
/// Both are terminal on mobile: a 503 (``unavailable``) has nothing the user can
/// do here, and a ``signin`` reason cannot occur once the user has reached a
/// signed-in Settings surface — so neither carries an action (no dead affordance,
/// per the hosted-mode landmine that a 503 must inform without crashing).
enum IntegrationStateViews {
  struct Unavailable: View {
    var body: some View {
      EmptyStateView(
        title: Strings.Integrations.title,
        description: Strings.Integrations.unavailable,
        systemImage: "puzzlepiece.extension")
    }
  }

  struct Signin: View {
    var body: some View {
      EmptyStateView(
        title: Strings.Integrations.signinTitle,
        description: Strings.Integrations.signinBody,
        systemImage: "person.crop.circle.badge.questionmark")
    }
  }

  struct Loading: View {
    var body: some View {
      ProgressView()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  /// A grant read failed (transient error) while otherwise ready. Retriable — a
  /// thrown read is never allowed to masquerade as "no toggles / all agents"
  /// (no-silent-failures; PARITY-SETTINGS §3, landmine 5).
  struct GrantsError: View {
    let message: String
    let retry: () -> Void

    var body: some View {
      EmptyStateView(
        title: Strings.Integrations.grantsLoadError,
        description: message,
        systemImage: "exclamationmark.triangle",
        ctaTitle: Strings.Integrations.grantsRetry,
        ctaAction: retry)
    }
  }
}
