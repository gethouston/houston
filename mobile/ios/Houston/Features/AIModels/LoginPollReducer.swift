import Foundation

/// The device-code login poll's pure decision function (landmine 2). Hosted
/// OAuth is device-code only: the surface shows the one-time code, opens the
/// verification URL, then polls `providers/refreshStatus` (GET /auth/status)
/// every ~3s. This reducer turns ONE poll observation of the provider's VM into
/// the next action, so the polling loop itself stays trivial and the settle
/// logic is unit-tested without a timer.
///
/// Precedence matters: `configured` flipping true is success even if a stale
/// `login.status` still reads `awaiting_user` (the credential is the source of
/// truth the merge reads), so it is checked FIRST.
enum LoginPollDecision: Equatable {
  /// Keep polling — no terminal state yet.
  case keepPolling
  /// The credential landed; close the sheet and refresh.
  case succeeded
  /// The login failed; surface the reason (nil = a generic failure).
  case failed(String?)
}

enum LoginPollReducer {
  /// Decide the next poll action from the provider's post-refresh VM.
  ///
  /// - `configured`: the provider's credential is now present (auth-status truth).
  /// - `status`: the in-flight login status, or nil when the provider dropped
  ///   out of `/auth/status`.
  /// - `error`: the login's failure reason, if the runtime reported one.
  static func decide(
    configured: Bool, status: LoginStatus?, error: String?
  ) -> LoginPollDecision {
    if configured { return .succeeded }
    switch status {
    case .complete: return .succeeded
    case .error: return .failed(error)
    default: return .keepPolling
    }
  }

  /// Convenience overload straight off a provider VM.
  static func decide(_ vm: ProviderVM?) -> LoginPollDecision {
    guard let vm else { return .keepPolling }
    return decide(configured: vm.configured, status: vm.login?.status, error: vm.login?.error)
  }
}
