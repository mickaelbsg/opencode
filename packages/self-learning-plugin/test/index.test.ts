import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "bun:test"
import {
  learningPaths,
  listSkills,
  nextStatus,
  parseLearningBlock,
  readSkill,
  recordSkillFeedback,
  saveTrajectory,
  searchSkills,
  upsertSkill,
  type SkillMetadata,
} from "../src/index"

const cleanup: string[] = []
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "opencode-learning-"))
  cleanup.push(home)
  return home
}

test("parses validated learning and creates a skill candidate", () => {
  const text = `Done.\n<!-- SELF_LEARNING\ngoal: fix JSON parsing\noutcome: success\ntools: bun test | git diff\nerrors: parser rejected markdown\ncorrections: use structured output\nfinal_approach: validate object before tool call\nevidence: 8 tests passed | exit code 0\nskill_name: n8n-json-debugging\nskill_description: Diagnose invalid JSON passed to n8n tools\nskill_trigger: A tool rejects an empty or malformed object\nskill_procedure: inspect raw model output | validate required fields | run malformed input tests\nEND_SELF_LEARNING -->`
  const parsed = parseLearningBlock(text, "session-1", "automation")
  expect(parsed?.trajectory.outcome).toBe("success")
  expect(parsed?.trajectory.evidence).toHaveLength(2)
  expect(parsed?.skill?.procedure).toHaveLength(3)
})

test("does not promote unvalidated outcomes to skills", () => {
  const text = `<!-- SELF_LEARNING\ngoal: guess a fix\noutcome: unknown\ntools:\nerrors:\ncorrections:\nfinal_approach: maybe restart\nevidence:\nskill_name: restart-everything\nskill_description: restart services\nskill_trigger: anything fails\nskill_procedure: restart | hope\nEND_SELF_LEARNING -->`
  expect(parseLearningBlock(text, "session-2", "infra")?.skill).toBeUndefined()
})

test("rejects blocks containing credentials", () => {
  const text = `<!-- SELF_LEARNING\ngoal: configure API\noutcome: success\ntools: curl\nerrors:\ncorrections:\nfinal_approach: token = abcdefghijklmnop\nevidence: status 200\nskill_name: api-config\nskill_description: configure API\nskill_trigger: API setup\nskill_procedure: add token | call endpoint\nEND_SELF_LEARNING -->`
  expect(parseLearningBlock(text, "session-3", "api")).toBeUndefined()
})

test("persists trajectories and searchable skills", async () => {
  const home = await fixture()
  const trajectory = {
    sessionID: "s1",
    project: "automation",
    goal: "Resolve Git conflict",
    toolsUsed: ["git"],
    errors: ["both modified"],
    corrections: [],
    finalApproach: "Resolve and test",
    evidence: ["tests passed"],
    outcome: "success" as const,
    createdAt: new Date().toISOString(),
  }
  const trajectoryPath = await saveTrajectory(trajectory, home)
  expect(JSON.parse(await readFile(trajectoryPath, "utf8")).goal).toBe(trajectory.goal)

  await upsertSkill({
    name: "git-conflict-resolution",
    description: "Resolve Git conflicts without losing either side",
    trigger: "A branch contains unmerged paths",
    procedure: ["Inspect conflict markers", "Combine intended behavior", "Run tests"],
    evidence: ["tests passed"],
    sourceSession: "s1",
  }, home)

  expect((await listSkills(home))[0]?.status).toBe("candidate")
  expect((await searchSkills("resolve git conflict", home))[0]?.name).toBe("git-conflict-resolution")
  expect(await readSkill("git-conflict-resolution", home)).toContain("Run tests")
  expect(learningPaths(home).skills).toContain("opencode")
})

test("promotes and deprecates skills using feedback", async () => {
  const home = await fixture()
  await upsertSkill({
    name: "safe-deploy",
    description: "Deploy with validation",
    trigger: "A deployment is requested",
    procedure: ["Run tests", "Deploy", "Check health"],
    evidence: ["health check passed"],
    sourceSession: "s1",
  }, home)

  await recordSkillFeedback("safe-deploy", true, "run 1 passed", home)
  const experimental = await recordSkillFeedback("safe-deploy", true, "run 2 passed", home)
  expect(experimental?.status).toBe("experimental")

  await recordSkillFeedback("safe-deploy", false, "health check failed", home)
  const degraded = await recordSkillFeedback("safe-deploy", false, "rollback required", home)
  expect(degraded?.status).toBe("deprecated")
})

test("calculates trusted status only with sufficient success rate", () => {
  const metadata: SkillMetadata = {
    name: "trusted",
    description: "",
    status: "candidate",
    confidence: 0,
    uses: 8,
    successes: 7,
    failures: 1,
    version: 1,
    createdAt: "",
    updatedAt: "",
    sourceSessions: [],
  }
  expect(nextStatus(metadata)).toBe("trusted")
})
