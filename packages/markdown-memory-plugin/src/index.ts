import type { Plugin } from "@opencode-ai/plugin"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"

export const categories = [
  "decisions",
  "troubleshooting",
  "contexto",
  "infos",
  "preferencias",
  "regras",
] as const

type Category = (typeof categories)[number]
type Suggestion = {
  category: Category
  title: string
  problem: string
  solution: string
  lesson: string
}

const projectCategories = new Set<Category>(["decisions", "troubleshooting", "contexto", "infos"])
const suggestionPattern = /(?:<!--\s*)?MEMORY_SUGGESTION\s*\n([\s\S]*?)\nEND_MEMORY_SUGGESTION(?:\s*-->)?/i
const MAX_CONTEXT_CHARS = 12000
const MAX_FILE_CHARS = 64000
const secretPatterns = [
  /\b(?:api[_-]?key|token|password|senha|secret|segredo)\b\s*(?:(?::|=|is|é|e)\s*)?[A-Za-z0-9._~+/=-]{12,}/i,
  /\bauthorization\b\s*(?::|=)?\s*bearer\s+\S+/i,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bsk-[A-Za-z0-9_-]{16,}/i,
  /\bgh[pousr]_[A-Za-z0-9_]{16,}/i,
]

export function memoryPaths(directory: string, home = process.env.HOME || process.env.USERPROFILE || "") {
  return {
    global: join(home, ".config", "opencode", "memory"),
    project: join(directory, "docs", "memory"),
  }
}

function fileFor(category: Category, paths: ReturnType<typeof memoryPaths>) {
  if (projectCategories.has(category)) return join(paths.project, `${category}.md`)
  return join(paths.global, `${category}.md`)
}

function normalizeCategory(value: string): Category | undefined {
  const category = value.trim().toLowerCase() as Category
  return categories.includes(category) ? category : undefined
}

export function containsSecret(text: string) {
  return secretPatterns.some((pattern) => pattern.test(text))
}

export function stripSuggestion(text: string) {
  return text.replace(suggestionPattern, "").trimEnd()
}

export function parseSuggestion(text: string): Suggestion | undefined {
  const match = text.match(suggestionPattern)
  if (!match) return

  const fields = Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => line.match(/^([a-z_]+):\s*(.*)$/i))
      .filter((line): line is RegExpMatchArray => Boolean(line))
      .map((line) => [line[1], line[2].trim()]),
  )
  const category = normalizeCategory(fields.category || "")
  if (!category || !fields.title || !fields.lesson) return
  if (containsSecret(Object.values(fields).join(" "))) return

  return {
    category,
    title: fields.title,
    problem: fields.problem || "",
    solution: fields.solution || "",
    lesson: fields.lesson,
  }
}

function entryText(suggestion: Suggestion, projectName: string) {
  return [
    `## ${new Date().toISOString().slice(0, 10)} - ${suggestion.title}`,
    "",
    suggestion.problem ? `- Problema: ${suggestion.problem}` : "",
    suggestion.solution ? `- Solução: ${suggestion.solution}` : "",
    `- Lição: ${suggestion.lesson}`,
    `- Projeto: ${projectName}`,
    "",
  ].filter(Boolean).join("\n")
}

