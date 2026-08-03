import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "bun:test"
import {
  appendMemory,
  containsSecret,
  isRemovalRequest,
  loadMemoryFiles,
  memoryPaths,
  parseSuggestion,
  removalQuery,
  removeLatestMemory,
  stripSuggestion,
} from "../src/index"

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

test("removes only the latest contextually matching entry", async () => {
  const { home, project } = await fixture()
  const first = { category: "decisions" as const, title: "API", problem: "", solution: "", lesson: "Keep the API small." }
  const second = { category: "troubleshooting" as const, title: "Auth", problem: "", solution: "", lesson: "Validate the authorization boundary." }
  await appendMemory(project, first, home)
  await appendMemory(project, second, home)
  const removed = await removeLatestMemory(project, "remova a memória sobre authorization boundary", home)
  expect(removed?.title).toContain("Auth")
  expect(await loadMemoryFiles(project, home)).not.toContain(second.lesson)
  expect(await loadMemoryFiles(project, home)).toContain(first.lesson)
})

test("normalizes natural-language removal queries", () => {
  expect(removalQuery("Remova essa memória sobre autenticação")).toBe("sobre autenticacao")
  expect(isRemovalRequest("remova essa memória")).toBe(true)
  expect(isRemovalRequest("isso está errado, corrija")).toBe(true)
  expect(isRemovalRequest("continue a implementação")).toBe(false)
})

test("rejects common secret formats", () => {
  expect(containsSecret("senha é supersecreta")).toBe(true)
  expect(containsSecret("use o token abcdefghijklmnop")).toBe(true)
  expect(containsSecret("Authorization: Bearer abcdefghijklmnop")).toBe(true)
  expect(containsSecret("A autenticação deve ocorrer antes da autorização.")).toBe(false)
})

test("parses a hidden suggestion and strips it from visible text", () => {
  const text = `Concluído.\n<!-- MEMORY_SUGGESTION\ncategory: decisions\ntitle: API pequena\nproblem: excesso de superfície\nsolution: reduzir endpoints\nlesson: mantenha a API pequena\nEND_MEMORY_SUGGESTION -->`
  expect(parseSuggestion(text)?.lesson).toBe("mantenha a API pequena")
  expect(stripSuggestion(text)).toBe("Concluído.")
})

test("does not parse suggestions containing secrets", () => {
  const text = `<!-- MEMORY_SUGGESTION\ncategory: infos\ntitle: Credencial\nproblem:\nsolution:\nlesson: token = abcdefghijklmnop\nEND_MEMORY_SUGGESTION -->`
  expect(parseSuggestion(text)).toBeUndefined()
})
