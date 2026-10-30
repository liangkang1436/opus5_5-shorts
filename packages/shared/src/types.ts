import { z } from "zod";

/** Locked aspect: choose before make; never dual-render by default. */
export const AspectSchema = z.enum(["9:16", "16:9"]);
export type Aspect = z.infer<typeof AspectSchema>;

export const ResolutionSchema = z.enum(["720p", "1080p"]);
export type Resolution = z.infer<typeof ResolutionSchema>;

export const FpsSchema = z.union([z.literal(30), z.literal(60)]);
export type Fps = z.infer<typeof FpsSchema>;

/** v1: hardcore only */
export const StyleSchema = z.literal("hardcore");
export type Style = z.infer<typeof StyleSchema>;

/** Default voice: 云希 */
export const VoiceSchema = z.enum(["yunxi"]);
export type Voice = z.infer<typeof VoiceSchema>;

export const JobSpecSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/, "id must be alphanumeric / _ / -"),
  feed: z.string().min(1, "feed (plain-text投料) required"),
  aspect: AspectSchema,
  resolution: ResolutionSchema,
  fps: FpsSchema,
  style: StyleSchema.default("hardcore"),
  voice: VoiceSchema.default("yunxi"),
});
export type JobSpec = z.infer<typeof JobSpecSchema>;

export const ProjectStatusSchema = z.enum([
  "pending",
  "making",
  "ready_to_render",
  "rendering",
  "done",
  "repair_needed",
  "failed",
  "render_skipped",
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const QAResultSchema = z.object({
  passed: z.boolean(),
  checks: z.array(
    z.object({
      name: z.string(),
      ok: z.boolean(),
      detail: z.string().optional(),
    }),
  ),
  notes: z.string().optional(),
});
export type QAResult = z.infer<typeof QAResultSchema>;

export const StatusFileSchema = z.object({
  id: z.string(),
  status: ProjectStatusSchema,
  updatedAt: z.string(),
  job: JobSpecSchema,
  compositionId: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: FpsSchema.optional(),
  qa: QAResultSchema.optional(),
  error: z.string().optional(),
  outPath: z.string().optional(),
});
export type StatusFile = z.infer<typeof StatusFileSchema>;
