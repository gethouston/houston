import SwiftUI

/// The always-visible "Connect more apps" catalog (PARITY-SETTINGS §3): a search
/// field, a category filter menu (only when the catalog carries categories),
/// and the A-Z toolkit list minus already-connected apps, paged client-side with
/// "Load more". Tapping a row starts the connect flow (opens the OAuth page in
/// `SFSafariViewController`, then the waiting sheet polls to completion).
struct ConnectCatalogView: View {
  @Environment(\.theme) private var theme
  let model: IntegrationsModel
  let flow: IntegrationsConnectFlow

  @State private var search = ""
  @State private var category = "all"
  @State private var visible = IntegrationsCatalog.browsePageSize

  private var categories: [String] { IntegrationsCatalog.categories(model.toolkits) }

  private var results: [IntegrationToolkit] {
    IntegrationsCatalog.browse(
      catalog: model.toolkits,
      query: search,
      category: category,
      connected: model.connectedSlugs)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.space12) {
      SectionHeader(Strings.Integrations.connectMoreTitle)
      filterBar
      if results.isEmpty {
        Text(Strings.Integrations.pickerNoResults)
          .font(Typography.callout)
          .foregroundStyle(theme.mutedFg)
          .frame(maxWidth: .infinity)
          .padding(.vertical, Spacing.space16)
      } else {
        LazyVStack(spacing: Spacing.space4) {
          ForEach(results.prefix(visible)) { toolkit in
            row(for: toolkit)
          }
        }
        if visible < results.count { loadMore }
      }
    }
    .onChange(of: search) { _, _ in visible = IntegrationsCatalog.browsePageSize }
    .onChange(of: category) { _, _ in visible = IntegrationsCatalog.browsePageSize }
  }

  @ViewBuilder private var filterBar: some View {
    HStack(spacing: Spacing.space8) {
      SearchField(text: $search, placeholder: Strings.Integrations.searchPlaceholder)
      if !categories.isEmpty {
        Menu {
          Picker("", selection: $category) {
            Text(Strings.Integrations.allCategories).tag("all")
            ForEach(categories, id: \.self) { cat in
              Text(IntegrationsCatalog.categoryLabel(cat)).tag(cat)
            }
          }
        } label: {
          HStack(spacing: Spacing.space4) {
            Text(category == "all"
              ? Strings.Integrations.allCategories
              : IntegrationsCatalog.categoryLabel(category))
              .font(Typography.label)
              .lineLimit(1)
            Image(systemName: "chevron.down").font(Typography.caption)
          }
          .foregroundStyle(theme.foreground)
          .padding(.horizontal, Spacing.space12)
          .padding(.vertical, Spacing.space10)
          .background(theme.muted, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
          .overlay(
            RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
              .strokeBorder(theme.border, lineWidth: 1))
        }
      }
    }
  }

  @ViewBuilder private func row(for toolkit: IntegrationToolkit) -> some View {
    let display = model.display(for: toolkit.slug)
    AppRowView(
      display: display,
      subtitle: display.description,
      onTap: {
        guard flow.connecting == nil else { return }
        Task { await flow.connect(toolkit: toolkit.slug, appName: display.name) }
      }
    ) {
      if flow.connecting == toolkit.slug {
        ProgressView().controlSize(.small)
      } else {
        Image(systemName: "plus")
          .font(Typography.label)
          .foregroundStyle(theme.mutedFg)
      }
    }
  }

  private var loadMore: some View {
    Button {
      visible += IntegrationsCatalog.browsePageSize
    } label: {
      Text(Strings.Integrations.loadMore(remaining: results.count - visible))
        .font(Typography.label)
        .foregroundStyle(theme.foreground)
        .padding(.horizontal, Spacing.space16)
        .padding(.vertical, Spacing.space8)
        .background(theme.muted, in: Capsule())
        .overlay(Capsule().strokeBorder(theme.border, lineWidth: 1))
    }
    .frame(maxWidth: .infinity)
    .padding(.top, Spacing.space4)
  }
}
