import XCTest

@testable import Houston

/// The process-block header + tool-row copy (PARITY §4/§5): mirrors desktop
/// `chat-process-header.ts`, `tool-labels.ts`, and `tool-formatters.tsx`.
final class ProcessBlockTests: XCTestCase {
  private func tool(_ name: String, _ input: JSONValue? = nil) -> ProcessItem {
    .tool(id: name, call: ToolCall(name: name, input: input), result: nil)
  }

  // MARK: header label

  func testActiveHeaderBeforeAnyTool() {
    let group = ProcessGroup(id: "g", items: [.reasoning(id: "r", text: "plan", streaming: true)], active: true)
    XCTAssertEqual(ProcessHeader.label(for: group), "Mission in progress...")
  }

  func testActiveHeaderUsesPresentTenseVerbOfLatestTool() {
    let group = ProcessGroup(id: "g", items: [tool("Read"), tool("Bash")], active: true)
    XCTAssertEqual(ProcessHeader.label(for: group), "Mission in progress: Running command")
  }

  func testSettledHeaderIsMissionLog() {
    let group = ProcessGroup(id: "g", items: [tool("Read")], active: false)
    XCTAssertEqual(ProcessHeader.label(for: group), "Mission log")
  }

  // MARK: tool verbs + symbols

  func testToolVerbTense() {
    XCTAssertEqual(ToolLabel.action("Edit", done: false), "Editing file")
    XCTAssertEqual(ToolLabel.action("Edit", done: true), "Edited file")
  }

  func testUnknownToolFallsBackToDeUnderscoredName() {
    XCTAssertEqual(ToolLabel.action("my_custom_tool", done: false), "my custom tool")
  }

  func testMcpPrefixStripped() {
    XCTAssertEqual(ToolLabel.shortName("server__Read"), "Read")
    XCTAssertEqual(ToolLabel.symbol("server__Bash"), "terminal")
  }

  func testToolSymbols() {
    XCTAssertEqual(ToolLabel.symbol("Read"), "doc.text")
    XCTAssertEqual(ToolLabel.symbol("Write"), "doc.badge.plus")
    XCTAssertEqual(ToolLabel.symbol("Grep"), "magnifyingglass")
    XCTAssertEqual(ToolLabel.symbol("Totally_New"), "wrench.and.screwdriver")
  }

  // MARK: tool detail

  func testBashDetailIsCommand() {
    let detail = ToolDetail.string(name: "Bash", input: .object(["command": .string("ls -la")]))
    XCTAssertEqual(detail, "ls -la")
  }

  func testReadDetailIsShortPath() {
    let detail = ToolDetail.string(
      name: "Read", input: .object(["file_path": .string("/a/b/c/file.txt")]))
    XCTAssertEqual(detail, "c/file.txt", "last two path segments")
  }

  func testWebFetchDetailIsHost() {
    let detail = ToolDetail.string(
      name: "WebFetch", input: .object(["url": .string("https://docs.example.com/page")]))
    XCTAssertEqual(detail, "docs.example.com")
  }

  func testUnknownToolHasNoDetail() {
    XCTAssertNil(ToolDetail.string(name: "Mystery", input: .object(["x": .string("y")])))
  }
}
