import SwiftUI

/// The detail sheet for a CONNECTED provider card: a signed-in header, the model
/// picker for each of the card's gateways (the merged OpenCode account keeps its
/// two gateways as separate labelled sections, HOU-577), and a Sign out action
/// guarded by the confirm copy (providers.json:signOutConfirm). Reads the LIVE
/// card from the model so a model/effort switch reflects immediately.
struct ProviderDetailSheet: View {
  @Environment(\.theme) private var theme
  @Environment(\.dismiss) private var dismiss
  let model: AIModelsModel
  let card: ProviderCardModel

  @State private var confirmingSignOut = false

  /// The live card (post-write updates), falling back to the tapped snapshot.
  private var live: ProviderCardModel {
    model.cards.first { $0.id == card.id } ?? card
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: Spacing.space20) {
          header
          ForEach(live.members) { member in
            ModelPickerView(model: model, member: member)
          }
          signOutButton
        }
        .padding(Spacing.space20)
      }
      .background(theme.input)
      .navigationTitle(live.name)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(Strings.AIModels.Login.cancel) { dismiss() }
        }
      }
      .alert(Strings.AIModels.SignOut.title(live.name), isPresented: $confirmingSignOut) {
        Button(Strings.AIModels.SignOut.cancel, role: .cancel) {}
        Button(Strings.AIModels.SignOut.confirm, role: .destructive) { signOut() }
      } message: {
        Text(Strings.AIModels.SignOut.description(live.name))
      }
    }
  }

  private var header: some View {
    HStack(spacing: Spacing.space12) {
      ProviderGlyph(providerId: live.glyphId, size: 28)
      VStack(alignment: .leading, spacing: Spacing.space2) {
        Text(live.name).font(Typography.title).foregroundStyle(theme.ink)
        Text(Strings.AIModels.Detail.signedInWith(live.name))
          .font(Typography.caption)
          .foregroundStyle(theme.inkMuted)
      }
      Spacer(minLength: 0)
    }
  }

  private var signOutButton: some View {
    Button { confirmingSignOut = true } label: {
      Text(Strings.AIModels.Detail.signOut)
        .font(Typography.label)
        .foregroundStyle(theme.danger)
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.space12)
        .background(theme.chip, in: Capsule())
        .overlay(Capsule().strokeBorder(theme.line, lineWidth: 1))
    }
    .buttonStyle(.plain)
  }

  private func signOut() {
    Task {
      try? await model.logout(provider: live.primaryMember.id)
      dismiss()
    }
  }
}
