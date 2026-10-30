import fs from "node:fs/promises";
import path from "node:path";
import type { JobSpec } from "@opus5_5/shared";
import type { CompositionSize } from "@opus5_5/pipeline";

/** Minimal Remotion-like single-composition stub for the selected aspect only. */
export async function writeRemotionScaffold(
  remotionDir: string,
  job: JobSpec,
  size: CompositionSize,
): Promise<void> {
  await fs.mkdir(path.join(remotionDir, "src"), { recursive: true });

  const rootTsx = `/**
 * Knife-1 Remotion stub — SINGLE composition for ${job.aspect}.
 * Dual H+V default is intentionally NOT generated.
 */
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";

export const ${size.compositionId.replace(/[^a-zA-Z0-9_]/g, "_")}Composition: React.FC = () => {
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
              Replace with Three.js ClayCar / hardcore scenes in later patches.
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
`;

  const rootId = size.compositionId.replace(/[^a-zA-Z0-9_]/g, "_");

  const indexTs = `import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";
registerRoot(RemotionRoot);
`;

  const rootComp = `import React from "react";
import { Composition } from "remotion";
import { ${rootId}Composition } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="${size.compositionId}"
        component={${rootId}Composition}
        durationInFrames={${size.fps} * 40}
        fps={${size.fps}}
        width={${size.width}}
        height={${size.height}}
      />
      {/* Intentionally no second composition for the other aspect */}
    </>
  );
};
`;

  const pkg = {
    name: `job-${job.id}-remotion`,
    private: true,
    version: "0.0.0",
    scripts: {
      render: `npx remotion render src/index.ts ${size.compositionId} ../out/final.mp4 --gl=angle-egl`,
    },
  };

  await fs.writeFile(path.join(remotionDir, "src", "Composition.tsx"), rootTsx, "utf8");
  await fs.writeFile(path.join(remotionDir, "src", "Root.tsx"), rootComp, "utf8");
  await fs.writeFile(path.join(remotionDir, "src", "index.ts"), indexTs, "utf8");
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
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}
