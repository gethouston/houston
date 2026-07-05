import Foundation

/// Typed provider/auth/model failure for a turn, carried on a `provider_error`
/// feed item. Mirrors the frontend `ProviderError` union (`ui/chat/src/types.ts`)
/// — the 12 kinds PARITY §5 enumerates — so a surface renders the matching inline
/// card. An unrecognized `kind` is preserved as ``unrecognized`` (never dropped),
/// keeping the decode additive-safe (BRIDGE.md §4). `kind: "cancelled"` is
/// present here but PARITY §5 drops it from the UI — that is the surface's call.
enum ProviderError: Decodable, Equatable, Sendable {
  case rateLimited(provider: String, model: String?, retryAfterSeconds: Int?, message: String)
  case quotaExhausted(
    provider: String, model: String?, scope: QuotaScope, resetsAt: String?, message: String)
  case usageLimitPaused(provider: String, resetsAt: String?, message: String)
  case modelUnavailable(
    provider: String, model: String, reason: ModelUnavailableReason,
    suggestedFallback: String?, message: String)
  case unauthenticated(provider: String, cause: AuthFailureCause, message: String)
  case networkUnreachable(provider: String, message: String)
  case providerInternal(provider: String, httpStatus: Int?, message: String)
  case sessionResumeMissing(provider: String, sessionId: String)
  case malformedResponse(provider: String, message: String)
  case spawnFailed(provider: String, cliName: String, message: String)
  case cancelled(provider: String)
  case unknown(provider: String, rawExcerpt: String)
  /// A future `kind` this host does not model yet; the whole payload is kept.
  case unrecognized(kind: String, raw: JSONValue)

  /// Decode from a single ``JSONValue`` view of the object — one container only,
  /// so reading `kind` and then preserving the whole payload for `.unrecognized`
  /// never trips `JSONDecoder`'s single-container-per-decoder rule.
  init(from decoder: Decoder) throws {
    let raw = try JSONValue(from: decoder)
    let kind = raw["kind"]?.stringValue ?? ""
    let provider = raw["provider"]?.stringValue ?? ""
    let message = raw["message"]?.stringValue ?? ""
    switch kind {
    case "rate_limited":
      self = .rateLimited(
        provider: provider, model: raw["model"]?.stringValue,
        retryAfterSeconds: raw["retry_after_seconds"]?.intValue, message: message)
    case "quota_exhausted":
      self = .quotaExhausted(
        provider: provider, model: raw["model"]?.stringValue,
        scope: QuotaScope(raw: raw["scope"]?.stringValue),
        resetsAt: raw["resets_at"]?.stringValue, message: message)
    case "usage_limit_paused":
      self = .usageLimitPaused(
        provider: provider, resetsAt: raw["resets_at"]?.stringValue, message: message)
    case "model_unavailable":
      self = .modelUnavailable(
        provider: provider, model: raw["model"]?.stringValue ?? "",
        reason: ModelUnavailableReason(raw: raw["reason"]?.stringValue),
        suggestedFallback: raw["suggested_fallback"]?.stringValue, message: message)
    case "unauthenticated":
      self = .unauthenticated(
        provider: provider, cause: AuthFailureCause(raw: raw["cause"]?.stringValue),
        message: message)
    case "network_unreachable":
      self = .networkUnreachable(provider: provider, message: message)
    case "provider_internal":
      self = .providerInternal(
        provider: provider, httpStatus: raw["http_status"]?.intValue, message: message)
    case "session_resume_missing":
      self = .sessionResumeMissing(provider: provider, sessionId: raw["session_id"]?.stringValue ?? "")
    case "malformed_response":
      self = .malformedResponse(provider: provider, message: message)
    case "spawn_failed":
      self = .spawnFailed(provider: provider, cliName: raw["cli_name"]?.stringValue ?? "", message: message)
    case "cancelled":
      self = .cancelled(provider: provider)
    case "unknown":
      self = .unknown(provider: provider, rawExcerpt: raw["raw_excerpt"]?.stringValue ?? "")
    default:
      self = .unrecognized(kind: kind, raw: raw)
    }
  }
}

/// Tolerant string enum: a known case or `unknown` for an unrecognized value.
enum QuotaScope: String, Sendable, Equatable {
  case freeTier = "free_tier"
  case paidPlan = "paid_plan"
  case organization
  case unknown
  init(raw: String?) { self = QuotaScope(rawValue: raw ?? "") ?? .unknown }
}

/// Tolerant string enum; unrecognized reasons collapse to `unknown`.
enum ModelUnavailableReason: String, Sendable, Equatable {
  case previewGated = "preview_gated"
  case deprecated
  case regionRestricted = "region_restricted"
  case unknown
  init(raw: String?) { self = ModelUnavailableReason(rawValue: raw ?? "") ?? .unknown }
}

/// Tolerant string enum; unrecognized causes collapse to `unknown`.
enum AuthFailureCause: String, Sendable, Equatable {
  case noCredentials = "no_credentials"
  case tokenExpired = "token_expired"
  case tokenRevoked = "token_revoked"
  case invalidApiKey = "invalid_api_key"
  case unknown
  init(raw: String?) { self = AuthFailureCause(rawValue: raw ?? "") ?? .unknown }
}
