import XCTest

@testable import Houston

/// Pins the composer-attachment copy that is assembled from a COUNT rather than a
/// name list — the photo read-failure line, which must pluralize grammatically
/// instead of leaking a "N photo(s)" placeholder.
final class AttachmentComposerStringsTests: XCTestCase {
  func testReadFailedPhotosSingular() {
    XCTAssertEqual(
      Strings.Chat.Attachments.readFailedPhotos(1),
      "Could not read 1 photo. Try attaching it again.")
  }

  func testReadFailedPhotosPlural() {
    XCTAssertEqual(
      Strings.Chat.Attachments.readFailedPhotos(3),
      "Could not read 3 photos. Try attaching them again.",
      "a plural count reads grammatically, never '3 photo(s)' with a singular 'it'")
  }
}
