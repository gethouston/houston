import SwiftUI

/// The two conversational bubbles (PARITY §5): the user's message on the right,
/// the assistant's on the left. The assistant bubble updates in place while
/// streaming — its row identity is stable (the SDK feed id), so a growing reply
/// mutates only this row's text; a smooth height animation keyed on the text
/// keeps it from snapping.

/// A user message bubble, right-aligned, on the primary fill.
struct UserBubble: View {
  @Environment(\.theme) private var theme
  let text: String
  /// Author label, shown only in multiplayer conversations (PARITY §5).
  var author: String?

  var body: some View {
    HStack {
      Spacer(minLength: Spacing.space40)
      VStack(alignment: .trailing, spacing: Spacing.space2) {
        if let author {
          Text(author)
            .font(Typography.caption)
            .foregroundStyle(theme.mutedFg)
        }
        Text(text)
          .font(Typography.body)
          .foregroundStyle(theme.primaryFg)
          .padding(.horizontal, Spacing.space12)
          .padding(.vertical, Spacing.space8)
          .background(theme.primary, in: BubbleShape(tail: .trailing))
          .textSelection(.enabled)
      }
    }
  }
}

/// An assistant message bubble, left-aligned, on the card fill. Streaming updates
/// animate the height smoothly.
struct AssistantBubble: View {
  @Environment(\.theme) private var theme
  let text: String
  let streaming: Bool

  var body: some View {
    HStack {
      Text(text)
        .font(Typography.body)
        .foregroundStyle(theme.cardFg)
        .padding(.horizontal, Spacing.space12)
        .padding(.vertical, Spacing.space8)
        .background(theme.card, in: BubbleShape(tail: .leading))
        .overlay(BubbleShape(tail: .leading).strokeBorder(theme.border, lineWidth: 1))
        .textSelection(.enabled)
        .animation(.smooth(duration: Motion.fast), value: text)
      Spacer(minLength: Spacing.space40)
    }
  }
}

/// A chat bubble shape: rounded on all corners, with the tail corner squared off
/// toward the speaker's side (WhatsApp idiom).
struct BubbleShape: InsettableShape {
  enum Tail { case leading, trailing }
  let tail: Tail
  var inset: CGFloat = 0

  func inset(by amount: CGFloat) -> BubbleShape {
    BubbleShape(tail: tail, inset: inset + amount)
  }

  func path(in rect: CGRect) -> Path {
    let r = rect.insetBy(dx: inset, dy: inset)
    let radius = Radius.xxl
    let tailRadius = Radius.sm
    // Top corners always fully rounded; the bottom corner on the speaker's side
    // squares off into the tail.
    return Path(
      roundedCornersPath: r,
      topLeft: radius, topRight: radius,
      bottomLeft: tail == .leading ? tailRadius : radius,
      bottomRight: tail == .trailing ? tailRadius : radius)
  }
}

extension Path {
  /// A rounded rectangle with independent corner radii.
  init(
    roundedCornersPath rect: CGRect,
    topLeft: CGFloat, topRight: CGFloat,
    bottomLeft: CGFloat, bottomRight: CGFloat
  ) {
    self.init()
    move(to: CGPoint(x: rect.minX + topLeft, y: rect.minY))
    addLine(to: CGPoint(x: rect.maxX - topRight, y: rect.minY))
    addArc(
      center: CGPoint(x: rect.maxX - topRight, y: rect.minY + topRight),
      radius: topRight, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
    addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - bottomRight))
    addArc(
      center: CGPoint(x: rect.maxX - bottomRight, y: rect.maxY - bottomRight),
      radius: bottomRight, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
    addLine(to: CGPoint(x: rect.minX + bottomLeft, y: rect.maxY))
    addArc(
      center: CGPoint(x: rect.minX + bottomLeft, y: rect.maxY - bottomLeft),
      radius: bottomLeft, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
    addLine(to: CGPoint(x: rect.minX, y: rect.minY + topLeft))
    addArc(
      center: CGPoint(x: rect.minX + topLeft, y: rect.minY + topLeft),
      radius: topLeft, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
    closeSubpath()
  }
}
