import SwiftUI

/// GitHub Copilot's Personal-vs-Enterprise prompt (providers.json:copilot,
/// PARITY §2b). Both choices drive the single `github-copilot` provider; the only
/// difference is the enterprise GitHub domain passed at login (`enterpriseDomain`,
/// stored as the credential's `enterpriseUrl`). Personal passes no domain.
struct CopilotConnectView: View {
  @Environment(\.theme) private var theme
  let onCancel: () -> Void
  /// `nil` domain = Personal; a non-empty domain = Company / GitHub Enterprise.
  let onContinue: (String?) -> Void

  private enum Plan { case personal, company }
  @State private var plan: Plan = .personal
  @State private var domain = ""

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Spacing.space16) {
        VStack(alignment: .leading, spacing: Spacing.space8) {
          Text(Strings.AIModels.Copilot.title)
            .font(Typography.title)
            .foregroundStyle(theme.foreground)
          Text(Strings.AIModels.Copilot.description)
            .font(Typography.callout)
            .foregroundStyle(theme.mutedFg)
        }

        option(
          .personal, title: Strings.AIModels.Copilot.personalTitle,
          desc: Strings.AIModels.Copilot.personalDesc)
        option(
          .company, title: Strings.AIModels.Copilot.companyTitle,
          desc: Strings.AIModels.Copilot.companyDesc)

        if plan == .company {
          VStack(alignment: .leading, spacing: Spacing.space6) {
            Text(Strings.AIModels.Copilot.domainLabel)
              .font(Typography.caption)
              .foregroundStyle(theme.mutedFg)
            TextField(Strings.AIModels.Copilot.domainPlaceholder, text: $domain)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
              .keyboardType(.URL)
              .padding(Spacing.space12)
              .background(theme.input, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
            Text(Strings.AIModels.Copilot.domainHint)
              .font(Typography.caption)
              .foregroundStyle(theme.mutedFg)
          }
        }

        Button(action: submit) {
          Text(Strings.AIModels.Copilot.cont)
            .font(Typography.label)
            .foregroundStyle(theme.primaryFg)
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.space12)
            .background(theme.primary, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(plan == .company && domain.trimmingCharacters(in: .whitespaces).isEmpty)
      }
      .padding(Spacing.space20)
    }
  }

  private func option(_ value: Plan, title: String, desc: String) -> some View {
    Button { plan = value } label: {
      HStack(spacing: Spacing.space12) {
        Image(systemName: plan == value ? "largecircle.fill.circle" : "circle")
          .foregroundStyle(plan == value ? theme.primary : theme.mutedFg)
        VStack(alignment: .leading, spacing: Spacing.space2) {
          Text(title).font(Typography.bodyMedium).foregroundStyle(theme.foreground)
          Text(desc).font(Typography.caption).foregroundStyle(theme.mutedFg)
        }
        Spacer(minLength: 0)
      }
      .padding(Spacing.space12)
      .background(
        theme.secondary, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
          .strokeBorder(plan == value ? theme.primary : theme.border, lineWidth: 1))
      .contentShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    }
    .buttonStyle(.plain)
  }

  private func submit() {
    switch plan {
    case .personal: onContinue(nil)
    case .company:
      let trimmed = domain.trimmingCharacters(in: .whitespacesAndNewlines)
      onContinue(trimmed.isEmpty ? nil : trimmed)
    }
  }
}
