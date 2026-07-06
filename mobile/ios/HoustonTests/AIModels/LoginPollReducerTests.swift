import XCTest

@testable import Houston

/// The device-code poll state machine (landmine 2). `configured` (the credential
/// truth the merge reads) wins over a stale `login.status`, so it settles success
/// even when the runtime hasn't flipped the login status yet.
final class LoginPollReducerTests: XCTestCase {
  func testConfiguredWinsEvenWithStaleAwaitingStatus() {
    XCTAssertEqual(
      LoginPollReducer.decide(configured: true, status: .awaitingUser, error: nil),
      .succeeded)
  }

  func testCompleteStatusSucceeds() {
    XCTAssertEqual(
      LoginPollReducer.decide(configured: false, status: .complete, error: nil),
      .succeeded)
  }

  func testErrorStatusFailsWithReason() {
    XCTAssertEqual(
      LoginPollReducer.decide(configured: false, status: .error, error: "denied"),
      .failed("denied"))
  }

  func testErrorStatusFailsWithNilReason() {
    XCTAssertEqual(
      LoginPollReducer.decide(configured: false, status: .error, error: nil),
      .failed(nil))
  }

  func testStartingAndAwaitingKeepPolling() {
    XCTAssertEqual(
      LoginPollReducer.decide(configured: false, status: .starting, error: nil),
      .keepPolling)
    XCTAssertEqual(
      LoginPollReducer.decide(configured: false, status: .awaitingUser, error: nil),
      .keepPolling)
  }

  func testMissingStatusKeepsPolling() {
    XCTAssertEqual(
      LoginPollReducer.decide(configured: false, status: nil, error: nil),
      .keepPolling)
  }

  func testNilVMKeepsPolling() {
    XCTAssertEqual(LoginPollReducer.decide(nil), .keepPolling)
  }

  func testVMOverloadReadsConfiguredAndLogin() {
    let vm = ProviderVM(
      id: "anthropic", name: "Anthropic", configured: true, isActive: false,
      activeModel: "", models: [], login: LoginState(status: .awaitingUser))
    XCTAssertEqual(LoginPollReducer.decide(vm), .succeeded)
  }
}
