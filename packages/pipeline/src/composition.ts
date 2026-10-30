import type { Aspect, Resolution, Fps, JobSpec } from "@opus5_5/shared";

export interface CompositionSize {
  width: number;
  height: number;
  fps: Fps;
  compositionId: string;
}

const RES_MAP: Record<Resolution, { short: number; long: number }> = {
  "720p": { short: 720, long: 1280 },
  "1080p": { short: 1080, long: 1920 },
};

/**
 * Resolve a single Remotion composition size from locked aspect + resolution.
 * Never returns dual (H+V) sizes.
 * compositionId uses hyphens only — Remotion forbids `_` in composition ids.
 */
export function resolveCompositionSize(
  aspect: Aspect,
  resolution: Resolution,
  fps: Fps,
): CompositionSize {
  const { short, long } = RES_MAP[resolution];
  if (aspect === "9:16") {
    return {
      width: short,
      height: long,
      fps,
      compositionId: `Hardcore-${resolution}-9x16-${fps}`,
    };
  }
  return {
    width: long,
    height: short,
    fps,
    compositionId: `Hardcore-${resolution}-16x9-${fps}`,
  };
}

export function resolveFromJob(job: JobSpec): CompositionSize {
  return resolveCompositionSize(job.aspect, job.resolution, job.fps);
}

/**
 * Guard: job must carry exactly one aspect. Throws if caller tries to
 * request dual rendering (e.g. passing an array of aspects).
 */
export function assertSingleAspect(
  aspects: Aspect | Aspect[] | unknown,
): asserts aspects is Aspect {
  if (Array.isArray(aspects)) {
    if (aspects.length !== 1) {
      throw new Error(
        `Dual/multi aspect not allowed in knife-1 (got ${aspects.length} aspects). Choose 9:16 OR 16:9 before make.`,
      );
    }
    assertSingleAspect(aspects[0]);
    return;
  }
  if (aspects !== "9:16" && aspects !== "16:9") {
    throw new Error(`Invalid aspect: ${String(aspects)}. Expected "9:16" | "16:9".`);
  }
}

/** Assert job.spec never implies dual output. */
export function assertJobSingleAspect(job: JobSpec): void {
  assertSingleAspect(job.aspect);
}
