#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { StatusFileSchema, type StatusFile } from "@opus5_5/shared";
import { REPO_ROOT, jobDir } from "./paths.js";
import { writeTinyPlaceholderMp4 } from "./placeholder-mp4.js";

function usage(): never {
  console.error(`Usage: render-worker --job <id> [--skip-render] [--job-dir <path>]

Examples:
  pnpm --filter render-worker start -- --job active-suspension-demo --skip-render
  pnpm --filter render-worker start -- --job active-suspension-demo
`);
  process.exit(1);
}

function parseArgs(argv: string[]): {
  jobId?: string;
  jobDirPath?: string;
  skipRender: boolean;
} {
  let jobId: string | undefined;
  let jobDirPath: string | undefined;
  let skipRender = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--job" || a === "-j") {
      jobId = argv[++i];
    } else if (a === "--job-dir") {
      jobDirPath = argv[++i];
    } else if (a === "--skip-render") {
      skipRender = true;
    } else if (a === "-h" || a === "--help") {
      usage();
    } else if (!a.startsWith("-") && !jobId) {
      jobId = a;
    }
  }
  return { jobId, jobDirPath, skipRender };
}

async function writeStatus(dir: string, status: StatusFile): Promise<void> {
  await fs.writeFile(
    path.join(dir, "status.json"),
    JSON.stringify(status, null, 2) + "\n",
    "utf8",
  );
}

function run(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  const { jobId, jobDirPath, skipRender } = parseArgs(process.argv.slice(2).filter((a) => a !== "--"));
  if (!jobId && !jobDirPath) usage();

  const dir = jobDirPath
    ? path.isAbsolute(jobDirPath)
      ? jobDirPath
      : path.resolve(process.cwd(), jobDirPath)
    : jobDir(jobId!);

  const statusPath = path.join(dir, "status.json");
  let statusRaw: string;
  try {
    statusRaw = await fs.readFile(statusPath, "utf8");
  } catch {
    console.error(`[render] missing status.json at ${statusPath} — run make-worker first`);
    process.exit(1);
  }

  const statusParse = StatusFileSchema.safeParse(JSON.parse(statusRaw));
  if (!statusParse.success) {
    console.error("[render] invalid status.json", statusParse.error.flatten());
    process.exit(1);
  }
  let status = statusParse.data;

  if (status.status === "repair_needed") {
    console.error("[render] refuse: status=repair_needed (QA fail → repair only, never force deliver)");
    process.exit(2);
  }
  if (status.status !== "ready_to_render" && status.status !== "render_skipped" && status.status !== "done") {
    console.error(`[render] refuse: status=${status.status} (expected ready_to_render)`);
    process.exit(1);
  }

  const remotionDir = path.join(dir, "remotion");
  const outDir = path.join(dir, "out");
  await fs.mkdir(outDir, { recursive: true });
  const outMp4 = path.join(outDir, "final.mp4");
  const compositionId =
    status.compositionId ??
    (
      JSON.parse(await fs.readFile(path.join(remotionDir, "composition.json"), "utf8")) as {
        compositionId: string;
      }
    ).compositionId;

  const now = () => new Date().toISOString();

  if (skipRender) {
    await writeStatus(dir, {
      ...status,
      status: "render_skipped",
      updatedAt: now(),
      outPath: outMp4,
    });
    await writeTinyPlaceholderMp4(outMp4);
    await fs.writeFile(
      path.join(outDir, "skipped.json"),
      JSON.stringify(
        {
          skipped: true,
          reason: "--skip-render",
          intendedCommand: `npx remotion render src/index.ts ${compositionId} ../out/final.mp4 --gl=angle-egl`,
          remotionCwd: remotionDir,
          writtenAt: now(),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    console.log(`[render] skipped — placeholder mp4 → ${outMp4}`);
    console.log(
      `[render] intended: cd ${remotionDir} && npx remotion render src/index.ts ${compositionId} ../out/final.mp4 --gl=angle-egl`,
    );
    return;
  }

  status = {
    ...status,
    status: "rendering",
    updatedAt: now(),
  };
  await writeStatus(dir, status);

  // Prefer npx remotion with documented --gl=angle-egl
  const args = [
    "remotion",
    "render",
    "src/index.ts",
    compositionId,
    path.resolve(outMp4),
    "--gl=angle-egl",
  ];
  console.log(`[render] npx ${args.join(" ")}`);
  console.log(`[render] cwd=${remotionDir}`);

  let code: number;
  try {
    code = await run("npx", args, remotionDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeStatus(dir, {
      ...status,
      status: "failed",
      updatedAt: now(),
      error: message,
    });
    console.error(`[render] spawn failed: ${message}`);
    console.error(
      "[render] Hint: install remotion in the job remotion folder or monorepo; or use --skip-render",
    );
    process.exit(1);
  }

  if (code !== 0) {
    await writeStatus(dir, {
      ...status,
      status: "failed",
      updatedAt: now(),
      error: `remotion exit ${code}`,
    });
    process.exit(code);
  }

  await writeStatus(dir, {
    ...status,
    status: "done",
    updatedAt: now(),
    outPath: outMp4,
  });
  console.log(`[render] done → ${outMp4}`);
  void REPO_ROOT;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
