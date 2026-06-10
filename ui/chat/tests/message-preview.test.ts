import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import { messagePreviewText } from "../src/message-preview.ts"

const skillBody = (payload: Record<string, unknown>, prompt: string): string =>
  `<!--houston:skill ${JSON.stringify(payload)}-->\n\n${prompt}`

const attachmentBody = (payload: Record<string, unknown>, prompt: string): string =>
  `<!--houston:attachments ${JSON.stringify(payload)}-->\n\n${prompt}`

describe("messagePreviewText", () => {
  it("returns the user's composer text for a Skill run with a message", () => {
    const body = skillBody(
      {
        skill: "set-up-my-books",
        displayName: "Set up my books",
        description: "Get your bookkeeping organized",
        message: "Use last quarter's statements",
      },
      "Use the set-up-my-books skill.\n\nUse last quarter's statements",
    )
    assert.equal(messagePreviewText(body), "Use last quarter's statements")
  })

  it("falls back to the Skill description when sent on its own", () => {
    // The exact regression from HOU-425: a Skill sent without composer text
    // must never surface the raw `<!--houston:skill ...-->` marker.
    const body = skillBody(
      {
        skill: "set-up-my-books",
        displayName: "Set up my books",
        description: "Get your bookkeeping organized",
        message: "",
      },
      "Use the set-up-my-books skill.",
    )
    const preview = messagePreviewText(body)
    assert.equal(preview, "Get your bookkeeping organized")
    assert.ok(!preview.includes("houston:skill"))
  })

  it("returns empty string when a Skill has neither message nor description", () => {
    const body = skillBody(
      { skill: "set-up-my-books", displayName: "Set up my books" },
      "Use the set-up-my-books skill.",
    )
    assert.equal(messagePreviewText(body), "")
  })

  it("trims surrounding whitespace from the Skill message", () => {
    const body = skillBody(
      { skill: "draft-an-nda", message: "   focus on mutual terms  " },
      "Use the draft-an-nda skill.",
    )
    assert.equal(messagePreviewText(body), "focus on mutual terms")
  })

  it("returns the user's text for an attachment message, never the file paths", () => {
    const body = attachmentBody(
      {
        message: "Summarize this",
        files: [{ name: "brief.pdf", path: "/Users/x/brief.pdf" }],
      },
      "Summarize this\n\n[User attached these files...]",
    )
    const preview = messagePreviewText(body)
    assert.equal(preview, "Summarize this")
    assert.ok(!preview.includes("/Users/"))
  })

  it("returns empty string for files sent with no text", () => {
    const body = attachmentBody(
      { message: "", files: [{ name: "brief.pdf", path: "/Users/x/brief.pdf" }] },
      "[User attached these files...]",
    )
    assert.equal(messagePreviewText(body), "")
  })

  it("returns plain message bodies unchanged", () => {
    assert.equal(messagePreviewText("Review my Q3 numbers"), "Review my Q3 numbers")
  })

  it("treats empty / null / undefined as empty", () => {
    assert.equal(messagePreviewText(""), "")
    assert.equal(messagePreviewText(null), "")
    assert.equal(messagePreviewText(undefined), "")
  })
})
