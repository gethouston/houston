import SwiftUI

/// The ready (Composio-configured) body of the global Integrations page: the
/// "Connected apps" grid (each card showing the app's live status + which agents
/// use it) and the always-visible "Connect more apps" catalog. Owns the detail
/// sheet, the connect waiting sheet, and the post-connect outcome alert.
struct IntegrationsReadyView: View {
  @Environment(\.theme) private var theme
  let model: IntegrationsModel
  let flow: IntegrationsConnectFlow

  @State private var selected: IntegrationConnection?
  @State private var outcomeMessage: String?

  private let columns = [
    GridItem(.flexible(), spacing: Spacing.space12),
    GridItem(.flexible(), spacing: Spacing.space12),
  ]

  private var connections: [IntegrationConnection] {
    model.connections.sorted {
      model.display(for: $0.toolkit).name.lowercased()
        < model.display(for: $1.toolkit).name.lowercased()
    }
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Spacing.space20) {
        Text(Strings.Integrations.homeDescription)
          .font(Typography.callout)
          .foregroundStyle(theme.mutedFg)
        if !connections.isEmpty { connectedSection }
        ConnectCatalogView(model: model, flow: flow)
      }
      .padding(.horizontal, Spacing.space16)
      .padding(.vertical, Spacing.space16)
    }
    .background(theme.background)
    .sheet(item: $selected) { connection in
      AppDetailSheet(model: model, flow: flow, connection: connection)
    }
    .sheet(item: sessionBinding) { session in
      ConnectWaitingSheet(session: session, flow: flow)
    }
    .onChange(of: flow.lastOutcome) { _, _ in consumeOutcome() }
    .alert(Strings.Integrations.title, isPresented: outcomeAlertBinding) {
      Button(Strings.Integrations.cancel, role: .cancel) {}
    } message: {
      Text(outcomeMessage ?? "")
    }
  }

  private var connectedSection: some View {
    VStack(alignment: .leading, spacing: Spacing.space12) {
      SectionHeader(Strings.Integrations.connectedTitle)
      LazyVGrid(columns: columns, spacing: Spacing.space12) {
        ForEach(connections) { connection in
          ConnectedAppCard(
            connection: connection,
            display: model.display(for: connection.toolkit),
            grants: model.grants,
            onTap: { selected = connection })
        }
      }
    }
  }

  /// Bridge the flow's observable session into a `.sheet(item:)`; a swipe-down
  /// cancels the flow.
  private var sessionBinding: Binding<IntegrationsConnectFlow.Session?> {
    Binding(get: { flow.session }, set: { if $0 == nil { flow.cancel() } })
  }

  private var outcomeAlertBinding: Binding<Bool> {
    Binding(get: { outcomeMessage != nil }, set: { if !$0 { outcomeMessage = nil } })
  }

  private func consumeOutcome() {
    switch flow.takeOutcome() {
    case .timeout: outcomeMessage = Strings.Integrations.connectTimeout
    case .error: outcomeMessage = Strings.Integrations.connectFailed
    case .active, .cancelled, .none: break
    }
  }
}
