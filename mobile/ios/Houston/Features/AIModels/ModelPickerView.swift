import SwiftUI

/// The per-agent model picker for one connected gateway (PARITY §2b). Lists the
/// gateway's selectable models (from the live VM, enriched with catalog display
/// metadata) and, for the active model, an effort control where the model
/// supports it. Selecting a model or effort writes through `providers/setModel`,
/// which pairs the model with its owning provider (so picking here also makes
/// this the agent's active provider).
struct ModelPickerView: View {
  @Environment(\.theme) private var theme
  let model: AIModelsModel
  let member: ProviderVM

  /// Effort chosen for the active model. The VM carries no effort, so this is
  /// seeded to the shared default and drives writes; it clamps per model.
  @State private var effort: EffortLevel = defaultEffort

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.space8) {
      Text(member.name.isEmpty ? Strings.AIModels.Detail.models : member.name)
        .font(Typography.captionStrong)
        .foregroundStyle(theme.mutedFg)
        .textCase(.uppercase)

      if member.models.isEmpty {
        Text(Strings.AIModels.Detail.noModels)
          .font(Typography.callout)
          .foregroundStyle(theme.mutedFg)
      } else {
        VStack(spacing: Spacing.space2) {
          ForEach(member.models, id: \.self) { modelId in
            modelRow(modelId)
          }
        }
      }
    }
  }

  @ViewBuilder private func modelRow(_ modelId: String) -> some View {
    let meta = ModelCatalog.model(wireId: member.id, modelId: modelId)
    let isSelected = member.isActive && member.activeModel == modelId
    VStack(alignment: .leading, spacing: Spacing.space8) {
      Button { select(modelId) } label: {
        HStack(alignment: .top, spacing: Spacing.space12) {
          VStack(alignment: .leading, spacing: Spacing.space2) {
            Text(meta?.label ?? modelId)
              .font(Typography.bodyMedium)
              .foregroundStyle(theme.foreground)
            if let description = meta?.description, !description.isEmpty {
              Text(description)
                .font(Typography.caption)
                .foregroundStyle(theme.mutedFg)
                .multilineTextAlignment(.leading)
            }
          }
          Spacer(minLength: Spacing.space8)
          if isSelected {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(theme.primary)
          }
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)

      if isSelected {
        let levels = ModelCatalog.effortLevels(wireId: member.id, modelId: modelId)
        if !levels.isEmpty { effortRow(modelId: modelId, levels: levels) }
      }
    }
    .padding(Spacing.space12)
    .background(
      isSelected ? theme.accent : Color.clear,
      in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
  }

  private func effortRow(modelId: String, levels: [EffortLevel]) -> some View {
    VStack(alignment: .leading, spacing: Spacing.space6) {
      Text(Strings.AIModels.Detail.effort)
        .font(Typography.caption)
        .foregroundStyle(theme.mutedFg)
      HStack(spacing: Spacing.space6) {
        ForEach(levels, id: \.self) { level in
          Button { setEffort(level, modelId: modelId) } label: {
            Text(Strings.AIModels.effortLabel(level))
              .font(Typography.caption)
              .foregroundStyle(effort == level ? theme.primaryFg : theme.foreground)
              .padding(.horizontal, Spacing.space10)
              .padding(.vertical, Spacing.space6)
              .background(
                effort == level ? theme.primary : theme.secondary, in: Capsule())
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  private func select(_ modelId: String) {
    let resolved = ModelCatalog.validEffort(wireId: member.id, modelId: modelId, effort: effort)
    if let resolved { effort = resolved }
    write(model: modelId, effort: resolved)
  }

  private func setEffort(_ level: EffortLevel, modelId: String) {
    let resolved = ModelCatalog.validEffort(wireId: member.id, modelId: modelId, effort: level)
    if let resolved { effort = resolved }
    write(model: modelId, effort: resolved)
  }

  private func write(model modelId: String, effort: EffortLevel?) {
    Task { try? await model.setModel(provider: member.id, model: modelId, effort: effort) }
  }
}
