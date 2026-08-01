import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

export type HindsightConfig = {
  bank_id: string
  api_url: string
  memory_mode: "hybrid" | "context" | "tools"
  prefetch_method: "recall" | "reflect"
  auto_recall: boolean
  auto_retain: boolean
  retain_every_n_turns: number
  recall_budget: "low" | "mid" | "high"
  recall_max_tokens: number
  recall_timeout_ms: number
  retain_timeout_ms: number
  max_retain_chars: number
  recall_types: string[]
  retain_tags: string[]
  recall_tags: string[]
  recall_tags_match: string
  keyword_patterns: string[]
  redact_patterns: string[]
}

type SessionMessage = {
  info: { role: string }
  parts: Array<{ type: string; text?: string }>
}

const defaults: HindsightConfig = {
  bank_id: "opencode",
  api_url: "http://localhost/hindsight-mcp/v1",
  memory_mode: "hybrid",
  prefetch_method: "recall",
  auto_recall: true,
  auto_retain: true,
  retain_every_n_turns: 1,
  recall_budget: "mid",
  recall_max_tokens: 4096,
  recall_timeout_ms: 1500,
  retain_timeout_ms: 1500,
  max_retain_chars: 4000,
  recall_types: ["observation", "world", "experience"],
  retain_tags: ["agent:opencode"],
  recall_tags: [],
  recall_tags_match: "any",
  keyword_patterns: [
    "remember",
    "lembre",
    "lembra",
    "salve",
    "save",
    "guarde",
    "don't forget",
    "não esqueça",
    "nao esqueca",
    "anote",
    "write down",
    "importante",
    "important",
  ],
  redact_patterns: [],
}

const builtinRedactions = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/gi,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/gi,
  /\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
  /\bauthorization\s*:\s*bearer\s+[^\s,;]+/gi,
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

export function normalizeConfig(value: unknown): HindsightConfig | undefined {
  if (!isRecord(value)) return
  const config = { ...defaults, ...value }
  if (typeof config.bank_id !== "string" || !config.bank_id) return
  if (typeof config.api_url !== "string" || !URL.canParse(config.api_url)) return
  if (!["hybrid", "context", "tools"].includes(config.memory_mode as string)) return
  if (!["recall", "reflect"].includes(config.prefetch_method as string)) return
  if (!["low", "mid", "high"].includes(config.recall_budget as string)) return
  if (typeof config.auto_recall !== "boolean" || typeof config.auto_retain !== "boolean") return
  if (!Number.isInteger(config.retain_every_n_turns) || config.retain_every_n_turns < 1) return
  if (!Number.isInteger(config.recall_max_tokens) || config.recall_max_tokens < 1) return
  if (!Number.isInteger(config.recall_timeout_ms) || config.recall_timeout_ms < 1) return
  if (!Number.isInteger(config.retain_timeout_ms) || config.retain_timeout_ms < 1) return
  if (!Number.isInteger(config.max_retain_chars) || config.max_retain_chars < 1) return
  if (!["any", "all"].includes(config.recall_tags_match)) return
  if (!isStringArray(config.recall_types) || !isStringArray(config.retain_tags)) return
  if (!isStringArray(config.recall_tags) || !isStringArray(config.keyword_patterns)) return
  if (!isStringArray(config.redact_patterns)) return
  if (config.redact_patterns.some((pattern) => {
    try {
      new RegExp(pattern)
      return false
    } catch {
      return true
    }
  })) return
  return config as HindsightConfig
}

export function detectKeyword(text: string, patterns: string[]) {
  const lower = text.toLowerCase()
  for (const pattern of patterns) {
    const needle = pattern.toLowerCase()
    let index = lower.indexOf(needle)
    while (index !== -1) {
      const before = lower[index - 1]
      const after = lower[index + needle.length]
      if (!before?.match(/[\p{L}\p{N}_]/u) && !after?.match(/[\p{L}\p{N}_]/u)) {
        const content = text
          .slice(index + pattern.length)
          .trim()
          .replace(/^(que|de|do|da|dos|das|no|na|nos|nas|that|the|to)\s+/i, "")
        return content || text
      }
      index = lower.indexOf(needle, index + needle.length)
    }
  }
}

export function redactSensitive(text: string, patterns: string[] = []) {
  const regexes = patterns.flatMap((pattern) => {
    try {
      return [new RegExp(pattern, "gi")]
    } catch {
      return []
    }
  })
  return [...builtinRedactions, ...regexes].reduce((result, regex) => result.replace(regex, "[REDACTED]"), text)
}

export function loadConfig(): HindsightConfig | undefined {
  const home = process.env.HOME || process.env.USERPROFILE || ""
  const path = join(home, ".config", "opencode", "hindsight.json")
  if (!existsSync(path)) return
  try {
    return normalizeConfig(JSON.parse(readFileSync(path, "utf8")))
  } catch {
    return
  }
}

async function request(config: HindsightConfig, path: string, body: unknown, timeout: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const endpoint = `${config.api_url}/default/banks/${config.bank_id}/memories${path ? `/${path}` : ""}`
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) return
    return (await response.json()) as Record<string, unknown>
  } catch {
    return
  } finally {
    clearTimeout(timer)
  }
}

