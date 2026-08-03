import type { Plugin } from "@opencode-ai/plugin"
import { mkdir, readFile, writeFile } from "node:fs/promises"
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

const projectCategories = new Set<Category>(["decisions", "troubleshooting", "contexto", "infos"])
const suggestionPattern = /MEMORY_SUGGESTION\s*\n([\s\S]*?)\nEND_MEMORY_SUGGESTION/i
const secretPattern = /(api[_-]?key|token|password|secret|bearer)\s*[:=]/i

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

export function parseSuggestion(text: string) {
  const match = text.match(suggestionPattern)
  if (!match) return

  const fields = Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => line.match(/^([a-z_]+):\s*(.+)$/i))
      .filter((line): line is RegExpMatchArray => Boolean(line))
      .map((line) => [line[1], line[2].trim()]),
  )
  const category = normalizeCategory(fields.category || "")
  if (!category || !fields.title || !fields.lesson) return
  if (secretPattern.test(Object.values(fields).join(" "))) return

  return {
    category,
    title: fields.title,
    problem: fields.problem || "",
    solution: fields.solution || "",
    lesson: fields.lesson,
  }
}

function entryText(suggestion: NonNullable<ReturnType<typeof parseSuggestion>>, projectName: string) {
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

export async function appendMemory(
  directory: string,
  suggestion: NonNullable<ReturnType<typeof parseSuggestion>>,
  home?: string,
) {
  const paths = memoryPaths(directory, home)
  const path = fileFor(suggestion.category, paths)
  await mkdir(join(path, ".."), { recursive: true })
  const current = await readFile(path, "utf8").catch(() => "")
  const entry = entryText(suggestion, directory.split(/[\\/]/).filter(Boolean).pop() || "unknown")
  if (current.includes(`- Lição: ${suggestion.lesson}`)) return { path, entry: null }
  await writeFile(path, `${current.trimEnd()}${current ? "\n\n" : ""}${entry}`, "utf8")
  return { path, entry }
}

export async function loadMemoryFiles(directory: string, home?: string) {
  const paths = memoryPaths(directory, home)
  const sections = await Promise.all(
    categories.map(async (category) => {
      const content = await readFile(fileFor(category, paths), "utf8").catch(() => "")
      return content.trim() ? `### ${category}\n${content.trim()}` : ""
    }),
  )
  return sections.filter(Boolean).join("\n\n").slice(0, 12000)
}

export async function removeLatestMemory(directory: string, query = "", home?: string) {
  const paths = memoryPaths(directory, home)
  for (const category of categories) {
    const path = fileFor(category, paths)
    const content = await readFile(path, "utf8").catch(() => "")
    const headings = [...content.matchAll(/^## .+$/gm)]
    const target = [...headings].reverse().find((heading) => {
      const index = heading.index || 0
      const next = headings[headings.indexOf(heading) + 1]?.index ?? content.length
      return content.slice(index, next).toLowerCase().includes(query.toLowerCase())
    })
    if (!target || target.index === undefined) continue
    const next = headings[headings.indexOf(target) + 1]?.index ?? content.length
    const updated = `${content.slice(0, target.index).trimEnd()}\n${content.slice(next).trimStart()}`.trimStart()
    await writeFile(path, updated ? `${updated}\n` : "", "utf8")
    return { path, title: target[0] }
  }
  return
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
      output.system.push(`## Markdown Memory\nProject: ${projectName}.\n${memory || "No saved memory exists yet."}\n\nWhen a coding task is completed with validated evidence, append exactly this block after your answer:\nMEMORY_SUGGESTION\ncategory: decisions|troubleshooting|contexto|infos|preferencias|regras\ntitle: short title\nproblem: concise problem or empty\nsolution: concise solution or empty\nlesson: reusable lesson\nEND_MEMORY_SUGGESTION\nDo not include secrets, full transcripts, raw logs, or unverified attempts.`)
    },
    event: async ({ event }) => {
      if (event.type !== "session.idle") return
      const sessionID = (event.properties as { sessionID?: string })?.sessionID
      if (!sessionID) return
      const state = sessions.get(sessionID)
      if (!state || state.learned) return
      state.learned = true

      if (isRemovalRequest(state.query)) {
        const removed = await removeLatestMemory(directory)
        await client.tui.showToast({ body: {
          title: "Memória",
          message: removed ? `Removida de ${removed.path}` : "Nenhuma memória encontrada para remover.",
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
