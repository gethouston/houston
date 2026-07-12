import SwiftUI

/// One agent's AI Models grid: the provider cards (from the live
/// `providers/<agentId>` VM, merged with catalog metadata), a subtle per-agent
/// scoping footer (landmine 1), and the connect / detail sheets. Holds the
/// `AIModelsModel` for this agent and retains its scope stream while on screen.
struct AIModelsAgentView: View {
  @Environment(\.theme) private var theme
  @Environment(\.agentsOverview) private var overview
  @State private var model: AIModelsModel
  @State private var retention: ScopeRetention?
  @State private var connectCard: ProviderCardModel?
  @State private var detailCard: ProviderCardModel?

  private let agentId: String

  init(agentId: String) {
    self.agentId = agentId
    _model = State(initialValue: AIModelsModel(agentId: agentId))
  }

  /// The agent's display name for the scoping footer, resolved reactively from
  /// the shared overview. Falls back to a generic phrasing before it loads.
  private var agentName: String? {
    overview.agents.first { $0.id == agentId }?.agent.name
  }

  private let columns = [
    GridItem(.flexible(), spacing: Spacing.space12),
    GridItem(.flexible(), spacing: Spacing.space12),
  ]

  var body: some View {
    content
      .navigationTitle(Strings.AIModels.title)
      .navigationBarTitleDisplayMode(.inline)
      .background(theme.input)
      .onAppear { if retention == nil { retention = model.retain() } }
      .onDisappear { retention?.cancel(); retention = nil }
      .sheet(item: $connectCard) { card in
        ProviderConnectSheet(model: model, card: card)
      }
      .sheet(item: $detailCard) { card in
        ProviderDetailSheet(model: model, card: card)
      }
  }

  @ViewBuilder private var content: some View {
    let cards = model.cards
    if cards.isEmpty {
      if model.loaded {
        EmptyStateView(
          title: Strings.AIModels.Card.notConnected,
          description: scopingLine,
          systemImage: "square.stack.3d.up")
      } else {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    } else {
      ScrollView {
        LazyVGrid(columns: columns, spacing: Spacing.space12) {
          ForEach(cards) { card in
            ProviderCardView(card: card) { tap(card) }
          }
          ForEach(ProviderCatalog.comingSoon) { provider in
            ComingSoonCardView(provider: provider)
          }
        }
        .padding(.horizontal, Spacing.space16)
        .padding(.top, Spacing.space12)
        footer
      }
    }
  }

  /// The per-agent scoping line, named when the agent is known, generic before.
  private var scopingLine: String {
    if let agentName, !agentName.isEmpty { return Strings.AIModels.scopedTo(agentName) }
    return Strings.AIModels.scopedGeneric
  }

  private var footer: some View {
    Text(scopingLine)
      .font(Typography.caption)
      .foregroundStyle(theme.inkMuted)
      .multilineTextAlignment(.center)
      .frame(maxWidth: .infinity)
      .padding(.horizontal, Spacing.space24)
      .padding(.vertical, Spacing.space20)
  }

  /// A connected provider opens its detail (sign out + model picker); an
  /// available one starts the connect flow.
  private func tap(_ card: ProviderCardModel) {
    if card.configured {
      detailCard = card
    } else {
      connectCard = card
    }
  }
}
