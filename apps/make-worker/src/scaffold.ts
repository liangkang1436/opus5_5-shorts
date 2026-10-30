import fs from "node:fs/promises";
import path from "node:path";
import type { JobSpec } from "@opus5_5/shared";
import type { CompositionSize } from "@opus5_5/pipeline";

/** Remotion 4.x pin — keep remotion / @remotion/* exact-aligned. */
const REMOTION_VERSION = "4.0.539";
const REACT_VERSION = "19.0.0";
const REACT_TYPES_VERSION = "19.0.10";
/** @types/react-dom@19.0.10 does not exist on npm (ETARGET). */
const REACT_DOM_TYPES_VERSION = "19.0.4";

/** Smoke stub length in seconds (not the full explainer length). */
const SMOKE_DURATION_SECONDS = 3;

/** Minimal Remotion single-composition stub for the selected aspect only. */
export async function writeRemotionScaffold(
  remotionDir: string,
  job: JobSpec,
  size: CompositionSize,
): Promise<void> {
  await fs.mkdir(path.join(remotionDir, "src"), { recursive: true });

  // Remotion Composition `id` may contain hyphens; the React export must be a valid JS identifier.
  // Never derive the export name from compositionId (hyphenated ids are invalid as identifiers).
  const componentName = "HardcoreSmokeComposition";
  const durationInFrames = `${size.fps} * ${SMOKE_DURATION_SECONDS}`;

  const compositionTsx = `/**
 * Knife-1 Remotion stub — SINGLE composition for ${job.aspect}.
 * Dual H+V default is intentionally NOT generated.
 * Smoke duration: ${SMOKE_DURATION_SECONDS}s (${durationInFrames} frames).
 * Composition id (Remotion): ${size.compositionId} — hyphens only, no underscores.
 */
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";

export const ${componentName}: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#2a2a2e", color: "#e8e8ea", fontFamily: "system-ui" }}>
      <Sequence from={0}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 48 }}>
          <div>
            <div style={{ fontSize: 28, opacity: 0.7 }}>opus5_5-shorts / hardcore</div>
            <div style={{ fontSize: 48, marginTop: 12 }}>{\`${job.id}\`}</div>
            <div style={{ fontSize: 22, marginTop: 24, opacity: 0.85 }}>
              {\`${size.width}×${size.height} @ ${size.fps}fps · ${job.aspect}\`}
            </div>
            <div style={{ fontSize: 18, marginTop: 16, opacity: 0.6 }}>
              {\`${SMOKE_DURATION_SECONDS}s smoke stub — replace with Three.js ClayCar later\`}
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
`;

  const indexTs = `import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";
registerRoot(RemotionRoot);
`;

  const rootComp = `import React from "react";
import { Composition } from "remotion";
import { ${componentName} } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="${size.compositionId}"
        component={${componentName}}
        durationInFrames={${durationInFrames}}
        fps={${size.fps}}
        width={${size.width}}
        height={${size.height}}
      />
      {/* Intentionally no second composition for the other aspect */}
    </>
  );
};
`;

  const remotionConfig = `import { Config } from "@remotion/cli/config";

/**
 * Knife-1 Remotion config.
 * Chromium OpenGL default here is "angle".
 * Real GPU path on Windows / NVIDIA: pass CLI \`--gl=angle-egl\`
 * (render-worker always adds that flag; CLI overrides this setting).
 */
Config.setChromiumOpenGlRenderer("angle");
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setEntryPoint("./src/index.ts");
`;

  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ES2022",
      moduleResolution: "bundler",
      jsx: "react-jsx",
      strict: true,
      noEmit: true,
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      isolatedModules: true,
      resolveJsonModule: true,
      allowSyntheticDefaultImports: true,
    },
    include: ["src/**/*", "remotion.config.ts"],
    exclude: ["node_modules"],
  };

  const pkg = {
    name: `job-${job.id}-remotion`,
    private: true,
    version: "0.0.0",
    scripts: {
      render: `npx remotion render src/index.ts ${size.compositionId} ../out/final.mp4 --gl=angle-egl`,
      studio: "npx remotion studio src/index.ts",
    },
    dependencies: {
      "@remotion/cli": REMOTION_VERSION,
      "@remotion/renderer": REMOTION_VERSION,
      remotion: REMOTION_VERSION,
      react: REACT_VERSION,
      "react-dom": REACT_VERSION,
    },
    devDependencies: {
      "@types/react": REACT_TYPES_VERSION,
      "@types/react-dom": REACT_DOM_TYPES_VERSION,
      typescript: "5.8.2",
    },
  };

  await fs.writeFile(
    path.join(remotionDir, "src", "Composition.tsx"),
    compositionTsx,
    "utf8",
  );
  await fs.writeFile(path.join(remotionDir, "src", "Root.tsx"), rootComp, "utf8");
  await fs.writeFile(path.join(remotionDir, "src", "index.ts"), indexTs, "utf8");
  await fs.writeFile(
    path.join(remotionDir, "remotion.config.ts"),
    remotionConfig,
    "utf8",
  );
  await fs.writeFile(
    path.join(remotionDir, "tsconfig.json"),
    JSON.stringify(tsconfig, null, 2) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(remotionDir, "package.json"),
    JSON.stringify(pkg, null, 2) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(remotionDir, "composition.json"),
    JSON.stringify(
      {
        compositionId: size.compositionId,
        width: size.width,
        height: size.height,
        fps: size.fps,
        aspect: job.aspect,
        dual: false,
        smokeDurationSeconds: SMOKE_DURATION_SECONDS,
        durationInFrames: size.fps * SMOKE_DURATION_SECONDS,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}
