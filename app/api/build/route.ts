import { z } from "zod";
import { currentAccount, remainingPages } from "@/lib/account";
import { cancelBuild, planFor, startBuild } from "@/lib/build/runner";
import { getRepo } from "@/lib/db";
import type { JobStatus } from "@/lib/db/types";
import { briefSchema } from "@/lib/validation";

/* ==========================================================================
   POST /api/build   start one
   GET  /api/build   what is this store's most recent build doing

   The browser no longer runs a build; it asks for one and watches. GET is what
   makes a reload harmless — it answers the same whether the tab that started
   the job is still open, was closed an hour ago, or never existed on this
   device at all.
   ========================================================================== */

export const dynamic = "force-dynamic";

const startSchema = z.object({
  brief: z.unknown(),
  variants: z.record(z.string(), z.number()).default({}),
});

export type JobView = {
  id: string;
  status: JobStatus;
  /** what the deck is meant to contain, so a bar can move before page one */
  plan: { pageId: string; pageType: string; label: string; copyIndex: number; copyTotal: number }[];
  pages: unknown[];
  failures: { pageId: string; label: string; reason: string }[];
  tokens: number;
  error: string | null;
  /** the brief this was built from, so a returning browser can restore it */
  payload: string;
  createdAt: string;
  updatedAt: string;
};

export type BuildResponse =
  | { ok: true; job: JobView | null }
  | { ok: false; error: string };

function view(job: {
  id: string;
  status: JobStatus;
  plan: unknown;
  pages: unknown;
  failures: unknown;
  tokens: number;
  error: string | null;
  payload: string;
  createdAt: string;
  updatedAt: string;
}): JobView {
  return {
    id: job.id,
    status: job.status,
    plan: Array.isArray(job.plan) ? (job.plan as JobView["plan"]) : [],
    pages: Array.isArray(job.pages) ? job.pages : [],
    failures: Array.isArray(job.failures) ? (job.failures as JobView["failures"]) : [],
    tokens: job.tokens,
    error: job.error,
    payload: job.payload,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function GET() {
  const account = await currentAccount();
  if (!account)
    return Response.json({ ok: false, error: "Not signed in." } satisfies BuildResponse, {
      status: 401,
    });

  try {
    const job = await getRepo().latestJob(account.domain);
    return Response.json({ ok: true, job: job ? view(job) : null } satisfies BuildResponse);
  } catch {
    /* No database is not "no build" — saying so would send a merchant back to
       the brief and charge them a second build. */
    return Response.json(
      { ok: false, error: "Couldn't check for a build in progress." } satisfies BuildResponse,
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const account = await currentAccount();
  if (!account)
    return Response.json({ ok: false, error: "Not signed in." } satisfies BuildResponse, {
      status: 401,
    });

  let body: z.infer<typeof startSchema>;
  try {
    body = startSchema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "Malformed request." } satisfies BuildResponse, {
      status: 400,
    });
  }

  const brief = briefSchema.safeParse(body.brief);
  if (!brief.success)
    return Response.json(
      { ok: false, error: "That brief is missing something." } satisfies BuildResponse,
      { status: 400 },
    );

  const plan = planFor(brief.data);
  if (plan.length === 0)
    return Response.json(
      { ok: false, error: "Pick at least one page." } satisfies BuildResponse,
      { status: 400 },
    );

  /* Checked against the plan, not against one page: a merchant with two pages
     left should be told before a thirty-page build starts spending. */
  if (plan.length > remainingPages(account))
    return Response.json(
      {
        ok: false,
        error:
          "Bạn đã vượt quá số page build được cho phép, hãy liên hệ với support để hỗ trợ.",
      } satisfies BuildResponse,
      { status: 403 },
    );

  const repo = getRepo();

  /* One build at a time per store. Two would race on the page allowance and
     leave the merchant watching whichever finished second. */
  const current = await repo.latestJob(account.domain).catch(() => null);
  if (current?.status === "running")
    return Response.json({ ok: true, job: view(current) } satisfies BuildResponse);

  /* Derived from the brief, so pressing Create twice on the same brief lands
     on the same row rather than starting a second build. */
  const jobId = jobIdFor(account.domain, body.brief, body.variants);

  const started = await startBuild(account.domain, brief.data, body.variants, jobId);
  if (!started.ok)
    return Response.json({ ok: false, error: started.error } satisfies BuildResponse, {
      status: 400,
    });

  const job = await repo.getJob(started.jobId);
  return Response.json({ ok: true, job: job ? view(job) : null } satisfies BuildResponse);
}

export async function DELETE() {
  const account = await currentAccount();
  if (!account)
    return Response.json({ ok: false, error: "Not signed in." } satisfies BuildResponse, {
      status: 401,
    });

  const job = await getRepo().latestJob(account.domain).catch(() => null);
  if (!job || job.status !== "running")
    return Response.json({ ok: true, job: job ? view(job) : null } satisfies BuildResponse);

  cancelBuild(job.id);
  /* Marked here as well as by the runner: the runner only notices between
     pages, and the merchant pressed cancel now. */
  await getRepo().updateJob(job.id, { status: "cancelled" }).catch(() => {});

  const after = await getRepo().getJob(job.id).catch(() => null);
  return Response.json({ ok: true, job: after ? view(after) : null } satisfies BuildResponse);
}

/** Same brief, same variants, same store → same job. */
function jobIdFor(domain: string, brief: unknown, variants: Record<string, number>): string {
  const material = `${domain}|${JSON.stringify(brief)}|${JSON.stringify(variants)}`;
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (const ch of material) {
    const code = ch.charCodeAt(0);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b + code, 0x85ebca6b) ^ (b >>> 13);
  }
  return `j${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
}
