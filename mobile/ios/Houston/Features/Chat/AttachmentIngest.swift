import Foundation
import PhotosUI
import SwiftUI

/// Reads picked files + photos into staged bytes for the composer. Kept off the
/// view so the security-scoped file read and the async photo transfer are one
/// documented place. Failures are RETURNED (never swallowed): the caller
/// surfaces them as an alert (no silent loss).
enum AttachmentIngest {
  /// Read document-picker URLs off disk under a security-scoped grant. Returns
  /// the bytes read plus the names of any that failed. `async` and
  /// actor-independent so the synchronous `Data(contentsOf:)` (which can force a
  /// multi-second iCloud/provider download) runs OFF the main thread — the
  /// caller wraps it in a `Task` exactly like the photo path, so the picker
  /// completion never blocks the UI (or trips the iOS watchdog).
  static func read(
    urls: [URL]
  ) async -> (files: [(name: String, data: Data)], failed: [String]) {
    var files: [(name: String, data: Data)] = []
    var failed: [String] = []
    for url in urls {
      let scoped = url.startAccessingSecurityScopedResource()
      defer { if scoped { url.stopAccessingSecurityScopedResource() } }
      if let data = try? Data(contentsOf: url) {
        files.append((name: url.lastPathComponent, data: data))
      } else {
        failed.append(url.lastPathComponent)
      }
    }
    return (files, failed)
  }

  /// Load the raw bytes for each picked photo. Returns the bytes plus a count of
  /// photos that failed to transfer.
  static func load(
    _ items: [PhotosPickerItem]
  ) async -> (files: [(name: String, data: Data)], failed: Int) {
    var files: [(name: String, data: Data)] = []
    var failed = 0
    for item in items {
      if let data = try? await item.loadTransferable(type: Data.self) {
        files.append((name: photoName(for: item), data: data))
      } else {
        failed += 1
      }
    }
    return (files, failed)
  }

  /// Synthesize a stable file name for a photo (the picker exposes no name):
  /// `photo-<short id>.<ext>`, extension from the item's content type.
  private static func photoName(for item: PhotosPickerItem) -> String {
    let ext = item.supportedContentTypes.first?.preferredFilenameExtension ?? "jpg"
    return "photo-\(UUID().uuidString.prefix(8)).\(ext)"
  }
}
