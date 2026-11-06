import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { escapeHtml } from "./escapeHtml"

describe("escapeHtml", () => {
  it("escapes HTML special characters", () => {
    assert.equal(
      escapeHtml(`<script>alert("x")</script>`),
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    )
  })
})
