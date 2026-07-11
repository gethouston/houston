import CoreGraphics
import XCTest

@testable import Houston

/// The pure tiling geometry + accessibility gate behind ``ChatWallpaperView``.
/// No UI — the lattice is a deterministic function of size, and the fallback is
/// a pure predicate, so both are exercised view-free.
final class ChatWallpaperTests: XCTestCase {
  private let size = CGSize(width: 390, height: 844)  // iPhone-portrait points.

  // MARK: Determinism

  func testCentersAreDeterministic() {
    // Same size → byte-identical result: seedless, no randomness, no per-frame
    // drift (the whole point of drawing once with a static Canvas).
    XCTAssertEqual(
      ChatWallpaperLayout.glyphCenters(in: size),
      ChatWallpaperLayout.glyphCenters(in: size))
  }

  func testEmptyForZeroOrNegativeSize() {
    XCTAssertTrue(ChatWallpaperLayout.glyphCenters(in: .zero).isEmpty)
    XCTAssertTrue(
      ChatWallpaperLayout.glyphCenters(in: CGSize(width: -10, height: 100)).isEmpty)
    XCTAssertTrue(
      ChatWallpaperLayout.glyphCenters(in: CGSize(width: 100, height: 0)).isEmpty)
  }

  // MARK: Count

  func testCountIsRowsTimesColumns() {
    let rows = ChatWallpaperLayout.rowCount(forHeight: size.height)
    let cols = ChatWallpaperLayout.columnCount(forWidth: size.width)
    XCTAssertEqual(ChatWallpaperLayout.glyphCenters(in: size).count, rows * cols)
  }

  func testRowAndColumnCountCoverPlusOneBleed() {
    // ceil(844/60) = 15, +1 bleed row = 16; ceil(390/72) = 6, +1 = 7.
    XCTAssertEqual(ChatWallpaperLayout.rowCount(forHeight: 844), 16)
    XCTAssertEqual(ChatWallpaperLayout.columnCount(forWidth: 390), 7)
  }

  // MARK: Lattice structure

  func testOddRowsAreOffsetHalfAColumn() {
    let cols = ChatWallpaperLayout.columnCount(forWidth: size.width)
    let centers = ChatWallpaperLayout.glyphCenters(in: size)
    let row0First = centers[0]                 // even row: no offset.
    let row1First = centers[cols]              // first glyph of the next row.
    XCTAssertEqual(row0First.x, 0, accuracy: 0.001)
    XCTAssertEqual(row1First.x, ChatWallpaperLayout.columnSpacing / 2, accuracy: 0.001)
  }

  func testEvenRowsShareTheSameXOrigin() {
    let cols = ChatWallpaperLayout.columnCount(forWidth: size.width)
    let centers = ChatWallpaperLayout.glyphCenters(in: size)
    // Row 0 and row 2 are both even → identical (unoffset) x origin.
    XCTAssertEqual(centers[0].x, centers[2 * cols].x, accuracy: 0.001)
  }

  func testRowsStepByRowSpacing() {
    let cols = ChatWallpaperLayout.columnCount(forWidth: size.width)
    let centers = ChatWallpaperLayout.glyphCenters(in: size)
    XCTAssertEqual(
      centers[cols].y - centers[0].y, ChatWallpaperLayout.rowSpacing, accuracy: 0.001)
  }

  func testColumnsStepByColumnSpacing() {
    let centers = ChatWallpaperLayout.glyphCenters(in: size)
    XCTAssertEqual(
      centers[1].x - centers[0].x, ChatWallpaperLayout.columnSpacing, accuracy: 0.001)
  }

  func testPatternBleedsPastBothEdges() {
    // A bleed row/column beyond each edge keeps the texture continuous rather
    // than clipped: some center lands at or past the width and the height.
    let centers = ChatWallpaperLayout.glyphCenters(in: size)
    XCTAssertTrue(centers.contains { $0.x >= size.width })
    XCTAssertTrue(centers.contains { $0.y >= size.height })
  }

  // MARK: Reduce-transparency gate

  func testPatternShowsWhenTransparencyAllowed() {
    XCTAssertTrue(ChatWallpaperVisibility.showsPattern(reduceTransparency: false))
  }

  func testPatternHiddenUnderReduceTransparency() {
    XCTAssertFalse(ChatWallpaperVisibility.showsPattern(reduceTransparency: true))
  }
}
