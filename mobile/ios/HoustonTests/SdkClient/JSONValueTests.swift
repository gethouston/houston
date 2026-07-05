import XCTest

@testable import Houston

/// `JSONValue` is the loss-preserving escape hatch under every open bridge field.
/// These pin its round-trip fidelity and typed re-projection.
final class JSONValueTests: XCTestCase {
  private func roundTrip(_ json: String) throws -> JSONValue {
    let value = try JSONDecoder().decode(JSONValue.self, from: Data(json.utf8))
    let data = try JSONEncoder().encode(value)
    return try JSONDecoder().decode(JSONValue.self, from: data)
  }

  func testRoundTripsEveryKind() throws {
    let json = #"{"a":null,"b":true,"c":42,"d":3.5,"e":"hi","f":[1,2,3],"g":{"h":false}}"#
    let value = try roundTrip(json)
    XCTAssertEqual(value["a"], .null)
    XCTAssertEqual(value["b"], .bool(true))
    XCTAssertEqual(value["c"], .int(42))
    XCTAssertEqual(value["d"], .double(3.5))
    XCTAssertEqual(value["e"], .string("hi"))
    XCTAssertEqual(value["f"], .array([.int(1), .int(2), .int(3)]))
    XCTAssertEqual(value["g"], .object(["h": .bool(false)]))
  }

  func testIntegerPreservedNotCoercedToDouble() throws {
    // A millisecond timestamp must survive as Int, not 1.751e12.
    let value = try roundTrip(#"{"createdAt":1751000000000}"#)
    XCTAssertEqual(value["createdAt"], .int(1_751_000_000_000))
  }

  func testDecodeIntoTypedStruct() throws {
    let value = JSONValue.object([
      "loaded": .bool(true),
      "items": .array([
        .object([
          "id": .string("ag_1"), "name": .string("Bookkeeper"),
          "workspaceId": .string("ws_1"), "createdAt": .int(1_751_000_000_000),
        ])
      ]),
    ])
    let vm = try value.decode(AgentsViewModel.self)
    XCTAssertTrue(vm.loaded)
    XCTAssertEqual(vm.items.first?.id, "ag_1")
    XCTAssertEqual(vm.items.first?.createdAt, 1_751_000_000_000)
  }

  func testDecodeMismatchThrows() {
    let value = JSONValue.object(["loaded": .string("nope"), "items": .array([])])
    XCTAssertThrowsError(try value.decode(AgentsViewModel.self))
  }
}
