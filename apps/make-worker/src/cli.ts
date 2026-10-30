#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { JobSpecSchema, type StatusFile } from "@opus5_5/shared";
import {
  assertJobSingleAspect,
  resolveFromJob,
  runQaGate,
  statusAfterQa,
} from "@opus5_5/pipeline";
import { REPO_ROOT, jobDir } from "./paths.js";
import { callOpusExtra } from "./opus.js";
import { writeRemotionScaffold } from "./scaffold.js";

function usage(): never {
  console.error(`Usage: make-worker <job.json path>

Example:
  pnpm --filter make-worker start -- fixtures/active-suspension.job.json
`);
  process.exit(1);
}

async function loadEnv(): Promise<void> {
  const envPath = path.join(REPO_ROOT, ".env");
  try {
    const text = await fs.readFile(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    /* .env optional */
  }
}

async function writeStatus(dir: string, status: StatusFile): Promise<void> {
  await fs.writeFile(
    path.join(dir, "status.json"),
    JSON.stringify(status, null, 2) + "\n",
    "utf8",
  );
}

function jobArgFromArgv(argv: string[]): string | undefined {
  const args = argv.slice(2).filter((a) => a !== "--");
  return args[0];
}

async function main(): Promise<void> {
  const arg = jobArgFromArgv(process.argv);
  if (!arg || arg === "-h" || arg === "--help") usage();

  await loadEnv();

  const jobPath = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
  // Also try relative to repo root (pnpm filter often cwd = package dir)
  let rawText: string;
  try {
    rawText = await fs.readFile(jobPath, "utf8");
  } catch {
    const alt = path.join(REPO_ROOT, arg);
    rawText = await fs.readFile(alt, "utf8");
  }

  const parsed = JobSpecSchema.safeParse(JSON.parse(rawText));
  if (!parsed.success) {
    console.error("Invalid JobSpec:", parsed.error.flatten());
    process.exit(1);
  }
  const job = parsed.data;
  assertJobSingleAspect(job);

  const dir = jobDir(job.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(path.join(dir, "script"), { recursive: true });
  await fs.mkdir(path.join(dir, "out"), { recursive: true });

  const size = resolveFromJob(job);
  const now = () => new Date().toISOString();

  await writeStatus(dir, {
    id: job.id,
    status: "making",
    updatedAt: now(),
    job,
    compositionId: size.compositionId,
    width: size.width,
    height: size.height,
    fps: size.fps,
  });

  await fs.writeFile(
    path.join(dir, "job.json"),
    JSON.stringify(job, null, 2) + "\n",
    "utf8",
  );

  console.log(`[make] job=${job.id} aspect=${job.aspect} ${size.width}x${size.height}@${size.fps}`);
  console.log(`[make] workspace=${dir}`);

  let script;
  try {
    script = await callOpusExtra(job.feed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeStatus(dir, {
      id: job.id,
      status: "failed",
      updatedAt: now(),
      job,
      compositionId: size.compositionId,
      width: size.width,
      height: size.height,
      fps: size.fps,
      error: message,
    });
    console.error(`[make] Opus/Packy failed: ${message}`);
    process.exit(1);
  }

  const timeline = {
    version: 1,
    isMock: script.isMock,
    model: script.model,
    jobId: job.id,
    aspect: job.aspect,
    style: job.style,
    voice: job.voice,
    acts: script.acts,
    cues: script.cues,
  };

  await fs.writeFile(
    path.join(dir, "script", "timeline.json"),
    JSON.stringify(timeline, null, 2) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(dir, "script", "narration.txt"),
    script.acts.map((a) => `## ${a.title}\n${a.narration}\n`).join("\n"),
    "utf8",
  );

  if (script.isMock) {
    console.log("[make] PACKY_API_KEY unset → wrote MOCK stub (not real Opus quality)");
  } else {
    console.log(`[make] Opus ok model=${script.model}`);
  }

  await writeRemotionScaffold(path.join(dir, "remotion"), job, size);
  console.log(`[make] remotion scaffold → composition ${size.compositionId}`);

  const qa = runQaGate(job, {
    timeline,
    timelinePath: path.join(dir, "script", "timeline.json"),
    isMock: script.isMock,
    acts: script.acts,
    cues: script.cues,
  });
  const next = statusAfterQa(qa);

  await writeStatus(dir, {
    id: job.id,
    status: next,
    updatedAt: now(),
    job,
    compositionId: size.compositionId,
    width: size.width,
    height: size.height,
    fps: size.fps,
    qa,
  });

  console.log(`[make] QA ${qa.passed ? "PASS" : "FAIL"} → status=${next}`);
  if (!qa.passed) {
    console.error("[make] repair_needed — will not force deliver");
    process.exit(2);
  }
  console.log("[make] ready_to_render");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
