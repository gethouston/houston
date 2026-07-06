import Foundation

/// A toolkit slug resolved to real display info — a human name, an optional
/// remote logo URL, a description, and the initial-letter fallback the logo view
/// draws when the image is absent or slow (PARITY-SETTINGS §7: toolkit logos are
/// REMOTE, unlike the inline-SVG provider logos). Slug fallbacks fill any gap so
/// the UI shows a real name, never a machine slug.
struct AppDisplay: Equatable {
  let toolkit: String
  let name: String
  let description: String
  let logoURL: URL?

  /// The single uppercase letter drawn in the logo fallback tile.
  var initial: String {
    guard let first = name.first(where: { $0.isLetter || $0.isNumber }) ?? name.first
    else { return "?" }
    return String(first).uppercased()
  }

  static func resolve(slug: String, toolkit: IntegrationToolkit?) -> AppDisplay {
    AppDisplay(
      toolkit: slug,
      name: toolkit?.name ?? slug,
      description: toolkit?.description ?? "",
      logoURL: (toolkit?.logoUrl).flatMap(URL.init(string:)))
  }
}
