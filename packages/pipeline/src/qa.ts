import type { JobSpec, QAResult } from "@opus5_5/shared";

export interface ScriptArtifact {
  /** Must be present and non-empty for QA to pass. */
  timelinePath?: string;
  timeline?: unknown;
  /** Mock stubs set this so QA knows they are not production Opus output. */
  isMock?: boolean;
  acts?: unknown[];
  cues?: unknown[];
}

/**
 * Knife-1 QA gate: structural checks only.
 * Fail → caller must set status repair_needed; never force-deliver.
 */
export function runQaGate(job: JobSpec, artifact: ScriptArtifact): QAResult {
  const checks: QAResult["checks"] = [];

  checks.push({
    name: "feed_nonempty",
    ok: job.feed.trim().length > 0,
    detail: job.feed.trim().length === 0 ? "feed empty" : undefined,
  });

  checks.push({
    name: "single_aspect",
    ok: job.aspect === "9:16" || job.aspect === "16:9",
    detail: `aspect=${job.aspect}`,
  });

  checks.push({
    name: "style_hardcore",
    ok: job.style === "hardcore",
    detail: `style=${job.style}`,
  });

  const hasTimeline =
    Boolean(artifact.timeline) ||
    Boolean(artifact.timelinePath) ||
    (Array.isArray(artifact.acts) && artifact.acts.length > 0);

  checks.push({
    name: "timeline_present",
    ok: hasTimeline,
    detail: hasTimeline ? undefined : "missing timeline/acts",
  });

  // Mock is allowed to pass structural QA in knife-1 dry-run,
  // but we record the flag for operators.
  if (artifact.isMock) {
    checks.push({
      name: "mock_stub_ok",
      ok: true,
      detail: "PACKY_API_KEY unset — mock script stub (not real Opus quality)",
    });
  }

  const passed = checks.every((c) => c.ok);
  return {
    passed,
    checks,
    notes: passed
      ? artifact.isMock
        ? "QA passed (mock stub). Do not ship as production script."
        : "QA passed."
      : "QA failed — set status repair_needed; do not deliver.",
  };
}

/** Helper: if QA fails, status must become repair_needed (never done). */
export function statusAfterQa(qa: QAResult): "ready_to_render" | "repair_needed" {
  return qa.passed ? "ready_to_render" : "repair_needed";
}
