import Foundation

/// The `{ level, message, fields? }` body of a `log` diagnostic frame
/// (BRIDGE.md §9.3): a one-way SDK to host line the host routes to its native
/// log. Decoding is forward-compatible like the rest of the wire (BRIDGE.md §4):
/// an absent `level`/`message`, an unknown `level` string, or extra keys never
/// fail, so a newer SDK never has a diagnostic silently dropped.
struct SdkLogPayload: Equatable {
  /// SDK severity: `debug` | `info` | `warn` | `error` today. An unrecognized
  /// value is preserved here and maps to `info` at dispatch, never dropped.
  var level: String
  /// The human-readable diagnostic text.
  var message: String
  /// Optional structured context the SDK attached to the line.
  var fields: JSONValue?
}

extension SdkLogPayload: Codable {
  private enum CodingKeys: String, CodingKey { case level, message, fields }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    level = try c.decodeIfPresent(String.self, forKey: .level) ?? "info"
    message = try c.decodeIfPresent(String.self, forKey: .message) ?? ""
    fields = try c.decodeIfPresent(JSONValue.self, forKey: .fields)
  }

  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(level, forKey: .level)
    try c.encode(message, forKey: .message)
    try c.encodeIfPresent(fields, forKey: .fields)
  }
}
