import CoreGraphics

/// Chat-specific geometry the desktop expresses as arbitrary Tailwind values with
/// no matching entry in the shared `HoustonRadius`/`HoustonSpacing` scales. They
/// are centralized here (documented, one source) rather than scattered as raw
/// literals across the feature — the same pattern `DesignSystem/RunningGlow`'s
/// `GlowColor` uses for brand values that fall outside the semantic token set.
///
/// Every value cites the desktop source it mirrors so the two surfaces stay in
/// lockstep. Colors and standard spacing/radii still come ONLY from `Theme` and
/// the `Spacing`/`Radius` tokens.
enum ChatMetrics {
    /// User + assistant bubble corner radius. Desktop `message.tsx:90`
    /// (`group-[.is-user]:rounded-[22px]`). No 22 token exists.
    static let bubbleRadius: CGFloat = 22

    /// The composer textarea's max height before it scrolls. Desktop
    /// `prompt-input.tsx` (`maxHeight: 208`).
    static let composerMaxHeight: CGFloat = 208

    /// The send / stop button diameter. Desktop `size-9` (36px).
    static let sendButtonSize: CGFloat = 36

    /// The ArrowUp send glyph size. Desktop `size-4` (16px).
    static let sendGlyphSize: CGFloat = 16

    /// The Stop square glyph size. Desktop `size-3.5` (14px).
    static let stopGlyphSize: CGFloat = 14

    /// The pending-turn loading helmet size. Desktop
    /// `use-chat-display-labels.tsx:55` (`HoustonLogo size={20}`).
    static let loadingHelmetSize: CGFloat = 20

    /// The process-block header helmet size. Desktop `chat-status-line.tsx:13`
    /// (`iconSize = 13`).
    static let headerHelmetSize: CGFloat = 13
}