function entries(content: string) {
  const matches = [...content.matchAll(/^## .+$/gm)]
  return matches.map((heading, index) => ({
    title: heading[0],
    start: heading.index || 0,
    end: matches[index + 1]?.index ?? content.length,
    text: content.slice(heading.index || 0, matches[index + 1]?.index ?? content.length).trim(),
  }))
}

function compactContent(content: string, limit = MAX_FILE_CHARS) {
  if (content.length <= limit) return content
  const recent = entries(content).reverse()
  const kept: string[] = []
  let size = 0
  for (const entry of recent) {
    if (size + entry.text.length + 2 > limit) break
    kept.unshift(entry.text)
    size += entry.text.length + 2
  }
  return kept.length ? `${kept.join("\n\n")}\n` : `${content.slice(-limit)}\n`
}

export async function appendMemory(directory: string, suggestion: Suggestion, home?: string) {
  const paths = memoryPaths(directory, home)
  const path = fileFor(suggestion.category, paths)
  await mkdir(join(path, ".."), { recursive: true })
  const current = await readFile(path, "utf8").catch(() => "")
  const entry = entryText(suggestion, directory.split(/[\\/]/).filter(Boolean).pop() || "unknown")
  if (current.includes(`- Lição: ${suggestion.lesson}`)) return { path, entry: null }
  const updated = `${current.trimEnd()}${current ? "\n\n" : ""}${entry}`
  await writeFile(path, compactContent(updated), "utf8")
  return { path, entry }
}

function recentSection(category: Category, content: string, budget: number) {
  const recent = entries(content).reverse()
  const kept: string[] = []
  let size = `### ${category}\n`.length
  for (const entry of recent) {
    if (size + entry.text.length + 2 > budget) break
    kept.unshift(entry.text)
    size += entry.text.length + 2
  }
  return kept.length ? `### ${category}\n${kept.join("\n\n")}` : ""
}

export async function loadMemoryFiles(directory: string, home?: string) {
  const paths = memoryPaths(directory, home)
  const perCategoryBudget = Math.floor(MAX_CONTEXT_CHARS / categories.length)
  const sections = await Promise.all(
    categories.map(async (category) => {
      const content = await readFile(fileFor(category, paths), "utf8").catch(() => "")
      return recentSection(category, content, perCategoryBudget)
    }),
  )
  return sections.filter(Boolean).join("\n\n").slice(-MAX_CONTEXT_CHARS)
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

export function removalQuery(text: string) {
  return normalizeText(text)
    .replace(/\b(remova|remover|apague|apagar|exclua|excluir|corrija|corrigir)\b/g, " ")
    .replace(/\b(essa|esse|isso|a|o|ultima|ultimo|minha|meu|memoria|anotacao|registro|que|esta|errado|sobre)\b/g, " ")
    .replace(/[^a-z0-9_-]+/g, " ")
    .trim()
}

export async function removeLatestMemory(directory: string, query = "", home?: string) {
  const paths = memoryPaths(directory, home)
  const needle = removalQuery(query)
  const candidates = await Promise.all(categories.map(async (category) => {
    const path = fileFor(category, paths)
    const content = await readFile(path, "utf8").catch(() => "")
    const modified = await stat(path).then((value) => value.mtimeMs).catch(() => 0)
    const matches = entries(content).filter((entry) => !needle || normalizeText(entry.text).includes(needle))
    const target = matches.at(-1)
    return target ? { path, content, target, modified } : undefined
  }))

  const target = candidates.filter(Boolean).sort((a, b) => b!.modified - a!.modified)[0]
  if (!target) return
  const updated = `${target.content.slice(0, target.target.start).trimEnd()}\n${target.content.slice(target.target.end).trimStart()}`.trimStart()
  await writeFile(target.path, updated ? `${updated}\n` : "", "utf8")
  return { path: target.path, title: target.target.title }
}

export function isRemovalRequest(text: string) {
  return /\b(remova|remover|apague|apagar|exclua|excluir)\b.*\b(mem[oó]ria|anota[cç][aã]o|registro|isso)\b|\b(est[aá]\s+errado|corrija\s+(essa|isso))\b/i.test(text)
}

function textParts(parts: Array<{ type?: string; text?: string }>) {
  return parts.filter((part) => part.type === "text").map((part) => part.text || "").join("\n")
}

export const MarkdownMemory: Plugin = async ({ client, directory }) => {
  const projectName = directory.split(/[\\/]/).filter(Boolean).pop() || "unknown"
  const sessions = new Map<string, { query: string; learned: boolean }>()

  return {
    "chat.message": async (input, output) => {
      sessions.set(input.sessionID, { query: textParts(output.parts), learned: false })
    },
    "experimental.chat.system.transform": async (_input, output) => {
      const memory = await loadMemoryFiles(directory)
      output.system.push(`## Markdown Memory\nProject: ${projectName}.\n${memory || "No saved memory exists yet."}\n\nWhen a coding task is completed with validated evidence, append exactly one hidden HTML comment after the answer:\n<!-- MEMORY_SUGGESTION\ncategory: decisions|troubleshooting|contexto|infos|preferencias|regras\ntitle: short title\nproblem: concise problem or empty\nsolution: concise solution or empty\nlesson: reusable lesson\nEND_MEMORY_SUGGESTION -->\nNever place this block outside the HTML comment. Do not include secrets, full transcripts, raw logs, or unverified attempts.`)
    },
    event: async ({ event }) => {
      if (event.type !== "session.idle") return
      const sessionID = (event.properties as { sessionID?: string })?.sessionID
      if (!sessionID) return
      const state = sessions.get(sessionID)
      if (!state || state.learned) return
      state.learned = true

      if (isRemovalRequest(state.query)) {
        const removed = await removeLatestMemory(directory, state.query)
        await client.tui.showToast({ body: {
          title: "Memória",
          message: removed ? `Removida de ${removed.path}` : "Nenhuma memória correspondente foi encontrada.",
          variant: removed ? "success" : "info",
        } }).catch(() => undefined)
        return
      }

      const response = await client.session.messages({ path: { id: sessionID } })
      const data = (response as { data?: unknown })?.data
      const messages = Array.isArray(response) ? response : Array.isArray(data) ? data : []
      const assistantText = messages
        .filter((message) => ((message as { info?: { role?: string }; role?: string }).info?.role || (message as { role?: string }).role) === "assistant")
        .flatMap((message) => ((message as { parts?: Array<{ text?: string; content?: string }> }).parts || []))
        .map((part) => part.text || part.content || "")
        .join("\n")
      const suggestion = parseSuggestion(assistantText)
      if (!suggestion) return
      const saved = await appendMemory(directory, suggestion)
      if (!saved.entry) return
      await client.tui.showToast({ body: {
        title: "Memória registrada",
        message: `${saved.path}\n${suggestion.lesson}`,
        variant: "success",
        duration: 7000,
      } }).catch(() => undefined)
    },
  }
}

export default MarkdownMemory
