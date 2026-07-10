import SwiftUI

/// Lays out a user bubble's text with its timestamp bottom-right (WhatsApp
/// convention). Exactly two subviews, in order: `[text, time]`.
///
/// The time reserves a trailing gap on the text's last line: when the text
/// block is narrow enough to leave room, the time sits inline at the bottom
/// right; when the block is too full (its widest line would collide with the
/// reserved strip), the time drops onto its own line at the bottom right. The
/// two never overlap.
///
/// Inline-fit is decided by a width probe: re-measure the text with the trailing
/// strip removed — if that does not force an extra line, the block already
/// leaves room for the time, so it fits inline. This is deliberately keyed off
/// the block's widest line (not strictly the last line), which stays robust and
/// never collides; a full block just sends the time to its own line.
struct TimedBubbleLayout: Layout {
  /// Horizontal gap between the text and the trailing time (inline case).
  var hSpacing: CGFloat = Spacing.space6
  /// Vertical gap above the time when it wraps to its own line.
  var vSpacing: CGFloat = Spacing.space2

  struct Cache {
    var inline = true
    var textSize: CGSize = .zero
    var timeSize: CGSize = .zero
    var size: CGSize = .zero
  }

  func makeCache(subviews: Subviews) -> Cache { Cache() }

  func sizeThatFits(
    proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache
  ) -> CGSize {
    guard subviews.count == 2 else {
      cache.size = subviews.first?.sizeThatFits(proposal) ?? .zero
      return cache.size
    }
    let maxW = proposal.replacingUnspecifiedDimensions(
      by: CGSize(width: CGFloat.infinity, height: 0)
    ).width

    let time = subviews[1].sizeThatFits(.unspecified)
    let text = subviews[0].sizeThatFits(ProposedViewSize(width: maxW, height: nil))
    let reservedW = max(0, maxW - time.width - hSpacing)
    let reserved = subviews[0].sizeThatFits(ProposedViewSize(width: reservedW, height: nil))

    let plan = TimedBubbleGeometry.resolve(
      maxWidth: maxW, text: text, reservedText: reserved, time: time,
      hSpacing: hSpacing, vSpacing: vSpacing)
    cache.timeSize = time
    cache.textSize = text
    cache.inline = plan.inline
    cache.size = plan.size
    return plan.size
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache
  ) {
    guard subviews.count == 2 else {
      subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: proposal)
      return
    }
    let text = cache.textSize
    let time = cache.timeSize

    subviews[0].place(
      at: CGPoint(x: bounds.minX, y: bounds.minY),
      anchor: .topLeading,
      proposal: ProposedViewSize(text))

    let timeY = cache.inline ? bounds.minY + text.height : bounds.maxY
    subviews[1].place(
      at: CGPoint(x: bounds.maxX, y: timeY),
      anchor: .bottomTrailing,
      proposal: ProposedViewSize(time))
  }
}

/// The pure geometry behind ``TimedBubbleLayout`` — inline-vs-own-line decision
/// and the resulting block size — split out so it is unit-testable without a
/// live view hierarchy. All inputs are measured subview sizes; no `View` needed.
enum TimedBubbleGeometry {
  struct Plan: Equatable {
    /// True when the time sits on the text's last line; false when it drops to
    /// its own line below.
    let inline: Bool
    /// Total block size the layout reports.
    let size: CGSize
  }

  /// - Parameters:
  ///   - maxWidth: the width the parent proposes (`.infinity` when unbounded).
  ///   - text: the text measured at `maxWidth`.
  ///   - reservedText: the text re-measured with the time's trailing strip
  ///     removed (`maxWidth - time.width - hSpacing`).
  ///   - time: the time label measured unbounded.
  static func resolve(
    maxWidth: CGFloat, text: CGSize, reservedText: CGSize, time: CGSize,
    hSpacing: CGFloat, vSpacing: CGFloat
  ) -> Plan {
    // Reserving the strip did not force an extra line ⇒ the block already leaves
    // room for the time, so it fits inline. An unbounded width always fits.
    let inline = !maxWidth.isFinite || reservedText.height <= text.height
    if inline {
      return Plan(
        inline: true,
        size: CGSize(
          width: min(maxWidth, text.width + hSpacing + time.width),
          height: max(text.height, time.height)))
    }
    return Plan(
      inline: false,
      size: CGSize(
        width: min(maxWidth, max(text.width, time.width)),
        height: text.height + vSpacing + time.height))
  }
}
