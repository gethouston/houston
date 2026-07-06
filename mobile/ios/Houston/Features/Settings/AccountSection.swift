import SwiftUI

/// The Account section: the signed-in user's avatar, name, and email, plus the
/// Sign out button (PARITY-SETTINGS §1 — sign-out lives here, NO confirm dialog).
/// Identity comes from the Supabase JWT (`UserProfile`); sign-out calls
/// `AuthController.signOut()` via the injected closure.
struct AccountSection: View {
    @Environment(\.theme) private var theme
    let profile: UserProfile?
    let onSignOut: () -> Void

    var body: some View {
        Section {
            HStack(spacing: Spacing.space12) {
                AccountAvatar(url: profile?.avatarURL)
                VStack(alignment: .leading, spacing: Spacing.space2) {
                    Text(profile?.displayName ?? Strings.Settings.accountFallbackName)
                        .font(Typography.bodyMedium)
                        .foregroundStyle(theme.foreground)
                        .lineLimit(1)
                    if let email = profile?.email, !email.isEmpty {
                        Text(email)
                            .font(Typography.caption)
                            .foregroundStyle(theme.mutedFg)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            Button(role: .destructive, action: onSignOut) {
                Text(Strings.Settings.signOut)
                    .font(Typography.bodyMedium)
                    .foregroundStyle(theme.destructive)
            }
        } header: {
            SettingsSectionHeader(Strings.Settings.accountTitle)
        }
        .listRowBackground(theme.card)
    }
}

/// The account avatar: the Google photo (`user_metadata.avatar_url`) via
/// `AsyncImage`, falling back to a neutral person glyph while loading, on error,
/// or when the token carries no photo.
private struct AccountAvatar: View {
    @Environment(\.theme) private var theme
    let url: URL?

    private let diameter = Spacing.space40

    var body: some View {
        Group {
            if let url {
                AsyncImage(url: url) { phase in
                    if case let .success(image) = phase {
                        image.resizable().scaledToFill()
                    } else {
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: diameter, height: diameter)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(theme.border))
        .accessibilityHidden(true)
    }

    private var placeholder: some View {
        ZStack {
            theme.secondary
            Image(systemName: "person.fill")
                .font(Typography.title)
                .foregroundStyle(theme.mutedFg)
        }
    }
}
