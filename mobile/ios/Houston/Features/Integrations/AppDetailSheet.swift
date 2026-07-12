import SwiftUI

/// The global page's per-app detail sheet (PARITY-SETTINGS §3): status, which
/// agents may use the app, and the Reconnect / Disconnect actions.
///
/// The agent list is tri-state (the 404-null landmine): when grants are
/// unsupported the host has no per-agent notion, so every agent can use the app
/// and NO toggles are shown (just a note); an empty agent list shows the
/// "turn one on" hint; otherwise each agent gets a Switch bound to its grant.
/// Disconnect is account-wide, gated behind the "everywhere?" confirm.
struct AppDetailSheet: View {
  @Environment(\.theme) private var theme
  @Environment(\.dismiss) private var dismiss
  let model: IntegrationsModel
  let flow: IntegrationsConnectFlow
  let connection: IntegrationConnection

  @State private var confirmingDisconnect = false

  private var display: AppDisplay { model.display(for: connection.toolkit) }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: Spacing.space16) {
          header
          agentsSection
        }
        .padding(Spacing.space16)
      }
      .background(theme.input)
      .safeAreaInset(edge: .bottom) { actions }
      .navigationBarTitleDisplayMode(.inline)
    }
    .alert(
      Strings.Integrations.disconnectConfirmTitle(display.name),
      isPresented: $confirmingDisconnect
    ) {
      Button(Strings.Integrations.disconnectConfirmAction, role: .destructive) {
        Task { await model.disconnect(toolkit: connection.toolkit); dismiss() }
      }
      Button(Strings.Integrations.cancel, role: .cancel) {}
    } message: {
      Text(Strings.Integrations.disconnectConfirmBody(display.name))
    }
  }

  private var header: some View {
    HStack(spacing: Spacing.space12) {
      AppLogoView(display: display, diameter: 48)
      VStack(alignment: .leading, spacing: Spacing.space4) {
        Text(display.name)
          .font(Typography.title)
          .foregroundStyle(theme.ink)
          .lineLimit(1)
        ConnectionStatusBadge(status: connection.status)
      }
      Spacer(minLength: 0)
    }
  }

  @ViewBuilder private var agentsSection: some View {
    VStack(alignment: .leading, spacing: Spacing.space8) {
      Text(Strings.Integrations.detailActiveOn)
        .font(Typography.label)
        .foregroundStyle(theme.ink)
      if let error = model.grantsError {
        grantsError(error)
      } else if !model.grants.supported {
        note(Strings.Integrations.detailAllAgentsNote)
      } else if model.agents.isEmpty {
        note(Strings.Integrations.detailNoAgents)
      } else {
        VStack(spacing: Spacing.space2) {
          ForEach(model.agents) { agent in agentRow(agent) }
        }
      }
    }
  }

  private func agentRow(_ agent: AgentListItem) -> some View {
    HStack(spacing: Spacing.space10) {
      HoustonAvatar(agentColorHex: nil, diameter: 24)
      Text(agent.name)
        .font(Typography.body)
        .foregroundStyle(theme.ink)
        .lineLimit(1)
      Spacer(minLength: Spacing.space8)
      Toggle("", isOn: binding(for: agent.id))
        .labelsHidden()
        .accessibilityLabel(agent.name)
    }
    .padding(.vertical, Spacing.space4)
  }

  private func binding(for agentId: String) -> Binding<Bool> {
    Binding(
      get: { model.grants.agentIds(forToolkit: connection.toolkit).contains(agentId) },
      set: { active in
        Task { await model.setGrant(toolkit: connection.toolkit, agentId: agentId, active: active) }
      })
  }

  /// A read of one agent's grants failed (transient error): show the reason and
  /// a retry, never the silent "every agent" fallback (no-silent-failures).
  private func grantsError(_ message: String) -> some View {
    VStack(alignment: .leading, spacing: Spacing.space8) {
      note(Strings.Integrations.grantsLoadError)
      Button {
        Task { await model.reloadGrants() }
      } label: {
        Text(Strings.Integrations.grantsRetry)
          .font(Typography.label)
          .foregroundStyle(theme.action)
      }
      .accessibilityHint(message)
    }
  }

  private func note(_ text: String) -> some View {
    Text(text)
      .font(Typography.caption)
      .foregroundStyle(theme.inkMuted)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(Spacing.space12)
      .background(theme.chipSubtle, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
  }

  private var actions: some View {
    HStack(spacing: Spacing.space8) {
      Button {
        dismiss()
        Task { await flow.connect(toolkit: connection.toolkit, appName: display.name) }
      } label: {
        actionLabel(Strings.Integrations.detailReconnect, icon: "arrow.clockwise", tint: theme.ink)
          .overlay(Capsule().strokeBorder(theme.line, lineWidth: 1))
      }
      Button {
        confirmingDisconnect = true
      } label: {
        actionLabel(Strings.Integrations.detailDisconnect, icon: "bolt.slash", tint: theme.danger)
      }
    }
    .padding(Spacing.space16)
    .background(theme.input)
  }

  private func actionLabel(_ title: String, icon: String, tint: Color) -> some View {
    HStack(spacing: Spacing.space6) {
      Image(systemName: icon)
      Text(title)
    }
    .font(Typography.label)
    .foregroundStyle(tint)
    .frame(maxWidth: .infinity)
    .padding(.vertical, Spacing.space12)
    .background(theme.chipSubtle, in: Capsule())
  }
}
