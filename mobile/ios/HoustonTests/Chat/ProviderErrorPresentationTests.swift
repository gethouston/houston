import XCTest

@testable import Houston

/// The 12 provider-error kinds → card copy (PARITY §5, shell.json:providerError.*).
/// `cancelled` and any future kind must produce NO card.
final class ProviderErrorPresentationTests: XCTestCase {
  private func error(_ object: [String: JSONValue]) throws -> ProviderError {
    try JSONValue.object(object).decode(ProviderError.self)
  }

  func testCancelledHasNoCard() throws {
    let err = try error(["kind": .string("cancelled"), "provider": .string("claude")])
    XCTAssertNil(err.presentation)
  }

  func testFutureKindIsInert() throws {
    let err = try error(["kind": .string("brand_new_kind"), "provider": .string("claude")])
    XCTAssertNil(err.presentation)  // .unrecognized → no card
  }

  func testRateLimitedWithRetrySeconds() throws {
    let err = try error([
      "kind": .string("rate_limited"), "provider": .string("Claude"),
      "retry_after_seconds": .int(7), "message": .string("x"),
    ])
    let p = try XCTUnwrap(err.presentation)
    XCTAssertEqual(p.title, "Hit a rate limit")
    XCTAssertEqual(p.detail, "The Claude API is throttling requests. Try again in 7s.")
  }

  func testRateLimitedWithoutRetryFallsBackToWaitCopy() throws {
    let err = try error(["kind": .string("rate_limited"), "provider": .string("Claude"), "message": .string("x")])
    let p = try XCTUnwrap(err.presentation)
    XCTAssertEqual(p.detail, "The Claude API is throttling requests. Wait a moment and try again.")
  }

  func testUnauthenticatedCauseSelectsBody() throws {
    let cases: [(String, String)] = [
      ("token_expired", "Your Claude session expired. Reconnect to continue."),
      ("no_credentials", "Houston needs you to sign in to Claude before it can answer."),
      ("invalid_api_key", "The Claude API key Houston has is no longer valid. Update it and try again."),
      ("token_revoked", "Your Claude access was revoked. Sign in again to continue."),
      ("mystery", "Houston could not authenticate with Claude. Reconnect and try again."),
    ]
    for (cause, expected) in cases {
      let err = try error([
        "kind": .string("unauthenticated"), "provider": .string("Claude"),
        "cause": .string(cause), "message": .string("x"),
      ])
      let p = try XCTUnwrap(err.presentation)
      XCTAssertEqual(p.title, "Sign in to Claude again")
      XCTAssertEqual(p.detail, expected, "cause \(cause)")
    }
  }

  func testUnknownCarriesRawExcerpt() throws {
    let err = try error([
      "kind": .string("unknown"), "provider": .string("Claude"),
      "raw_excerpt": .string("weird stderr"),
    ])
    let p = try XCTUnwrap(err.presentation)
    XCTAssertEqual(p.title, "Something unexpected happened")
    XCTAssertEqual(p.rawExcerpt, "weird stderr")
  }

  func testEachRenderingKindHasTitleAndDetail() throws {
    let kinds: [[String: JSONValue]] = [
      ["kind": .string("quota_exhausted"), "provider": .string("Claude"), "scope": .string("free_tier"), "message": .string("m")],
      ["kind": .string("usage_limit_paused"), "provider": .string("Claude"), "message": .string("m")],
      ["kind": .string("model_unavailable"), "provider": .string("Claude"), "model": .string("opus"), "reason": .string("deprecated"), "message": .string("m")],
      ["kind": .string("network_unreachable"), "provider": .string("Claude"), "message": .string("m")],
      ["kind": .string("provider_internal"), "provider": .string("Claude"), "message": .string("m")],
      ["kind": .string("session_resume_missing"), "provider": .string("Claude"), "session_id": .string("s")],
      ["kind": .string("malformed_response"), "provider": .string("Claude"), "message": .string("m")],
      ["kind": .string("spawn_failed"), "provider": .string("Claude"), "cli_name": .string("claude"), "message": .string("m")],
    ]
    for object in kinds {
      let p = try XCTUnwrap(try error(object).presentation, "kind \(object["kind"]!)")
      XCTAssertFalse(p.title.isEmpty)
      XCTAssertFalse(p.detail.isEmpty)
    }
  }
}
