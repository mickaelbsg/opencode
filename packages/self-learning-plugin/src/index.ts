import type { Plugin } from "@opencode-ai/plugin"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"

export type Outcome = "success" | "failure" | "unknown"
export type SkillStatus = "candidate" | "experimental" | "trusted" | "deprecated" | "rejected"

export type Trajectory = {
  sessionID: string
  project: string
  goal: string
  toolsUsed: string[]
  errors: string[]
  corrections: string[]
  finalApproach: string
  evidence: string[]
  outcome: Outcome
  createdAt: string
}

export type SkillCandidate = {
  name: string
  description: string
  trigger: string
  procedure: string[]
  evidence: string[]
  sourceSession: string
}

export type SkillMetadata = {
  name: string
  description: string
  status: SkillStatus
  confidence: number
  uses: number
  successes: number
  failures: number
  version: number
  createdAt: string
  updatedAt: string
  sourceSessions: string[]
}

const learningPattern = /(?:<!--\s*)?SELF_LEARNING\s*\n([\s\S]*?)\nEND_SELF_LEARNING(?:\s*-->)?/i
const MAX_TRAJECTORY_CHARS = 12000
const secretPatterns = [
  /\b(?:api[_-]?key|token|password|senha|secret|segredo)\b\s*(?::|=|is|é|e)\s*\S+/i,
  /\bauthorization\b\s*(?::|=)?\s*bearer\s+\S+/i,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bsk-[A-Za-z0-9_-]{16,}/i,
  /\bgh[pousr]_[A-Za-z0-9_]{16,}/i,
]

function containsSecret(text: string) {
  return secretPatterns.some((pattern) => pattern.test(text))
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

function now() {
  return new Date().toISOString()
}

export function learningPaths(home = process.env.HOME || process.env.USERPROFILE || "") {
  const root = join(home, ".config", "opencode", "learning")
  return {
    root,
    sessions: join(root, "sessions"),
    skills: join(home, ".config", "opencode", "skills"),
    rejected: join(root, "rejected"),
  }
}

function parseList(value = "") {
  return value.split("|").map((item) => item.trim()).filter(Boolean)
}

function parseSteps(value = "") {
  return value.split(/\s*\|\s*/).map((item) => item.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean)
}

export function parseLearningBlock(text: string, sessionID: string, project: string) {
  const match = text.match(learningPattern)
  if (!match) return
  const fields = Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => line.match(/^([a-z_]+):\s*(.*)$/i))
      .filter((line): line is RegExpMatchArray => Boolean(line))
      .map((line) => [line[1].toLowerCase(), line[2].trim()]),
  )
  const outcome = fields.outcome as Outcome
  if (!fields.goal || !["success", "failure", "unknown"].includes(outcome)) return
  if (containsSecret(Object.values(fields).join(" "))) return

  const trajectory: Trajectory = {
    sessionID,
    project,
    goal: fields.goal,
    toolsUsed: parseList(fields.tools),
    errors: parseList(fields.errors),
    corrections: parseList(fields.corrections),
    finalApproach: fields.final_approach || "",
    evidence: parseList(fields.evidence),
    outcome,
    createdAt: now(),
  }

  let skill: SkillCandidate | undefined
  if (outcome === "success" && trajectory.evidence.length && fields.skill_name && fields.skill_description && fields.skill_trigger) {
    const procedure = parseSteps(fields.skill_procedure)
    if (procedure.length >= 2) {
      skill = {
        name: slug(fields.skill_name),
        description: fields.skill_description,
        trigger: fields.skill_trigger,
        procedure,
        evidence: trajectory.evidence,
        sourceSession: sessionID,
      }
    }
  }
  return { trajectory, skill }
}

export async function saveTrajectory(trajectory: Trajectory, home?: string) {
  const paths = learningPaths(home)
  await mkdir(paths.sessions, { recursive: true })
  const safe = JSON.stringify(trajectory, null, 2).slice(0, MAX_TRAJECTORY_CHARS)
  const path = join(paths.sessions, `${trajectory.createdAt.replace(/[:.]/g, "-")}-${slug(trajectory.sessionID)}.json`)
  await writeFile(path, `${safe}\n`, "utf8")
  return path
}

function skillText(candidate: SkillCandidate, metadata: SkillMetadata) {
  const steps = candidate.procedure.map((step, index) => `${index + 1}. ${step}`).join("\n")
  const evidence = candidate.evidence.map((item) => `- ${item}`).join("\n")
  return `---
name: ${metadata.name}
description: ${metadata.description}
status: ${metadata.status}
confidence: ${metadata.confidence.toFixed(2)}
uses: ${metadata.uses}
successes: ${metadata.successes}
failures: ${metadata.failures}
version: ${metadata.version}
updated_at: ${metadata.updatedAt}
---

# ${candidate.name}

## Quando usar

${candidate.trigger}

## Procedimento

${steps}

## Evidências

${evidence}
`
}

async function readMetadata(path: string): Promise<SkillMetadata | undefined> {
  return readFile(path, "utf8").then(JSON.parse).catch(() => undefined)
}

export function nextStatus(metadata: SkillMetadata): SkillStatus {
  if (metadata.failures >= 2 && metadata.failures > metadata.successes / 2) return "deprecated"
  if (metadata.successes >= 7 && metadata.successes / Math.max(metadata.uses, 1) >= 0.85) return "trusted"
  if (metadata.successes >= 3 && metadata.failures === 0) return "experimental"
  return "candidate"
}

