import { describe, expect, test } from "bun:test"
import { detectKeyword, normalizeConfig, redactSensitive } from "../src/index"

describe("hindsight-plugin", () => {
  test("extracts content after a Portuguese keyword and connector", () => {
    expect(detectKeyword("lembre que o projeto usa Docker", ["lembre"])).toBe("o projeto usa Docker")
  })

  test("does not match a keyword inside another word", () => {
    expect(detectKeyword("this is importantness", ["important"])).toBeUndefined()
  })

  test("redacts common credentials and configured patterns", () => {
    const value = redactSensitive("api_key=secret123 user=alice", ["user=\\w+"])
    expect(value).toBe("[REDACTED] [REDACTED]")
  })

  test("rejects invalid configuration", () => {
    expect(normalizeConfig({ api_url: "not a URL" })).toBeUndefined()
    expect(normalizeConfig({ memory_mode: "invalid" })).toBeUndefined()
    expect(normalizeConfig({ redact_patterns: ["["] })).toBeUndefined()
  })

  test("normalizes a valid partial configuration with defaults", () => {
    const config = normalizeConfig({ bank_id: "test", api_url: "http://localhost:8888" })
    expect(config?.bank_id).toBe("test")
    expect(config?.retain_timeout_ms).toBe(1500)
    expect(config?.redact_patterns).toEqual([])
  })
})
