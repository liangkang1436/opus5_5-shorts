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

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Job remotion/ package.json lists remotion deps.
 * If node_modules/remotion is missing, install there before render.
 */
async function ensureRemotionInstalled(remotionDir: string): Promise<void> {
  const marker = path.join(remotionDir, "node_modules", "remotion");
  if (await pathExists(marker)) {
    console.log(`[render] remotion present → ${marker}`);
    return;
  }

  const pkgPath = path.join(remotionDir, "package.json");
  if (!(await pathExists(pkgPath))) {
    throw new Error(
      `missing ${pkgPath} — run make-worker first so scaffold writes remotion/package.json`,
    );
  }

  console.log(
    "[render] remotion/node_modules/remotion missing — installing job remotion deps…",
  );
  console.log(`[render] cwd=${remotionDir}`);

  // Prefer npm: plain `pnpm install` inside .data/jobs/<id>/remotion walks up into
  // the monorepo workspace and installs nothing locally (Windows LK-DEV bug).
  let code: number;
  try {
    console.log("[render] trying: npm install");
    code = await run("npm", ["install"], remotionDir);
  } catch (err) {
    console.warn(
      `[render] npm spawn failed (${err instanceof Error ? err.message : String(err)}), falling back to pnpm --ignore-workspace`,
    );
    code = 1;
  }

  if (code !== 0) {
    try {
      console.log("[render] trying: pnpm install --ignore-workspace");
      code = await run("pnpm", ["install", "--ignore-workspace"], remotionDir);
    } catch (err) {
      console.warn(
        `[render] pnpm spawn failed (${err instanceof Error ? err.message : String(err)})`,
      );
      code = 1;
    }
  }

  if (code !== 0) {
    throw new Error(
      `failed to install remotion deps in ${remotionDir} (npm/pnpm exit ${code})`,
    );
  }

  if (!(await pathExists(marker))) {
    throw new Error(
      `install finished but ${marker} still missing — check remotion/package.json dependencies`,
    );
  }
  console.log("[render] remotion deps installed for this job");
}

async function main(): Promise<void> {
  const { jobId, jobDirPath, skipRender } = parseArgs(
    process.argv.slice(2).filter((a) => a !== "--"),
  );
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
    console.error(
      "[render] refuse: status=repair_needed (QA fail → repair only, never force deliver)",
    );
    process.exit(2);
  }
  if (
    status.status !== "ready_to_render" &&
    status.status !== "render_skipped" &&
    status.status !== "done"
  ) {
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
      JSON.parse(
        await fs.readFile(path.join(remotionDir, "composition.json"), "utf8"),
      ) as {
        compositionId: string;
      }
    ).compositionId;

  const now = () => new Date().toISOString();
  const intendedCmd = `npx remotion render src/index.ts ${compositionId} ../out/final.mp4 --gl=angle-egl`;

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
          intendedCommand: intendedCmd,
          remotionCwd: remotionDir,
          writtenAt: now(),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    console.log(`[render] skipped — placeholder mp4 → ${outMp4}`);
    console.log(`[render] intended: cd ${remotionDir} && ${intendedCmd}`);
    return;
  }

  status = {
    ...status,
    status: "rendering",
    updatedAt: now(),
  };
  await writeStatus(dir, status);

  try {
    await ensureRemotionInstalled(remotionDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeStatus(dir, {
      ...status,
      status: "failed",
      updatedAt: now(),
      error: message,
    });
    console.error(`[render] remotion install failed: ${message}`);
    console.error(
      "[render] Hint: from repo root run `pnpm run install:remotion`, or fix remotion/package.json, or use --skip-render",
    );
    process.exit(1);
  }

  // Prefer npx remotion with documented --gl=angle-egl (GPU on Windows / NVIDIA)
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
