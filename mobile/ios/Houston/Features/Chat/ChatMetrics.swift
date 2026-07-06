import CoreGraphics

/// Chat-specific geometry the desktop expresses as arbitrary Tailwind values with
/// no matching entry in the shared `HoustonRadius`/`HoustonSpacing` scales. They
/// are centralized here (documented, one source) rather than scattered as raw
/// literals across the feature — the same pattern `DesignSystem/RunningGlow`'s
/// `GlowColor` uses for brand values that fall outside the semantic token set.
///
/// The desktop-mirroring values cite the desktop source so the two surfaces stay
/// in lockstep; the input-bar section is deliberately mobile-messaging (WhatsApp /
/// Telegram), with no desktop equivalent. Colors and standard spacing/radii still
/// come ONLY from `Theme` and the `Spacing`/`Radius` tokens.
enum ChatMetrics {
    /// User + assistant bubble corner radius. Desktop `message.tsx:90`
    /// (`group-[.is-user]:rounded-[22px]`). No 22 token exists.
    static let bubbleRadius: CGFloat = 22

    // MARK: Input bar (mobile-messaging, WhatsApp / Telegram — NOT desktop parity)

    /// The input bar's horizontal / vertical content insets around the field.
    static let inputBarHInset: CGFloat = 10
    static let inputBarVInset: CGFloat = 7
    /// The bar's top hairline separator weight (sub-point, iOS renders it crisp).
    static let inputBarHairline: CGFloat = 0.5

    /// The rounded input field's inner insets.
    static let inputFieldHInset: CGFloat = 16
    static let inputFieldVInset: CGFloat = 9
    /// The input field corner radius. Generous so the field reads as a pill:
    /// SwiftUI clamps a corner to half the height, so on one line this is a full
    /// capsule and once the text wraps it stays strongly rounded (WhatsApp feel).
    static let inputFieldRadius: CGFloat = 26
    /// Max visible lines before the field scrolls internally.
    static let inputFieldMaxLines = 5

    /// The leading "+" (attachment) button tap-target and glyph size — the
    /// WhatsApp / Telegram left affordance. A plain glyph, no filled circle.
    static let plusButtonSize: CGFloat = 34
    static let plusGlyphSize: CGFloat = 24

    /// The circular send / stop button diameter and glyph size.
    static let sendButtonSize: CGFloat = 34
    static let sendGlyphSize: CGFloat = 16
    /// The idle (empty-field) send button's scale + opacity, from which it springs
    /// to full when text appears.
    static let sendIdleScale: CGFloat = 0.8
    static let sendIdleOpacity: CGFloat = 0.5

    /// The pending-turn loading helmet size. Desktop
    /// `use-chat-display-labels.tsx:55` (`HoustonLogo size={20}`).
    static let loadingHelmetSize: CGFloat = 20

    /// The process-block header helmet size. Desktop `chat-status-line.tsx:13`
    /// (`iconSize = 13`).
    static let headerHelmetSize: CGFloat = 13
}
