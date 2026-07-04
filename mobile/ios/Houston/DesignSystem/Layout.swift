import SwiftUI

/// Spacing scale — a thin, lossless alias over the generated `HoustonSpacing`
/// tokens so features read `Spacing.space16` instead of reaching for a literal.
/// The full token scale (2…64) is available; every gap/pad in a feature must
/// come from here.
typealias Spacing = HoustonSpacing

/// Corner-radius scale — alias over the generated `HoustonRadius` tokens
/// (`sm`…`full`, plus the composer radius). No literal corner radii in features.
typealias Radius = HoustonRadius

/// Motion durations, aliased from `HoustonDuration` (seconds).
typealias Motion = HoustonDuration
