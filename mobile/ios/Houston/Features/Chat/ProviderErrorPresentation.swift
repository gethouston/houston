import Foundation

/// The clean card a `provider_error` feed item renders as: a title and a detail
/// line, plus optional raw output for the unclassified case (PARITY §5).
struct ProviderErrorPresentation: Equatable {
  let title: String
  let detail: String
  /// Raw provider output, shown under a "Raw output" label for `unknown`.
  var rawExcerpt: String?
}

extension ProviderError {
  /// Map this typed provider failure to its card copy, or `nil` when it must NOT
  /// render: `cancelled` is silently dropped (a Stop moves the card to Needs you,
  /// never a red error — PARITY §5), and a future `unrecognized` kind is inert
  /// (BRIDGE.md §4). Copy is the EXACT desktop `shell.json:providerError.*`.
  var presentation: ProviderErrorPresentation? {
    typealias C = Strings.Chat.ProviderErrorCopy
    switch self {
    case let .rateLimited(provider, _, retryAfterSeconds, _):
      let body =
        retryAfterSeconds.map { C.rateLimitedBody(provider: provider, seconds: $0) }
        ?? C.rateLimitedBody(provider: provider)
      return .init(title: C.rateLimitedTitle, detail: body)

    case let .quotaExhausted(provider, _, _, resetsAt, _):
      let body =
        resetsAt.map { C.quotaBody(provider: provider, resetsAt: $0) }
        ?? C.quotaBody(provider: provider)
      return .init(title: C.quotaTitle, detail: body)

    case let .usageLimitPaused(_, resetsAt, _):
      let body = resetsAt.map { C.usagePausedBody(resetsAt: $0) } ?? C.usagePausedBody
      return .init(title: C.usagePausedTitle, detail: body)

    case let .modelUnavailable(provider, model, _, _, _):
      return .init(
        title: C.modelUnavailableTitle,
        detail: C.modelUnavailableBody(model: model, provider: provider))

    case let .unauthenticated(provider, cause, _):
      return .init(
        title: C.unauthenticatedTitle(provider: provider),
        detail: Self.unauthDetail(provider: provider, cause: cause))

    case let .networkUnreachable(provider, _):
      return .init(
        title: C.networkTitle(provider: provider),
        detail: C.networkBody(provider: provider))

    case let .providerInternal(provider, _, _):
      return .init(
        title: C.providerInternalTitle(provider: provider),
        detail: C.providerInternalBody(provider: provider))

    case let .sessionResumeMissing(provider, _):
      return .init(
        title: C.sessionRestartedTitle,
        detail: C.sessionRestartedBody(provider: provider))

    case let .malformedResponse(provider, _):
      return .init(title: C.malformedTitle, detail: C.malformedBody(provider: provider))

    case let .spawnFailed(provider, _, _):
      return .init(
        title: C.spawnFailedTitle(provider: provider),
        detail: C.spawnFailedBody(provider: provider))

    case let .unknown(provider, rawExcerpt):
      return .init(
        title: C.unknownTitle, detail: C.unknownBody(provider: provider),
        rawExcerpt: rawExcerpt.isEmpty ? nil : rawExcerpt)

    // `cancelled` never renders; a future kind is inert.
    case .cancelled, .unrecognized:
      return nil
    }
  }

  private static func unauthDetail(provider: String, cause: AuthFailureCause) -> String {
    typealias C = Strings.Chat.ProviderErrorCopy
    switch cause {
    case .tokenExpired: return C.unauthTokenExpired(provider: provider)
    case .noCredentials: return C.unauthNoCredentials(provider: provider)
    case .invalidApiKey: return C.unauthInvalidApiKey(provider: provider)
    case .tokenRevoked: return C.unauthTokenRevoked(provider: provider)
    case .unknown: return C.unauthUnknown(provider: provider)
    }
  }
}
