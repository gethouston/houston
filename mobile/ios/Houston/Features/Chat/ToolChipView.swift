import SwiftUI

/// A tool invocation chip (PARITY §5): the tool name with a collapsed one-line
/// input preview, and — once it arrives — its result attached beneath, tinted
/// destructive when the result is an error.
struct ToolChipView: View {
  @Environment(\.theme) private var theme
  let call: ToolCall
  var result: ToolResult?

  var body: some View {
    HStack {
      VStack(alignment: .leading, spacing: Spacing.space4) {
        header
        if let preview = inputPreview {
          Text(preview)
            .font(Typography.caption)
            .foregroundStyle(theme.mutedFg)
            .lineLimit(1)
        }
        if let result {
          Text(result.content)
            .font(Typography.caption)
            .foregroundStyle(result.isError ? theme.destructive : theme.mutedFg)
            .lineLimit(6)
            .padding(.top, Spacing.space2)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, Spacing.space12)
    .padding(.vertical, Spacing.space8)
    .background(background, in: RoundedRectangle(cornerRadius: Radius.lg))
    .overlay(
      RoundedRectangle(cornerRadius: Radius.lg)
        .strokeBorder(result?.isError == true ? theme.destructive.opacity(0.5) : theme.border, lineWidth: 1))
  }

  private var header: some View {
    HStack(spacing: Spacing.space6) {
      Image(systemName: "wrench.and.screwdriver")
        .font(Typography.caption)
        .foregroundStyle(theme.mutedFg)
      Text(call.name)
        .font(Typography.label)
        .foregroundStyle(theme.foreground)
    }
  }

  private var background: Color {
    result?.isError == true ? theme.destructive.opacity(0.08) : theme.muted
  }

  /// A compact single-line rendering of the tool input for the collapsed chip.
  private var inputPreview: String? {
    guard let input = call.input else { return nil }
    let text = ToolInputPreview.string(from: input)
    return text.isEmpty ? nil : text
  }
}

/// Renders a tool-call input `JSONValue` as a compact one-line preview string.
enum ToolInputPreview {
  static func string(from value: JSONValue) -> String {
    switch value {
    case let .string(s): return s
    case let .int(i): return String(i)
    case let .double(d): return String(d)
    case let .bool(b): return String(b)
    case .null: return ""
    case let .array(items):
      return items.map(string(from:)).joined(separator: ", ")
    case let .object(members):
      return members.sorted { $0.key < $1.key }
        .map { "\($0.key): \(string(from: $0.value))" }
        .joined(separator: ", ")
    }
  }
}
