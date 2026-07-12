import SwiftUI

/// The browser hand-off sheet shown while a connect flow is mid-OAuth for an app
/// (PARITY-SETTINGS §3 `waiting.*`): a spinner, the "we opened X in your browser"
/// explanation, and the three recovery actions — "I have finished" (wake the
/// poll now), "Reopen in browser", and "Cancel". The OAuth page opens
/// immediately in an in-app `SFSafariViewController`; when the connection lands
/// (or errors / times out) the flow clears the session and this sheet dismisses.
struct ConnectWaitingSheet: View {
  @Environment(\.theme) private var theme
  let session: IntegrationsConnectFlow.Session
  let flow: IntegrationsConnectFlow

  @State private var showSafari = false

  var body: some View {
    VStack(spacing: Spacing.space16) {
      ProgressView().controlSize(.large)
      VStack(spacing: Spacing.space8) {
        Text(Strings.Integrations.waitingTitle(app: session.appName))
          .font(Typography.title)
          .foregroundStyle(theme.ink)
          .multilineTextAlignment(.center)
        Text(Strings.Integrations.waitingBody(app: session.appName))
          .font(Typography.callout)
          .foregroundStyle(theme.inkMuted)
          .multilineTextAlignment(.center)
      }
      VStack(spacing: Spacing.space8) {
        Button {
          flow.checkNow()
        } label: {
          Text(Strings.Integrations.waitingCheck)
            .font(Typography.label)
            .foregroundStyle(theme.actionText)
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.space12)
            .background(theme.action, in: Capsule())
        }
        Button {
          showSafari = true
        } label: {
          Text(Strings.Integrations.waitingReopen)
            .font(Typography.label)
            .foregroundStyle(theme.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.space12)
            .background(theme.chipSubtle, in: Capsule())
            .overlay(Capsule().strokeBorder(theme.line, lineWidth: 1))
        }
        Button {
          flow.cancel()
        } label: {
          Text(Strings.Integrations.cancel)
            .font(Typography.label)
            .foregroundStyle(theme.inkMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.space12)
        }
      }
    }
    .padding(Spacing.space24)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    .background(theme.input)
    .presentationDetents([.medium])
    .onAppear { showSafari = true }
    .fullScreenCover(isPresented: $showSafari) {
      SafariView(url: session.redirectURL).ignoresSafeArea()
    }
  }
}
