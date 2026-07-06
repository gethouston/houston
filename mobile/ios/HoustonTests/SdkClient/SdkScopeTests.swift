import XCTest

@testable import Houston

/// Pins `SdkScope.conversation` to the SDK's `conversationScope`
/// (`packages/sdk/src/modules/turns/vm-output.ts`): agent-qualified and
/// `encodeURIComponent`-escaped per component. A drift here silently subscribes
/// to a scope the SDK never publishes on, so the chat feed goes dead.
///
/// The expected strings are the output of Node's `encodeURIComponent` — Swift's
/// `.urlQueryAllowed` is NOT equivalent (it keeps `/`, `&`, `=`, … literal and
/// treats non-ASCII letters as allowed), so this guards the exact unreserved set
/// `A-Z a-z 0-9 - _ . ! ~ * ' ( )`.
final class SdkScopeTests: XCTestCase {
  // MARK: encodeURIComponent parity (JS-generated fixtures)

  func testEncodeURIComponentMatchesJSFixtures() {
    // Each pair is `encodeURIComponent(input)` captured from Node.
    let vectors: [(String, String)] = [
      ("Houston/My Agent", "Houston%2FMy%20Agent"),
      ("activity-42", "activity-42"),
      ("-_.!~*'()", "-_.!~*'()"),  // the full unreserved set is left literal
      ("a b/c?d&e=f#g", "a%20b%2Fc%3Fd%26e%3Df%23g"),
      ("Café/Über", "Caf%C3%A9%2F%C3%9Cber"),  // non-ASCII → UTF-8, uppercase hex
      ("100% done", "100%25%20done"),
      ("tab\tnew\nline", "tab%09new%0Aline"),
      ("x+y z", "x%2By%20z"),  // '+' is NOT unreserved (unlike a query encoder)
    ]
    for (input, expected) in vectors {
      XCTAssertEqual(
        SdkScope.encodeURIComponent(input), expected,
        "encodeURIComponent(\(input))")
    }
  }

  // MARK: agent-qualified scope

  func testConversationScopeIsAgentQualifiedAndEscaped() {
    XCTAssertEqual(
      SdkScope.conversation(agentPath: "Houston/My Agent", sessionKey: "activity-42"),
      "conversation/Houston%2FMy%20Agent/activity-42")
  }

  func testConversationScopeEscapesBothComponents() {
    // A session key with reserved characters must be escaped independently of
    // the agent segment (each `encodeURIComponent`, joined by a literal '/').
    XCTAssertEqual(
      SdkScope.conversation(agentPath: "Acme Co", sessionKey: "a/b c"),
      "conversation/Acme%20Co/a%2Fb%20c")
  }

  func testConversationScopeKeepsPrefixForSubscriptionRouting() {
    // The bridge routes conversation subscriptions by the `conversation/` prefix;
    // the qualified form must preserve it.
    XCTAssertTrue(
      SdkScope.conversation(agentPath: "ag1", sessionKey: "s1").hasPrefix("conversation/"))
  }
}
