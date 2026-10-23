/* The Claude Build shapes the admin panel (a client component) reads too —
   no server-only imports here. The logic is in claudeBuild.ts. */

export const BUILD_STEPS = [
  { key: "claimed", label: "Nhận việc" },
  { key: "idea", label: "Chọn ngành & ý tưởng" },
  { key: "style", label: "Chọn style" },
  { key: "html", label: "Dựng HTML" },
  { key: "review", label: "Review page" },
  { key: "pagefly", label: "Chuyển .pagefly" },
  { key: "check", label: "Kiểm tra render" },
  { key: "upload", label: "Upload vào PageFly Design" },
] as const;
export type BuildStepKey = (typeof BUILD_STEPS)[number]["key"];
export const isBuildStep = (k: unknown): k is BuildStepKey => BUILD_STEPS.some((s) => s.key === k);

export type BuildJobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export type BuildJob = {
  id: string;
  /** what the admin typed for this batch — a theme, an industry, or nothing */
  note: string | null;
  status: BuildJobStatus;
  step: BuildStepKey | null;
  /** the routine's own words for where it is: "page 3/7, review round 2" */
  detail: string | null;
  /** 0–100, the routine's estimate or the step's place in BUILD_STEPS */
  progress: number;
  /** every step it reported, oldest first (the last 60) */
  log: { at: string; step: string; detail: string | null }[];
  setId: string | null;
  setSlug: string | null;
  setName: string | null;
  pages: number;
  error: string | null;
  cancelRequested: boolean;
  requestedBy: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
};

export type BuildTrigger = { configured: boolean; lastFiredAt: string | null; lastResult: string | null; session: string | null };

