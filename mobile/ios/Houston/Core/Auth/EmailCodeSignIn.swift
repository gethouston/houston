import SwiftUI

/// Passwordless email sign-in: enter an address, receive a 6-digit code, type
/// it back. Stays entirely in the app (no browser, no redirect) — the mobile
/// mirror of the desktop `email-sign-in.tsx`. Compact inline shape: a rounded
/// field with a circular send button on its right, sitting under the OAuth
/// buttons. Failures surface on `controller.errorMessage` (rendered by
/// `SignInView`), same as the provider flows.
struct EmailCodeSignIn: View {
    private enum Step {
        case email
        case code
    }

    let controller: AuthController
    let theme: HoustonTheme

    @State private var step: Step = .email
    @State private var email = ""
    @State private var code = ""
    @State private var sending = false

    private var busy: Bool { sending || controller.state == .signingIn }

    var body: some View {
        VStack(spacing: HoustonSpacing.space8) {
            switch step {
            case .email: emailStep
            case .code: codeStep
            }
        }
    }

    private var emailStep: some View {
        HStack(spacing: HoustonSpacing.space8) {
            TextField(Strings.Auth.emailPlaceholder, text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit { Task { await sendCode() } }
                .modifier(FieldChrome(theme: theme))
            submitButton(label: Strings.Auth.sendCode, disabled: busy || trimmedEmail.isEmpty) {
                await sendCode()
            }
        }
    }

    private var codeStep: some View {
        VStack(alignment: .leading, spacing: HoustonSpacing.space8) {
            HStack(spacing: HoustonSpacing.space8) {
                TextField("123456", text: $code)
                    .textContentType(.oneTimeCode)
                    .keyboardType(.numberPad)
                    .onSubmit { Task { await verifyCode() } }
                    .modifier(FieldChrome(theme: theme, centered: true))
                submitButton(label: Strings.Auth.verifyCode, disabled: busy || trimmedCode.isEmpty) {
                    await verifyCode()
                }
            }
            Text(Strings.Auth.codeSentTo(trimmedEmail))
                .font(.system(size: HoustonFontSize.xs))
                .foregroundStyle(HoustonColors.inkMuted.resolve(theme))
            HStack(spacing: HoustonSpacing.space16) {
                footnoteButton(Strings.Auth.resendCode, disabled: busy) {
                    Task { await sendCode() }
                }
                footnoteButton(Strings.Auth.useDifferentEmail, disabled: busy) {
                    step = .email
                    code = ""
                    controller.errorMessage = nil
                }
            }
        }
    }

    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespaces) }
    private var trimmedCode: String { code.trimmingCharacters(in: .whitespaces) }

    private func sendCode() async {
        guard !trimmedEmail.isEmpty, !busy else { return }
        sending = true
        if await controller.startEmailCode(email: trimmedEmail) {
            step = .code
            code = ""
        }
        sending = false
    }

    private func verifyCode() async {
        guard !trimmedCode.isEmpty, !busy else { return }
        await controller.verifyEmailCode(email: trimmedEmail, code: trimmedCode)
    }

    /// The circular submit affordance shared by both steps.
    private func submitButton(
        label: String, disabled: Bool, action: @escaping () async -> Void
    ) -> some View {
        Button {
            Task { await action() }
        } label: {
            Group {
                if busy {
                    ProgressView().tint(HoustonColors.actionText.resolve(theme))
                } else {
                    Image(systemName: "arrow.right")
                        .font(.system(size: HoustonFontSize.sm, weight: .medium))
                }
            }
            .frame(width: 44, height: 44)
            .foregroundStyle(HoustonColors.actionText.resolve(theme))
            .background(HoustonColors.action.resolve(theme))
            .clipShape(Circle())
        }
        .disabled(disabled)
        .accessibilityLabel(label)
    }

    private func footnoteButton(
        _ label: String, disabled: Bool, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: HoustonFontSize.xs))
                .underline()
                .foregroundStyle(HoustonColors.inkMuted.resolve(theme))
        }
        .disabled(disabled)
    }
}

/// Rounded-full field chrome shared by the email and code fields.
private struct FieldChrome: ViewModifier {
    let theme: HoustonTheme
    var centered = false

    func body(content: Content) -> some View {
        content
            .font(.system(size: HoustonFontSize.base))
            .multilineTextAlignment(centered ? .center : .leading)
            .kerning(centered ? 4 : 0)
            .foregroundStyle(HoustonColors.ink.resolve(theme))
            .padding(.horizontal, HoustonSpacing.space16)
            .frame(height: 44)
            .background(HoustonColors.card.resolve(theme))
            .clipShape(RoundedRectangle(cornerRadius: HoustonRadius.full))
            .overlay(
                RoundedRectangle(cornerRadius: HoustonRadius.full)
                    .strokeBorder(HoustonColors.line.resolve(theme))
            )
    }
}
