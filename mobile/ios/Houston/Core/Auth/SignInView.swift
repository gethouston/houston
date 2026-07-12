import SwiftUI

/// The sign-in surface: Houston mark, a single "Continue with Google" button,
/// and an inline error line. All visual values come from the design tokens
/// (`HoustonColors` / `HoustonSpacing` / `HoustonRadius` / `HoustonFontSize`);
/// all copy from `Strings.Auth`.
struct SignInView: View {
    let controller: AuthController
    @Environment(\.colorScheme) private var colorScheme

    private var theme: HoustonTheme { colorScheme == .dark ? .dark : .light }

    var body: some View {
        ZStack {
            HoustonColors.input.resolve(theme).ignoresSafeArea()
            VStack(spacing: HoustonSpacing.space24) {
                Spacer()
                HoustonMark()
                    .frame(width: 48, height: 48)
                header
                continueButton
                if let message = controller.errorMessage {
                    Text(message)
                        .font(.system(size: HoustonFontSize.xs))
                        .foregroundStyle(HoustonColors.danger.resolve(theme))
                        .multilineTextAlignment(.center)
                }
                Spacer()
                Text(Strings.Auth.retryHint)
                    .font(.system(size: HoustonFontSize.xs))
                    .foregroundStyle(HoustonColors.inkMuted.resolve(theme))
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, HoustonSpacing.space24)
            .frame(maxWidth: 360)
        }
    }

    private var header: some View {
        VStack(spacing: HoustonSpacing.space8) {
            Text(Strings.Auth.welcomeTitle)
                .font(.system(size: HoustonFontSize.h1, weight: HoustonFontWeight.semibold))
                .foregroundStyle(HoustonColors.ink.resolve(theme))
            Text(Strings.Auth.welcomeSubtitle)
                .font(.system(size: HoustonFontSize.sm))
                .foregroundStyle(HoustonColors.inkMuted.resolve(theme))
                .multilineTextAlignment(.center)
        }
    }

    private var continueButton: some View {
        Button {
            Task { await controller.signIn() }
        } label: {
            HStack(spacing: HoustonSpacing.space8) {
                if controller.state == .signingIn {
                    ProgressView().tint(HoustonColors.actionText.resolve(theme))
                }
                Text(controller.state == .signingIn
                    ? Strings.Auth.continuePending
                    : Strings.Auth.continueWithGoogle)
                    .font(.system(size: HoustonFontSize.base, weight: HoustonFontWeight.medium))
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .foregroundStyle(HoustonColors.actionText.resolve(theme))
            .background(HoustonColors.action.resolve(theme))
            .clipShape(RoundedRectangle(cornerRadius: HoustonRadius.full))
        }
        .disabled(controller.state == .signingIn)
    }
}
