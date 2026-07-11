import XCTest

@testable import Houston

/// Byte-parity tests for ``AttachmentMessage``, pinned against the desktop
/// source it ports: `app/src/lib/attachment-message.ts` (`buildAttachmentPrompt`
/// / `withAttachmentPaths`) and its decoder `ui/chat/src/attachment-message.ts`
/// (`decodeAttachmentMessage` / `normalizeAttachmentReferences`). The fixtures
/// mirror `app/src/lib/attachment-message.test.mjs` — the visible model-facing
/// path block, the hidden `<!--houston:attachments {json}-->` marker, and the
/// `JSON.stringify` key order (`{message,files:[{path,name}]}`) must match to the
/// byte, because the engine persists what iOS writes and iOS reads what desktop
/// wrote.
final class AttachmentMessageTests: XCTestCase {
  // MARK: encode

  /// The canonical fixture from `attachment-message.test.mjs`: marker + hidden
  /// path block, byte-for-byte.
  func testEncodeProducesMarkerAndPathBlock() {
    let out = AttachmentMessage.encode(
      text: "Summarize this",
      paths: ["/Users/ja/.houston/cache/attachments/brief.pdf"],
      names: ["brief.pdf"])
    let expected =
      "<!--houston:attachments {\"message\":\"Summarize this\","
      + "\"files\":[{\"path\":\"/Users/ja/.houston/cache/attachments/brief.pdf\","
      + "\"name\":\"brief.pdf\"}]}-->\n\n"
      + "Summarize this\n\n"
      + "[User attached these files. Read them with the Read tool if needed:\n"
      + "- /Users/ja/.houston/cache/attachments/brief.pdf]"
    XCTAssertEqual(out, expected)
  }

  /// No text → the visible block stands alone (mirrors `withAttachmentPaths`'s
  /// empty-text branch), and multiple paths list in order. A blank name falls
  /// back to the path's last segment (`attachmentReferences` /
  /// `normalizeAttachmentReferences`).
  func testEncodeEmptyTextMultiPathAndNameFallback() {
    let out = AttachmentMessage.encode(
      text: "", paths: ["/tmp/a.txt", "/tmp/b.csv"], names: ["", "custom"])
    let expected =
      "<!--houston:attachments {\"message\":\"\",\"files\":["
      + "{\"path\":\"/tmp/a.txt\",\"name\":\"a.txt\"},"
      + "{\"path\":\"/tmp/b.csv\",\"name\":\"custom\"}]}-->\n\n"
      + "[User attached these files. Read them with the Read tool if needed:\n"
      + "- /tmp/a.txt\n- /tmp/b.csv]"
    XCTAssertEqual(out, expected)
  }

  /// No paths → the text is returned unchanged (mirrors `withAttachmentPaths`'s
  /// early return; no marker is emitted).
  func testEncodeNoAttachmentsReturnsTextUnchanged() {
    XCTAssertEqual(AttachmentMessage.encode(text: "hi", paths: [], names: []), "hi")
    XCTAssertEqual(AttachmentMessage.encode(text: "", paths: [], names: []), "")
  }

  /// The marker `message` is the TRIMMED text, while the visible block keeps the
  /// raw text verbatim (desktop: `payload.message = userText.trim()`, block uses
  /// the untrimmed `text`).
  func testEncodeTrimsMarkerMessageButKeepsRawVisibleText() {
    let out = AttachmentMessage.encode(text: "  hey  ", paths: ["/p/x"], names: ["x"])
    XCTAssertTrue(
      out.hasPrefix("<!--houston:attachments {\"message\":\"hey\","),
      "marker message is trimmed")
    XCTAssertTrue(out.contains("-->\n\n  hey  \n\n["), "visible block keeps the raw text")
    let decoded = AttachmentMessage.decode(out)
    XCTAssertEqual(decoded?.displayText, "hey")
  }

  /// A `"` / `\` / control char in a name is JSON-escaped exactly as
  /// `JSON.stringify` would.
  func testEncodeEscapesJSONSpecials() {
    let out = AttachmentMessage.encode(
      text: "", paths: ["/p/q"], names: ["a\"b\\c\td"])
    XCTAssertTrue(out.contains("\"name\":\"a\\\"b\\\\c\\td\""))
  }

  // MARK: decode

  func testDecodeRoundTripsEncode() {
    let encoded = AttachmentMessage.encode(
      text: "Summarize this",
      paths: ["/Users/ja/.houston/cache/attachments/brief.pdf"],
      names: ["brief.pdf"])
    let decoded = AttachmentMessage.decode(encoded)
    XCTAssertEqual(decoded?.displayText, "Summarize this")
    XCTAssertEqual(decoded?.names, ["brief.pdf"])
  }

  func testDecodePlainMessageIsNil() {
    XCTAssertNil(AttachmentMessage.decode("just a normal message"))
    XCTAssertNil(AttachmentMessage.decode(""))
  }

  /// Zero valid files → `nil` (mirrors `decodeAttachmentMessage`'s
  /// `files.length === 0` guard), so a bogus marker renders as plain text.
  func testDecodeEmptyFilesIsNil() {
    let body = "<!--houston:attachments {\"message\":\"hi\",\"files\":[]}-->\n\nhi"
    XCTAssertNil(AttachmentMessage.decode(body))
  }

  /// A file with a path but no name decodes to the path's last segment.
  func testDecodeNameFallbackFromPath() {
    let body = "<!--houston:attachments {\"files\":[{\"path\":\"/x/y/z.pdf\"}]}-->\n\nz"
    let decoded = AttachmentMessage.decode(body)
    XCTAssertEqual(decoded?.names, ["z.pdf"])
    XCTAssertEqual(decoded?.displayText, "", "absent message decodes to empty string")
  }

  /// A file whose path is blank is dropped (mirrors `normalizeAttachmentReferences`).
  func testDecodeDropsBlankPathFile() {
    let body =
      "<!--houston:attachments {\"files\":[{\"path\":\"  \",\"name\":\"x\"},"
      + "{\"path\":\"/ok/a.txt\"}]}-->\n\nx"
    XCTAssertEqual(AttachmentMessage.decode(body)?.names, ["a.txt"])
  }

  func testDecodeMalformedJSONIsNil() {
    XCTAssertNil(AttachmentMessage.decode("<!--houston:attachments {not json}-->\n\nhi"))
  }

  /// The marker must be anchored at the start — a marker mid-body is not a
  /// decodable attachment message (desktop `MARKER_RE` is `^`-anchored).
  func testDecodeUnanchoredMarkerIsNil() {
    let body = "prefix <!--houston:attachments {\"files\":[{\"path\":\"/a\"}]}-->"
    XCTAssertNil(AttachmentMessage.decode(body))
  }
}
