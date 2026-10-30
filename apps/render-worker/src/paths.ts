import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../..");

export function jobDir(jobId: string): string {
  return path.join(REPO_ROOT, ".data", "jobs", jobId);
}
