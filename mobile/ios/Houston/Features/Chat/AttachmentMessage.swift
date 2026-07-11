import Foundation

/// The user-attachment message format, ported BYTE-FOR-BYTE from the desktop's
/// `app/src/lib/attachment-message.ts` (`withAttachmentPaths` +
/// `buildAttachmentPrompt`) and its decoder `ui/chat/src/attachment-message.ts`
/// (`decodeAttachmentMessage`). A sent message weaves two things into the plain
/// text so BOTH the model and the UI stay happy:
///   - a VISIBLE block the model reads (`[User attached these files. ...]`),
///     listing each saved workspace-relative path (`uploads/<name>`), and
///   - a leading HIDDEN html-comment marker (`<!--houston:attachments {json}-->`)
///     carrying `{ message, files:[{path,name}] }` so the chat UI can render a
///     clean summary (the typed text + file chips) instead of leaking the raw
///     path block into history.
///
/// The two surfaces MUST agree on these bytes: the desktop wrote them, the
/// engine persists them, and iOS both writes (on send) and reads (in the user
/// bubble) the same shape. There is no SDK bridge helper for this — it is
/// TS-side only — so this pure type reimplements the identical format, pinned
/// against the desktop fixtures in `AttachmentMessageTests`.
enum AttachmentMessage {
  private static let markerPrefix = "<!--houston:attachments "
  private static let markerSuffix = "-->"

  /// Weave `paths` (and their display `names`) into `text`, producing the exact
  /// string desktop's `buildAttachmentPrompt` produces. No attachments → the
  /// text is returned unchanged (mirrors `withAttachmentPaths` early return).
  /// `names[i]` pairs with `paths[i]`; a missing/blank name falls back to the
  /// path's last segment (mirrors `attachmentReferences`).
  static func encode(text: String, paths: [String], names: [String]) -> String {
    guard !paths.isEmpty else { return text }
    let list = paths.map { "- \($0)" }.joined(separator: "\n")
    let block = "[User attached these files. Read them with the Read tool if needed:\n\(list)]"
    let claudePrompt = text.isEmpty ? block : "\(text)\n\n\(block)"

    let files = paths.enumerated().map { index, path -> (path: String, name: String) in
      let raw = index < names.count ? names[index].trimmingCharacters(in: .whitespaces) : ""
      return (path, raw.isEmpty ? fileName(from: path) : raw)
    }
    let json = encodeMarkerJSON(message: text.trimmingCharacters(in: .whitespacesAndNewlines), files: files)
    return "\(markerPrefix)\(json)\(markerSuffix)\n\n\(claudePrompt)"
  }

  /// Decode a persisted user-message body: returns the user's typed text
  /// (`displayText`, marker `message`) and the attachment display `names`, or
  /// `nil` when there is no valid attachment marker (a plain message renders
  /// as-is). Mirrors `decodeAttachmentMessage` — an unparsable marker, or one
  /// with zero valid files, decodes to `nil`.
  static func decode(_ body: String) -> (displayText: String, names: [String])? {
    guard let json = markerJSON(in: body),
      let object = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any]
    else { return nil }
    let names = normalizedNames(object["files"])
    guard !names.isEmpty else { return nil }
    let message = object["message"] as? String ?? ""
    return (message, names)
  }

  // MARK: Marker parsing

  /// `^<!--houston:attachments ({...})-->\s*\n?\n?` — the leading marker, its
  /// JSON captured. Matches desktop's `MARKER_RE` (anchored at the start; the
  /// `[\s\S]*?` non-greedy body tolerates newlines inside the JSON).
  private static let markerRegex = try! NSRegularExpression(
    pattern: "^<!--houston:attachments (\\{[\\s\\S]*?\\})-->\\s*\\n?\\n?")

  private static func markerJSON(in body: String) -> String? {
    let range = NSRange(body.startIndex..<body.endIndex, in: body)
    guard let match = markerRegex.firstMatch(in: body, range: range),
      let group = Range(match.range(at: 1), in: body)
    else { return nil }
    return String(body[group])
  }

  /// Port of `normalizeAttachmentReferences`, projected to just the display
  /// names the bubble shows: keep files with a non-empty trimmed `path`; the
  /// name is the trimmed `name`, else the path's last segment.
  private static func normalizedNames(_ value: Any?) -> [String] {
    guard let items = value as? [Any] else { return [] }
    return items.compactMap { item -> String? in
      guard let record = item as? [String: Any] else { return nil }
      let path = (record["path"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
      guard !path.isEmpty else { return nil }
      let name = (record["name"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
      return name.isEmpty ? fileName(from: path) : name
    }
  }

  // MARK: JSON emission (matches `JSON.stringify` byte-for-byte)

  private static func encodeMarkerJSON(
    message: String, files: [(path: String, name: String)]
  ) -> String {
    let items = files.map { "{\"path\":\(jsonString($0.path)),\"name\":\(jsonString($0.name))}" }
    return "{\"message\":\(jsonString(message)),\"files\":[\(items.joined(separator: ","))]}"
  }

  /// A JSON string literal equal to what JavaScript's `JSON.stringify` emits:
  /// escapes `"` `\` and the C0 control chars (short escapes for the common
  /// ones, `\u00xx` otherwise); leaves `/` and non-ASCII characters verbatim.
  private static func jsonString(_ value: String) -> String {
    var out = "\""
    for scalar in value.unicodeScalars {
      switch scalar {
      case "\"": out += "\\\""
      case "\\": out += "\\\\"
      case "\u{08}": out += "\\b"
      case "\u{0C}": out += "\\f"
      case "\n": out += "\\n"
      case "\r": out += "\\r"
      case "\t": out += "\\t"
      case let s where s.value < 0x20:
        out += String(format: "\\u%04x", s.value)
      default:
        out.unicodeScalars.append(scalar)
      }
    }
    out += "\""
    return out
  }

  private static func fileName(from path: String) -> String {
    let parts = path.split(whereSeparator: { $0 == "/" || $0 == "\\" })
    return parts.last.map(String.init) ?? path
  }
}
