import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

type HindsightConfig = {
  bank_id: string
  api_url: string
  memory_mode: "hybrid" | "context" | "tools"
  auto_recall: boolean
  auto_retain: boolean
  retain_every_n_turns: number
  recall_budget: "low" | "mid" | "high"
  recall_max_tokens: number
  recall_types: string[]
  retain_tags: string[]
  recall_tags: string[]
  recall_tags_match: string
  keyword_patterns: string[]
}

type SessionMessage = {
  info: { role: string }
  parts: Array<{ type: string; text?: string }>
}

const defaults: HindsightConfig = {
  bank_id: "opencode",
  api_url: "http://localhost/hindsight-mcp/v1",
  memory_mode: "hybrid",
  auto_recall: true,
  auto_retain: true,
  retain_every_n_turns: 1,
  recall_budget: "mid",
  recall_max_tokens: 4096,
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
}

function loadConfig(): HindsightConfig | undefined {
  const path = join(process.env.HOME || "", ".config", "opencode", "hindsight.json")
  if (!existsSync(path)) return

  try {
    return { ...defaults, ...JSON.parse(readFileSync(path, "utf8")) }
  } catch {
    return
  }
}

async function recall(config: HindsightConfig, query: string) {
  try {
    const response = await fetch(`${config.api_url}/default/banks/${config.bank_id}/memories/recall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query.slice(0, 800),
        budget: config.recall_budget,
        max_tokens: config.recall_max_tokens,
        types: config.recall_types,
        tags: config.recall_tags.length ? config.recall_tags : undefined,
        tags_match: config.recall_tags_match,
      }),
    })
    if (!response.ok) return

    const data = (await response.json()) as { results?: Array<{ text?: string }> }
    return data.results?.map((item) => item.text ?? "").filter(Boolean).join("\n") || undefined
  } catch {
    return
  }
}

async function retain(config: HindsightConfig, content: string, tags: string[]) {
  try {
    await fetch(`${config.api_url}/default/banks/${config.bank_id}/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ content, context: "opencode session", tags: [...config.retain_tags, ...tags] }],
      }),
    })
  } catch {
    return
  }
}

function detectKeyword(text: string, patterns: string[]) {
  const lower = text.toLowerCase()
  for (const pattern of patterns) {
    const index = lower.indexOf(pattern.toLowerCase())
    if (index === -1) continue

    const content = text
      .slice(index + pattern.length)
      .trim()
      .replace(/^(que|de|do|da|dos|das|no|na|nos|nas|that|the|to)\s+/i, "")
    return content || text
  }
}

export const HindsightMemory: Plugin = async ({ client, directory }) => {
  const config = loadConfig()
  if (!config) return {}

  const projectName = directory.split(/[/\\]/).filter(Boolean).pop() || "unknown"
  const turnCounter = { count: 0 }
  const autoRecall = config.auto_recall && config.memory_mode !== "tools"
  const autoRetain = config.auto_retain
  const showTools = config.memory_mode !== "context"

  return {
    "chat.message": async (_input, output) => {
      if (!autoRetain) return
      const content = output.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
      const retained = detectKeyword(content, config.keyword_patterns)
      if (!retained) return
      await retain(config, retained, [`project:${projectName}`, "keyword_detected"])
    },

    "experimental.chat.system.transform": async (_input, output) => {
      if (!autoRecall) return
      const query = output.system.at(-1)
      if (!query || query.length < 20) return
      const memories = await recall(config, query)
      if (!memories) return

      output.system.push(`\n## Hindsight Memory\nProject: ${projectName}. Tag memories with \`project:${projectName}\` and \`agent:opencode\`.\nRelevant memories from past sessions:\n${memories}${showTools ? "\n- You also have hindsight memory tools for explicit recall, retain, and reflect." : ""}`)
    },

    "tool.execute.after": async (_input, output) => {
      if (!autoRetain) return
      if (["hindsight_recall", "hindsight_retain", "hindsight_reflect"].includes(output.title)) return
      turnCounter.count++
      if (turnCounter.count % config.retain_every_n_turns !== 0 || output.output.length < 50) return
      await retain(config, `Tool: ${output.title}\nResult: ${output.output.slice(0, 1000)}`, [
        `project:${projectName}`,
        `tool:${output.title}`,
      ])
    },

    event: async ({ event }) => {
      try {
        if (event.type !== "session.idle") return
        const sessionID = (event.properties as { sessionID?: string })?.sessionID
        if (!sessionID) return
        const messages = (await client.session.messages({ path: { id: sessionID } })) as unknown as SessionMessage[]
        const summary = messages
          .filter((message) => message.info.role === "user")
          .flatMap((message) => message.parts)
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .filter(Boolean)
          .slice(-5)
          .join("\n")
        if (summary) await retain(config, `Session ${sessionID} summary:\n${summary.slice(0, 2000)}`, [`project:${projectName}`, "session_summary"])
      } catch {
        return
      }
    },
  }
}
