/* The Claude Build shapes the admin panel (a client component) reads too —
   no server-only imports here. The logic is in claudeBuild.ts. */

export const BUILD_STEPS = [
  { key: "claimed", label: "Nhận việc" },
  { key: "idea", label: "Chọn ngành & ý tưởng" },
  { key: "style", label: "Chọn style" },
  { key: "html", label: "Dựng HTML" },
  { key: "review", label: "Review page" },
  { key: "pagefly", label: "Dựng trong store Logan" },
  { key: "check", label: "So với HTML" },
  { key: "upload", label: "Upload HTML" },
] as const;
export type BuildStepKey = (typeof BUILD_STEPS)[number]["key"];
export const isBuildStep = (k: unknown): k is BuildStepKey => BUILD_STEPS.some((s) => s.key === k);

/* "export": the routine built every page in the Logan store and moved on;
   the set waits for an admin to export the pages from the PageFly editor
   and drop the file on the panel, which stores each page's .pagefly. */
export type BuildJobStatus = "queued" | "running" | "export" | "done" | "failed" | "cancelled";

/** One page the routine built in the Logan store, waiting for its export. */
export type LoganPage = {
  /** the page's slug in the set: home, product-page, … */
  slug: string;
  /** its display name in the set: Home, Product, … */
  label: string;
  /** its title in the Logan store — "<Set> - <Label>", what the export names its entry after */
  title: string;
  /** gid://pagefly/Page/<id> in the Logan store */
  pageId: string | null;
  /** the page in the PageFly editor, to export it from */
  editorUrl: string | null;
  /** the draft inside the live theme */
  previewUrl: string | null;
};

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
  /** the pages built in the Logan store, once the routine reported them ("built") */
  loganPages: LoganPage[];
  error: string | null;
  cancelRequested: boolean;
  requestedBy: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
};

export type BuildTrigger = {
  configured: boolean;
  lastFiredAt: string | null;
  lastResult: string | null;
  session: string | null;
  /** Where the trigger token comes from: the VPS env, the admin panel, or nowhere. */
  tokenFrom: "env" | "panel" | null;
  /** The token's last 4 characters, never more. */
  tokenEnd: string | null;
};

