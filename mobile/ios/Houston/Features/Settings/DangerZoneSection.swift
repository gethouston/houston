import SwiftUI

/// The Danger zone (PARITY-SETTINGS §1). DISABLED on iOS: the reachable SDK
/// surface has no workspace-delete command, and no workspace list/count to
/// evaluate the "create another first" (blocked-if-last) rule. The section is
/// rendered with the parity copy but the button is inert and honestly labeled,
/// rather than presenting a confirm that can't act. The confirm copy
/// (`Strings.Settings.deleteConfirm*`) is defined for the day delete lands.
struct DangerZoneSection: View {
    @Environment(\.theme) private var theme

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: Spacing.space8) {
                Text(Strings.Settings.dangerDescription)
                    .font(Typography.caption)
                    .foregroundStyle(theme.mutedFg)
                Button(role: .destructive) {} label: {
                    Text(Strings.Settings.deleteButton)
                        .font(Typography.bodyMedium)
                        .foregroundStyle(theme.mutedFg)
                }
                .disabled(true)
                Text(Strings.Settings.deleteUnavailable)
                    .font(Typography.caption)
                    .foregroundStyle(theme.mutedFg)
            }
            .padding(.vertical, Spacing.space4)
        } header: {
            SettingsSectionHeader(Strings.Settings.dangerTitle)
        }
        .listRowBackground(theme.card)
    }
}