export async function upsertSkill(candidate: SkillCandidate, home?: string) {
  const paths = learningPaths(home)
  const directory = join(paths.skills, candidate.name)
  const metadataPath = join(directory, "metadata.json")
  await mkdir(directory, { recursive: true })
  const existing = await readMetadata(metadataPath)
  const timestamp = now()
  const metadata: SkillMetadata = existing
    ? {
        ...existing,
        description: candidate.description,
        version: existing.version + 1,
        updatedAt: timestamp,
        sourceSessions: [...new Set([...existing.sourceSessions, candidate.sourceSession])],
      }
    : {
        name: candidate.name,
        description: candidate.description,
        status: "candidate",
        confidence: 0.55,
        uses: 0,
        successes: 1,
        failures: 0,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        sourceSessions: [candidate.sourceSession],
      }
  metadata.status = nextStatus(metadata)
  metadata.confidence = Math.min(0.95, Math.max(0.1, (metadata.successes + 1) / (metadata.uses + 2)))
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8")
  await writeFile(join(directory, "SKILL.md"), skillText(candidate, metadata), "utf8")
  return { directory, metadata }
}

export async function recordSkillFeedback(name: string, success: boolean, evidence = "", home?: string) {
  const paths = learningPaths(home)
  const directory = join(paths.skills, slug(name))
  const metadataPath = join(directory, "metadata.json")
  const metadata = await readMetadata(metadataPath)
  if (!metadata) return
  metadata.uses += 1
  if (success) metadata.successes += 1
  else metadata.failures += 1
  metadata.status = nextStatus(metadata)
  metadata.confidence = Math.min(0.98, Math.max(0.05, metadata.successes / Math.max(metadata.uses, 1)))
  metadata.updatedAt = now()
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8")
  if (evidence) await writeFile(join(directory, "feedback.log"), `${metadata.updatedAt}\t${success ? "success" : "failure"}\t${evidence.replace(/\s+/g, " ")}\n`, { flag: "a" })
  return metadata
}

export async function listSkills(home?: string) {
  const paths = learningPaths(home)
  const names = await readdir(paths.skills).catch(() => [])
  const skills = await Promise.all(names.map(async (name) => {
    const metadata = await readMetadata(join(paths.skills, name, "metadata.json"))
    return metadata
  }))
  return skills.filter((item): item is SkillMetadata => Boolean(item) && item.status !== "rejected")
}

export async function searchSkills(query: string, home?: string) {
  const words = slug(query).split("-").filter((word) => word.length > 2)
  const skills = await listSkills(home)
  return skills
    .map((skill) => ({ skill, score: words.reduce((score, word) => score + (slug(`${skill.name} ${skill.description}`).includes(word) ? 1 : 0), 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.skill.confidence - a.skill.confidence)
    .slice(0, 8)
    .map((item) => item.skill)
}

export async function readSkill(name: string, home?: string) {
  const paths = learningPaths(home)
  return readFile(join(paths.skills, slug(name), "SKILL.md"), "utf8").catch(() => undefined)
}

function textParts(parts: Array<{ type?: string; text?: string }>) {
  return parts.filter((part) => part.type === "text").map((part) => part.text || "").join("\n")
}

export const SelfLearning: Plugin = async ({ client, directory }) => {
  const project = basename(directory)
  const sessions = new Map<string, { query: string; processed: boolean }>()

  return {
    "chat.message": async (input, output) => {
      sessions.set(input.sessionID, { query: textParts(output.parts), processed: false })
    },
    "experimental.chat.system.transform": async (_input, output) => {
      const catalog = (await listSkills()).map((skill) => `- ${skill.name} [${skill.status}, ${skill.confidence.toFixed(2)}]: ${skill.description}`).join("\n")
      output.system.push(`## Self-learning
Project: ${project}.
Available procedural skills:\n${catalog || "- none"}
Use a relevant skill when it matches the task. Do not claim success without evidence. At the end of a completed task, append exactly one hidden HTML comment using this format:
<!-- SELF_LEARNING
goal: concise task goal
outcome: success|failure|unknown
tools: tool names separated by |
errors: errors separated by |
corrections: corrections separated by |
final_approach: validated final approach
evidence: tests, exit codes, user confirmation or observable results separated by |
skill_name: reusable skill slug or empty
skill_description: concise description or empty
skill_trigger: when this procedure should be used or empty
skill_procedure: at least two validated steps separated by |
END_SELF_LEARNING -->
Only propose a skill when outcome is success and evidence is non-empty. Never store secrets, raw transcripts, credentials or unverified guesses.`)
    },
    event: async ({ event }) => {
      if (event.type !== "session.idle") return
      const sessionID = (event.properties as { sessionID?: string })?.sessionID
      if (!sessionID) return
      const state = sessions.get(sessionID)
      if (!state || state.processed) return
      state.processed = true

      const response = await client.session.messages({ path: { id: sessionID } })
      const data = (response as { data?: unknown })?.data
      const messages = Array.isArray(response) ? response : Array.isArray(data) ? data : []
      const assistantText = messages
        .filter((message) => ((message as { info?: { role?: string }; role?: string }).info?.role || (message as { role?: string }).role) === "assistant")
        .flatMap((message) => ((message as { parts?: Array<{ text?: string; content?: string }> }).parts || []))
        .map((part) => part.text || part.content || "")
        .join("\n")
      const parsed = parseLearningBlock(assistantText, sessionID, project)
      if (!parsed) return
      const trajectoryPath = await saveTrajectory(parsed.trajectory)
      const learned = parsed.skill ? await upsertSkill(parsed.skill) : undefined
      await client.tui.showToast({ body: {
        title: learned ? "Nova skill aprendida" : "Trajetória registrada",
        message: learned ? `${learned.metadata.name} (${learned.metadata.status})` : trajectoryPath,
        variant: learned ? "success" : "info",
        duration: 7000,
      } }).catch(() => undefined)
    },
  }
}

export default SelfLearning