async function recall(config: HindsightConfig, query: string) {
  const data = await request(
    config,
    config.prefetch_method === "reflect" ? "reflect" : "recall",
    config.prefetch_method === "reflect"
      ? { query: query.slice(0, 800), budget: config.recall_budget, max_tokens: config.recall_max_tokens }
      : {
          query: query.slice(0, 800),
          budget: config.recall_budget,
          max_tokens: config.recall_max_tokens,
          types: config.recall_types,
          tags: config.recall_tags.length ? config.recall_tags : undefined,
          tags_match: config.recall_tags_match,
        },
    config.recall_timeout_ms,
  )
  if (!data) return
  if (config.prefetch_method === "reflect") {
    const text = data.text ?? data.response ?? data.answer ?? data.content
    return typeof text === "string" ? text : undefined
  }
  const results = data.results
  if (!Array.isArray(results)) return
  return results
    .map((item) => (isRecord(item) && typeof item.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n") || undefined
}

async function retain(config: HindsightConfig, content: string, tags: string[]) {
  const safeContent = redactSensitive(content, config.redact_patterns).slice(0, config.max_retain_chars)
  await request(
    config,
    "",
    { items: [{ content: safeContent, context: "opencode session", tags: [...config.retain_tags, ...tags] }] },
    config.retain_timeout_ms,
  )
}

function retainAsync(config: HindsightConfig, content: string, tags: string[]) {
  void retain(config, content, tags)
}

export const HindsightMemory: Plugin = async ({ client, directory }) => {
  const config = loadConfig()
  if (!config) return {}

  const projectName = directory.split(/[/\\]/).filter(Boolean).pop() || "unknown"
  const turnCounter = { count: 0 }
  const summarizedSessions = new Set<string>()
  const autoRecall = config.auto_recall && config.memory_mode !== "tools"
  const autoRetain = config.auto_retain
  const showTools = config.memory_mode !== "context"
  const ignoredTools = [
    "hindsight_recall",
    "hindsight_retain",
    "hindsight_reflect",
    "hindsight_memory_recall",
    "hindsight_memory_retain",
    "hindsight_memory_reflect",
  ]

  return {
    tool: {
      hindsight_memory_recall: tool({
        description: "Recall relevant long-term memories from Hindsight.",
        args: { query: tool.schema.string() },
        execute: async (args) => (await recall(config, args.query)) || "No relevant memories found.",
      }),
      hindsight_memory_retain: tool({
        description: "Store a fact in Hindsight long-term memory.",
        args: { content: tool.schema.string(), tags: tool.schema.array(tool.schema.string()).optional() },
        execute: async (args) => {
          await retain(config, args.content, args.tags || ["manual"])
          return "Memory retained."
        },
      }),
      hindsight_memory_reflect: tool({
        description: "Synthesize an answer from Hindsight long-term memory.",
        args: { query: tool.schema.string() },
        execute: async (args) => {
          const response = await recall({ ...config, prefetch_method: "reflect" }, args.query)
          return response || "No reflection available."
        },
      }),
    },

    "chat.message": async (_input, output) => {
      if (!autoRetain) return
      const content = output.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
      const retained = detectKeyword(content, config.keyword_patterns)
      if (retained) retainAsync(config, retained, [`project:${projectName}`, "keyword_detected"])
    },

    "experimental.chat.system.transform": async (_input, output) => {
      if (!autoRecall) return
      const query = output.system.at(-1)
      if (!query || query.length < 20) return
      const memories = await recall(config, query)
      if (!memories) return
      output.system.push(
        `\n## Hindsight Memory\nProject: ${projectName}. Tag memories with \`project:${projectName}\` and \`agent:opencode\`.\nRelevant memories from past sessions:\n${memories}${showTools ? "\n- Tools available: hindsight_memory_recall, hindsight_memory_retain, hindsight_memory_reflect." : ""}`,
      )
    },

    "tool.execute.after": async (_input, output) => {
      if (!autoRetain || ignoredTools.includes(output.title)) return
      turnCounter.count++
      if (turnCounter.count % config.retain_every_n_turns !== 0 || output.output.length < 50) return
      retainAsync(config, `Tool: ${output.title}\nResult: ${output.output}`, [`project:${projectName}`, `tool:${output.title}`])
    },

    event: async ({ event }) => {
      try {
        if (event.type !== "session.idle") return
        const sessionID = (event.properties as { sessionID?: string })?.sessionID
        if (!sessionID || summarizedSessions.has(sessionID)) return
        summarizedSessions.add(sessionID)
        const messages = (await client.session.messages({ path: { id: sessionID } })) as unknown as SessionMessage[]
        const summary = messages
          .filter((message) => message.info.role === "user")
          .flatMap((message) => message.parts)
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .filter(Boolean)
          .slice(-5)
          .join("\n")
        if (summary) retainAsync(config, `Session ${sessionID} summary:\n${summary}`, [`project:${projectName}`, "session_summary"])
      } catch {
        return
      }
    },
  }
}
