import Foundation

/// The typed `data` payloads carried by the non-string feed items. Each mirrors
/// the corresponding member of the frontend `FeedItem` union (`ui/chat/src/
/// types.ts`, PARITY §5). All decode tolerantly — unknown members are ignored.

/// Who wrote a user message in a multiplayer conversation. Set only in shared
/// conversations; a single-player bubble omits it.
struct MessageAuthor: Decodable, Equatable, Sendable {
  let userId: String
  var name: String?
}

/// Provider-agnostic token usage for one turn. `contextTokens` is the prompt
/// size of the most recent model request (how full the context window is).
struct TokenUsage: Decodable, Equatable, Sendable {
  let contextTokens: Int
  let outputTokens: Int
  let cachedTokens: Int

  private enum CodingKeys: String, CodingKey {
    case contextTokens = "context_tokens"
    case outputTokens = "output_tokens"
    case cachedTokens = "cached_tokens"
  }
}

/// A local-tool / provider-process runtime failure surfaced as a system message.
struct ToolRuntimeError: Decodable, Equatable, Sendable {
  /// `local_tool` · `provider_process` · `provider_model_unsupported`, preserved
  /// verbatim so an unknown kind still renders.
  let kind: String
  let details: String
}

/// A tool invocation chip: the tool name plus its raw input (shape is
/// tool-specific, kept as `JSONValue`).
struct ToolCall: Decodable, Equatable, Sendable {
  let name: String
  var input: JSONValue?
}

/// A tool result attached to its call chip.
struct ToolResult: Decodable, Equatable, Sendable {
  let content: String
  let isError: Bool

  private enum CodingKeys: String, CodingKey {
    case content
    case isError = "is_error"
  }
}

/// A context-compaction boundary rendered as a subtle divider.
struct ContextCompacted: Decodable, Equatable, Sendable {
  /// `native` (provider CLI compacted) or `proactive` (Houston reseed).
  let trigger: String
  var preTokens: Int?

  private enum CodingKeys: String, CodingKey {
    case trigger
    case preTokens = "pre_tokens"
  }
}

/// A provider-switch boundary rendered as a subtle divider. `provider` is the
/// provider switched TO.
struct ProviderSwitched: Decodable, Equatable, Sendable {
  let provider: String
  let summarized: Bool
  var preTokens: Int?

  private enum CodingKeys: String, CodingKey {
    case provider, summarized
    case preTokens = "pre_tokens"
  }
}

/// The set of files a turn created and modified, listed on the assistant message.
struct FileChanges: Decodable, Equatable, Sendable {
  var created: [String] = []
  var modified: [String] = []
}

/// The turn summary flushed as the "Mission log" (PARITY §5).
struct FinalResult: Decodable, Equatable, Sendable {
  let result: String
  var costUsd: Double?
  var durationMs: Double?
  var usage: TokenUsage?

  private enum CodingKeys: String, CodingKey {
    case result
    case costUsd = "cost_usd"
    case durationMs = "duration_ms"
    case usage
  }
}
