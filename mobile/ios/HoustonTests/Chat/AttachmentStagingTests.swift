import XCTest

@testable import Houston

/// The pure staging reducer (``AttachmentStaging``): add applies the 20 MB
/// per-file client cap and reports oversize files rather than dropping them;
/// remove drops one chip by id. No bridge, no UI.
final class AttachmentStagingTests: XCTestCase {
  private func data(_ bytes: Int) -> Data { Data(count: bytes) }

  func testAddingUnderCapAppendsWithInjectedId() {
    let id = UUID()
    let outcome = AttachmentStaging.adding([], name: "a.txt", data: data(10), id: id)
    XCTAssertEqual(outcome.staged.count, 1)
    XCTAssertEqual(outcome.staged.first?.id, id)
    XCTAssertEqual(outcome.staged.first?.name, "a.txt")
    XCTAssertTrue(outcome.rejected.isEmpty)
  }

  func testAddingAtExactCapIsAllowed() {
    let outcome = AttachmentStaging.adding([], name: "edge", data: data(AttachmentStaging.maxFileBytes))
    XCTAssertEqual(outcome.staged.count, 1, "the boundary value (== cap) is accepted")
    XCTAssertTrue(outcome.rejected.isEmpty)
  }

  func testAddingOverCapRejectsAndLeavesListUnchanged() {
    let existing = AttachmentStaging.adding([], name: "keep", data: data(1)).staged
    let outcome = AttachmentStaging.adding(
      existing, name: "huge.bin", data: data(AttachmentStaging.maxFileBytes + 1))
    XCTAssertEqual(outcome.staged.map(\.name), ["keep"], "the list is unchanged")
    XCTAssertEqual(outcome.rejected, [
      AttachmentStaging.Rejection(
        name: "huge.bin", byteCount: AttachmentStaging.maxFileBytes + 1, reason: .fileTooLarge)
    ], "the oversize file is reported by name + size + reason, never silently dropped")
  }

  func testAddingRejectsWhenBatchWouldExceedTotalCap() {
    // Two 20 MB files fit (40 MB); a third + fourth reach the 80 MB total cap.
    // A fifth 20 MB file (would be 100 MB) is rejected as `batchFull`, not
    // `fileTooLarge` — it is individually under the per-file cap.
    var list: [StagedAttachment] = []
    for i in 0..<4 {
      let outcome = AttachmentStaging.adding(list, name: "f\(i)", data: data(20 * 1024 * 1024))
      XCTAssertTrue(outcome.rejected.isEmpty, "the first four 20 MB files fit under the 80 MB cap")
      list = outcome.staged
    }
    let outcome = AttachmentStaging.adding(list, name: "over.bin", data: data(20 * 1024 * 1024))
    XCTAssertEqual(outcome.staged.count, 4, "the batch is unchanged — the fifth file did not fit")
    XCTAssertEqual(outcome.rejected.first?.reason, .batchFull,
      "a per-file-legal file that overflows the batch is rejected as batchFull, never silently added")
  }

  func testTotalCapIsUnderTheHostRequestLimit() {
    // The client aggregate cap must stay under the host's 100 MB/request limit so
    // a full staged batch never trips the server's 413.
    XCTAssertLessThan(AttachmentStaging.maxTotalBytes, 100 * 1024 * 1024)
  }

  func testAddingAccumulates() {
    var list: [StagedAttachment] = []
    list = AttachmentStaging.adding(list, name: "a", data: data(1)).staged
    list = AttachmentStaging.adding(list, name: "b", data: data(2)).staged
    XCTAssertEqual(list.map(\.name), ["a", "b"])
  }

  func testRemovingByIdDropsOnlyThatFile() {
    let a = StagedAttachment(name: "a", data: data(1))
    let b = StagedAttachment(name: "b", data: data(1))
    XCTAssertEqual(AttachmentStaging.removing([a, b], id: a.id).map(\.name), ["b"])
  }

  func testRemovingUnknownIdIsNoop() {
    let a = StagedAttachment(name: "a", data: data(1))
    XCTAssertEqual(AttachmentStaging.removing([a], id: UUID()).count, 1)
  }

  func testByteCountReflectsData() {
    XCTAssertEqual(StagedAttachment(name: "x", data: data(42)).byteCount, 42)
  }
}
