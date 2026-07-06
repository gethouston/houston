import Foundation

/// The four mutually-exclusive states the global Integrations surface renders,
/// derived from the `integrations` scope snapshot (PARITY-SETTINGS §3, landmine
/// 6 — a 503 must degrade, never crash the tab):
///  - ``loading`` — no snapshot yet, or `loaded == false` (still fetching).
///  - ``ready`` — a Composio key is configured and the provider is ready.
///  - ``unavailable`` — `ready == false, reason == unavailable` (503, no key).
///  - ``signin`` — `ready == false, reason == signin` (needs a Houston sign-in).
///
/// An absent or unrecognized reason on a not-ready VM falls back to
/// ``unavailable`` (the safe "nothing you can do here" surface).
enum IntegrationsScreenState: Equatable {
  case loading
  case ready
  case unavailable
  case signin

  static func derive(from vm: IntegrationsViewModel?) -> IntegrationsScreenState {
    guard let vm, vm.loaded else { return .loading }
    if vm.ready { return .ready }
    switch vm.reason {
    case .signin: return .signin
    case .unavailable, .unknown, nil: return .unavailable
    }
  }
}
