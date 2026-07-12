import SwiftUI

/// Themed search field: magnifier icon, bound text, and a clear button that
/// appears while non-empty. Placeholder defaults to the mission-search copy
/// ("Search missions", PARITY §3) but callers may override (e.g. archived).
struct SearchField: View {
    @Environment(\.theme) private var theme
    @Binding var text: String
    var placeholder: String = Strings.Search.placeholder

    var body: some View {
        HStack(spacing: Spacing.space8) {
            Image(systemName: "magnifyingglass")
                .font(Typography.callout)
                .foregroundStyle(theme.inkMuted)
            TextField(placeholder, text: $text)
                .font(Typography.body)
                .foregroundStyle(theme.ink)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(theme.inkMuted)
                }
                .accessibilityLabel(Strings.Search.clear)
            }
        }
        .padding(.horizontal, Spacing.space12)
        .padding(.vertical, Spacing.space10)
        .background(theme.chipSubtle, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                .strokeBorder(theme.line, lineWidth: 1)
        )
    }
}
