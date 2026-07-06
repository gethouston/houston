import XCTest

@testable import Houston

/// The native markdown block parser (PARITY §3). Verifies the `presentationIntent`
/// walk classifies paragraphs, headings, lists, blockquotes, fenced code, and
/// thematic breaks, and preserves inline bold + links.
final class MarkdownBlockParserTests: XCTestCase {
  func testPlainParagraph() {
    let blocks = MarkdownBlockParser.parse("Just a line of prose.")
    XCTAssertEqual(blocks.count, 1)
    guard case let .paragraph(content) = blocks[0] else { return XCTFail("expected paragraph") }
    XCTAssertEqual(String(content.characters), "Just a line of prose.")
  }

  func testBoldInParagraphAndUnorderedList() {
    let md = "Some **bold** text.\n\n- first\n- second"
    let blocks = MarkdownBlockParser.parse(md)
    guard case let .paragraph(para) = blocks.first else { return XCTFail("expected paragraph first") }
    // The bold run carries the inline strong intent.
    let hasBold = para.runs.contains { $0.inlinePresentationIntent?.contains(.stronglyEmphasized) == true }
    XCTAssertTrue(hasBold, "bold run preserved")

    let items = blocks.filter { if case .listItem = $0 { return true }; return false }
    XCTAssertEqual(items.count, 2, "two unordered list items")
    guard case let .listItem(ordered, _, _, first) = items[0] else { return XCTFail("expected list item") }
    XCTAssertFalse(ordered)
    XCTAssertEqual(String(first.characters), "first")
  }

  func testOrderedListOrdinals() {
    let blocks = MarkdownBlockParser.parse("1. one\n2. two")
    let items = blocks.compactMap { block -> Int? in
      if case let .listItem(true, ordinal, _, _) = block { return ordinal }
      return nil
    }
    XCTAssertEqual(items, [1, 2], "ordered list preserves ordinals")
  }

  func testFencedCodeBlockKeepsRawTextNoInline() {
    let md = "```swift\nlet x = **1**\n```"
    let blocks = MarkdownBlockParser.parse(md)
    guard case let .codeBlock(language, code) = blocks.first else {
      return XCTFail("expected code block")
    }
    XCTAssertEqual(language, "swift")
    XCTAssertEqual(code, "let x = **1**", "code is verbatim — inline markdown NOT interpreted")
  }

  func testHeadingAndLink() {
    let md = "# Title\n\nSee [the docs](https://example.com) now."
    let blocks = MarkdownBlockParser.parse(md)
    guard case let .heading(level, title) = blocks.first else { return XCTFail("expected heading") }
    XCTAssertEqual(level, 1)
    XCTAssertEqual(String(title.characters), "Title")

    guard case let .paragraph(para) = blocks.last else { return XCTFail("expected paragraph") }
    let link = para.runs.compactMap(\.link).first
    XCTAssertEqual(link, URL(string: "https://example.com"), "link URL preserved")
  }

  func testBlockquoteAndThematicBreak() {
    let blocks = MarkdownBlockParser.parse("> quoted\n\n---")
    XCTAssertTrue(blocks.contains { if case .blockquote = $0 { return true }; return false })
    XCTAssertTrue(blocks.contains { if case .thematicBreak = $0 { return true }; return false })
  }
}
