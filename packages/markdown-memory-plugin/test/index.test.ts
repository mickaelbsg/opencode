import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { appendMemory, isRemovalRequest, loadMemoryFiles, memoryPaths, removeLatestMemory } from "../src/index"

const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "opencode-memory-"))
  cleanup.push(root)
  return { home: join(root, "home"), project: join(root, "project") }
}

test("keeps global and project memory isolated", async () => {
  const { home, project } = await fixture()
  expect(memoryPaths(project, home)).toEqual({
    global: join(home, ".config", "opencode", "memory"),
    project: join(project, "docs", "memory"),
  })
})

test("writes categorized memory and loads it into context", async () => {
  const { home, project } = await fixture()
  const suggestion = {
    category: "troubleshooting" as const,
    title: "Auth guard",
    problem: "The endpoint lacked authorization.",
    solution: "Check the role before the mutation.",
    lesson: "Authentication and authorization must be checked separately.",
  }
  const saved = await appendMemory(project, suggestion, home)
  expect(saved.entry).toContain("Projeto: project")
  expect(await loadMemoryFiles(project, home)).toContain(suggestion.lesson)
  expect(await readFile(saved.path, "utf8")).toContain("## ")
})

test("removes only the latest matching entry", async () => {
  const { home, project } = await fixture()
  const first = { category: "decisions" as const, title: "First", problem: "", solution: "", lesson: "Keep the API small." }
  const second = { ...first, title: "Second", lesson: "Validate the public boundary." }
  await appendMemory(project, first, home)
  await appendMemory(project, second, home)
  const removed = await removeLatestMemory(project, "Validate the public boundary", home)
  expect(removed?.title).toContain("Second")
  expect(await loadMemoryFiles(project, home)).not.toContain(second.lesson)
  expect(await loadMemoryFiles(project, home)).toContain(first.lesson)
})

test("recognizes natural-language removal and correction", () => {
  expect(isRemovalRequest("remova essa memória")).toBe(true)
  expect(isRemovalRequest("isso está errado, corrija")).toBe(true)
  expect(isRemovalRequest("continue a implementação")).toBe(false)
})
