import SwiftUI

/// Report bug drill-in (PARITY-SETTINGS §1: message + recent logs). The user
/// describes the bug; Send composes their message with a tail of the app's
/// recent `os_log` output and hands it to the system share sheet.
///
/// DEVIATION (flagged): no bug-submit command exists on the iOS SDK surface, so
/// this shares the report instead of POSTing it (see `BugReport`). Honest and
/// simple; swap the share sheet for a submit command when one lands.
struct ReportBugView: View {
    @Environment(\.theme) private var theme
    @State private var message = ""
    @State private var payload: SharePayload?

    var body: some View {
        List {
            Section {
                Text(Strings.Settings.reportBugIntro)
                    .font(Typography.callout)
                    .foregroundStyle(theme.foreground)
                Text(Strings.Settings.reportBugTimingTip)
                    .font(Typography.caption)
                    .foregroundStyle(theme.mutedFg)
            }
            .listRowBackground(theme.card)

            Section {
                editor
            } header: {
                SettingsSectionHeader(Strings.Settings.reportBugLabel)
            }
            .listRowBackground(theme.card)

            Section {
                Button(action: prepare) {
                    Text(Strings.Settings.reportBugSend)
                        .font(Typography.bodyMedium)
                        .foregroundStyle(theme.primary)
                }
            }
            .listRowBackground(theme.card)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .navigationTitle(Strings.Settings.reportBug)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $payload) { ShareSheet(items: [$0.text]) }
    }

    private var editor: some View {
        ZStack(alignment: .topLeading) {
            if message.isEmpty {
                Text(Strings.Settings.reportBugPlaceholder)
                    .font(Typography.body)
                    .foregroundStyle(theme.mutedFg)
                    .padding(.top, Spacing.space8)
                    .padding(.horizontal, Spacing.space4)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $message)
                .font(Typography.body)
                .foregroundStyle(theme.foreground)
                .frame(minHeight: Spacing.space64 * 2)
                .scrollContentBackground(.hidden)
        }
    }

    private func prepare() {
        let logs = BugReport.recentLogs()
        payload = SharePayload(text: BugReport.compose(message: message, logs: logs))
    }
}

/// A shareable payload, `Identifiable` so `.sheet(item:)` presents it.
struct SharePayload: Identifiable {
    let id = UUID()
    let text: String
}
