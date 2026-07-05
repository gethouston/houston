import Foundation

/// The typed projection of a ``FeedItemVM``: the feed catalog PARITY §5
/// enumerates, as an enum with associated values plus a tolerant ``unknown``
/// case for any `feed_type` this host does not model (BRIDGE.md §4).
///
/// Streaming and final variants collapse to one case with a `streaming` flag,
/// because the SDK folds them into ONE feed entry in place (`vm-output.ts`):
/// `assistant_text_streaming` carries the cumulative text and its final
/// `assistant_text` finalizes the same bubble.
///
/// The projection is intentionally non-throwing: a malformed known payload also
/// falls back to ``unknown`` (with the raw `data` preserved) so one bad frame
/// never breaks the whole feed. Structural decode of the enclosing
/// ``ConversationVM`` stays robust; this is where the per-item tolerance lives.
enum FeedItem: Equatable, Sendable {
  case assistantText(String, streaming: Bool)
  case thinking(String, streaming: Bool)
  case userMessage(String, author: MessageAuthor?)
  case toolCall(ToolCall)
  case toolResult(ToolResult)
  case toolRuntimeError(ToolRuntimeError)
  case providerError(ProviderError)
  case systemMessage(String)
  case contextCompacted(ContextCompacted)
  case providerSwitched(ProviderSwitched)
  case fileChanges(FileChanges)
  case finalResult(FinalResult)
  /// A `feed_type` this host does not model, or a known type whose payload
  /// failed to decode. The raw `data` is preserved for debugging/rendering.
  case unknown(type: String, data: JSONValue)
}

extension FeedItemVM {
  /// The typed, tolerant projection of this raw feed entry.
  var item: FeedItem {
    switch feedType {
    case "assistant_text":
      return .assistantText(data.stringValue ?? "", streaming: false)
    case "assistant_text_streaming":
      return .assistantText(data.stringValue ?? "", streaming: true)
    case "thinking":
      return .thinking(data.stringValue ?? "", streaming: false)
    case "thinking_streaming":
      return .thinking(data.stringValue ?? "", streaming: true)
    case "user_message":
      return .userMessage(data.stringValue ?? "", author: FeedItemVM.author(of: data))
    case "tool_call":
      return decode { .toolCall($0) }
    case "tool_result":
      return decode { .toolResult($0) }
    case "tool_runtime_error":
      return decode { .toolRuntimeError($0) }
    case "provider_error":
      return decode { .providerError($0) }
    case "system_message":
      return .systemMessage(data.stringValue ?? "")
    case "context_compacted":
      return decode { .contextCompacted($0) }
    case "provider_switched":
      return decode { .providerSwitched($0) }
    case "file_changes":
      return decode { .fileChanges($0) }
    case "final_result":
      return decode { .finalResult($0) }
    default:
      return .unknown(type: feedType, data: data)
    }
  }

  /// Decode `data` as `T` and wrap it; fall back to `.unknown` (preserving the
  /// raw payload) if the known payload does not decode.
  private func decode<T: Decodable>(_ wrap: (T) -> FeedItem) -> FeedItem {
    guard let value = try? data.decode(T.self) else {
      return .unknown(type: feedType, data: data)
    }
    return wrap(value)
  }

  /// The optional `author` sidecar on a `user_message` (multiplayer only).
  private static func author(of data: JSONValue) -> MessageAuthor? {
    guard let raw = data["author"] else { return nil }
    return try? raw.decode(MessageAuthor.self)
  }
}
