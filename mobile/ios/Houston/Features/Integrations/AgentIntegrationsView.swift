import SwiftUI

/// The per-agent Integrations tab (PARITY-SETTINGS §3 `agentTab.*`), reachable
/// from the agent screen. Designed to exist now so the integration agent can
/// wire it in: `AgentIntegrationsView(agentId:)`.
///
/// Shows "Apps this agent can use" (the agent's granted apps, each with a
/// deactivate action) and "Your other connected apps" (account apps this agent
/// can't use yet, each with an activate action), plus the always-visible connect
/// catalog. When grants are unsupported for this agent (the 404-null landmine)
/// it degrades to one list of every connected app with no toggles. A freshly
/// connected app auto-grants to this agent on landing.
struct AgentIntegrationsView: View {
  @Environment(\.theme) private var theme
  let agentId: String
  var onManageAll: (() -> Void)?

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
          flow = IntegrationsConnectFlow(onLanded: { [model, agentId] toolkit in
            Task {
              await model.refresh()
              await model.setGrant(toolkit: toolkit, agentId: agentId, active: true)
            }
          })
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
      if let flow, model.grantsLoaded {
        ready(flow: flow)
      } else if let error = model.grantsError {
        IntegrationStateViews.GrantsError(message: error) {
          Task { await model.reloadGrants() }
        }
      } else {
        IntegrationStateViews.Loading()
      }
    }
  }

  private func ready(flow: IntegrationsConnectFlow) -> some View {
    let shape = AgentIntegrationsShape.build(
      connections: model.connections, grants: model.grants.grants(for: agentId))
    return ScrollView {
      VStack(alignment: .leading, spacing: Spacing.space20) {
        sections(for: shape)
        ConnectCatalogView(model: model, flow: flow)
        if let onManageAll {
          Button(action: onManageAll) {
            Text(Strings.Integrations.agentManageAll)
              .font(Typography.callout)
              .foregroundStyle(theme.inkMuted)
          }
          .frame(maxWidth: .infinity)
        }
      }
      .padding(.horizontal, Spacing.space16)
      .padding(.vertical, Spacing.space16)
    }
    .background(theme.input)
    .sheet(item: sessionBinding(flow)) { session in
      ConnectWaitingSheet(session: session, flow: flow)
    }
  }

  @ViewBuilder private func sections(for shape: AgentIntegrationsShape) -> some View {
    switch shape {
    case let .grants(active, available):
      appSection(
        title: Strings.Integrations.agentActiveTitle,
        connections: active,
        empty: active.isEmpty && available.isEmpty,
        trailing: { deactivateButton(toolkit: $0) })
      if !available.isEmpty {
        appSection(
          title: Strings.Integrations.agentAllAppsTitle,
          subtitle: Strings.Integrations.agentAllAppsSubtitle,
          connections: available,
          empty: false,
          trailing: { activateButton(toolkit: $0) })
      }
    case let .degraded(all):
      appSection(
        title: Strings.Integrations.agentActiveTitle,
        connections: all,
        empty: all.isEmpty,
        trailing: { _ in EmptyView() })
    }
  }

  @ViewBuilder private func appSection<Trailing: View>(
    title: String,
    subtitle: String? = nil,
    connections: [IntegrationConnection],
    empty: Bool,
    @ViewBuilder trailing: @escaping (String) -> Trailing
  ) -> some View {
    VStack(alignment: .leading, spacing: Spacing.space8) {
      SectionHeader(title)
      if let subtitle {
        Text(subtitle)
          .font(Typography.caption)
          .foregroundStyle(theme.inkMuted)
          .padding(.horizontal, Spacing.space12)
      }
      if empty {
        EmptyStateView(
          title: Strings.Integrations.agentEmptyTitle,
          description: Strings.Integrations.agentEmptyBody,
          systemImage: "square.grid.2x2")
        .frame(minHeight: 160)
      } else {
        LazyVStack(spacing: Spacing.space4) {
          ForEach(connections) { connection in
            AppRowView(display: model.display(for: connection.toolkit)) {
              trailing(connection.toolkit)
            }
          }
        }
      }
    }
  }

  private func deactivateButton(toolkit: String) -> some View {
    pill(Strings.Integrations.agentDeactivate, tint: theme.inkMuted) {
      Task { await model.setGrant(toolkit: toolkit, agentId: agentId, active: false) }
    }
  }

  private func activateButton(toolkit: String) -> some View {
    pill(Strings.Integrations.agentActivate, tint: theme.action) {
      Task { await model.setGrant(toolkit: toolkit, agentId: agentId, active: true) }
    }
  }

  private func pill(_ title: String, tint: Color, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title)
        .font(Typography.caption)
        .foregroundStyle(tint)
        .padding(.horizontal, Spacing.space10)
        .padding(.vertical, Spacing.space6)
        .background(theme.chipSubtle, in: Capsule())
        .overlay(Capsule().strokeBorder(theme.line, lineWidth: 1))
    }
    .buttonStyle(.plain)
  }

  private func sessionBinding(_ flow: IntegrationsConnectFlow) -> Binding<IntegrationsConnectFlow.Session?> {
    Binding(get: { flow.session }, set: { if $0 == nil { flow.cancel() } })
  }
}
