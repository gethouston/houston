import SwiftUI
import UIKit

/// The version footer (PARITY-SETTINGS §1: "Version {{version}}", tap copies).
/// Tapping copies the marketing version to the pasteboard and asks the caller to
/// toast "Version copied". `UIPasteboard` set is infallible on iOS, so the
/// desktop's `versionCopyFailed` path has no iOS equivalent.
struct VersionFooter: View {
    @Environment(\.theme) private var theme
    let onCopied: () -> Void

    var body: some View {
        Section {
            Button(action: copy) {
                HStack {
                    Spacer(minLength: 0)
                    Text(AppVersion.footer)
                        .font(Typography.caption)
                        .foregroundStyle(theme.mutedFg)
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .listRowBackground(Color.clear)
        }
    }

    private func copy() {
        UIPasteboard.general.string = AppVersion.marketing
        onCopied()
    }
}
