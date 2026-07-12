import SwiftUI

/// The global Integrations surface (PARITY-SETTINGS §3), pushed from the Settings
/// "Integrations" row. Integrations are user-scoped and gateway-owned (shared
/// across the user's agents), so this reads the single `integrations` scope and
/// switches on its derived state: a loading placeholder, the not-configured
/// (503) or sign-in degrade states, or the ready body (connected grid + connect
/// catalog). It renders inside the caller's navigation stack (no stack of its
/// own) so the Settings back button stays intact.
struct IntegrationsView: View {
  @Environment(\.theme) private var theme
  @State private var model = IntegrationsModel()
  @State private var flow: IntegrationsConnectFlow?
  @State private var retention: ScopeRetention?

  var body: some View {
    content
      .navigationTitle(Strings.Integrations.title)
      .navigationBarTitleDisplayMode(.inline)
      .background(theme.input)
      .onAppear {
        if retention == nil { retention = model.retain() }
        if flow == nil {
          flow = IntegrationsConnectFlow(onLanded: { [model] _ in Task { await model.refresh() } })
        }
      }
      .onDisappear { retention?.cancel(); retention = nil }
  }

  @ViewBuilder private var content: some View {
    switch model.state {
    case .loading:
      IntegrationStateViews.Loading()
    case .unavailable:
      IntegrationStateViews.Unavailable()
    case .signin:
      IntegrationStateViews.Signin()
    case .ready:
      if let flow {
        IntegrationsReadyView(model: model, flow: flow)
      } else {
        IntegrationStateViews.Loading()
      }
    }
  }
}
