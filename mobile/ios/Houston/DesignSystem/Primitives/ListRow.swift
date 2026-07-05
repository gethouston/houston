import SwiftUI

/// A themed list row shell: consistent padding, card surface, and the selected/
/// highlighted `bg-accent` treatment (PARITY §1 "selected/highlighted → bg-accent").
/// Surfaces compose their own leading/title/trailing inside; this owns only the
/// row chrome so every list reads identically.
struct ListRow<Content: View>: View {
    @Environment(\.theme) private var theme
    var isSelected: Bool = false
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Spacing.space12)
            .padding(.vertical, Spacing.space10)
            .background(isSelected ? theme.accent : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    }
}
