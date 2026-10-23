/* ==========================================================================
   Claude Build — the queue, the steps, and firing the routine.

       CLAUDE_BUILD_TEST_DATABASE_URL=postgres://… npx tsx scripts/test-claude-build.ts

   THE DATABASE'S claude_build_* TABLES ARE WIPED. The routine's fire endpoint
   is a local stub, so what would be sent to Anthropic can be read.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { createServer } from "node:http";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (this: unknown, request: string, ...args: unknown[]) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
} as never;

const url = process.env.CLAUDE_BUILD_TEST_DATABASE_URL;
if (!url) {
  console.log("CLAUDE_BUILD_TEST_DATABASE_URL is not set — skipping (this test needs a throwaway Postgres).");
  process.exit(0);
}
for (const k of Object.keys(process.env)) if (/^postgres(ql)?:\/\//.test(process.env[k] ?? "")) delete process.env[k];
process.env.DATABASE_URL = url;

let failures = 0;
function check(ok: boolean, label: string, detail: unknown = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${!ok && detail !== null ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
}

(async () => {
  const { Pool } = await import("pg");
  const raw = new Pool({ connectionString: url });
  await raw.query("drop table if exists claude_build_jobs; drop table if exists claude_build_settings;");

  const fires: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
  const stub = createServer((rq, rs) => {
    let b = "";
    rq.on("data", (d) => (b += d));
    rq.on("end", () => {
      fires.push({ headers: rq.headers, body: b });
      rs.setHeader("content-type", "application/json");
      rs.end(JSON.stringify({ type: "routine_fire", claude_code_session_id: "session_1", claude_code_session_url: "https://claude.ai/code/session_1" }));
    });
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", () => r()));
  process.env.CLAUDE_BUILD_TRIGGER_URL = `http://127.0.0.1:${(stub.address() as { port: number }).port}/fire`;
  process.env.CLAUDE_BUILD_TRIGGER_TOKEN = "sk-ant-oat01-test";

  const cb = await import("../lib/claudeBuild");

  console.log("start fires the routine, once");
  await cb.saveCriteria("Build premium 7-page stores.");
  const made = await cb.startBuild(3, "skincare", "admin");
  check(made.length === 3 && made.every((j) => j.status === "queued" && j.note === "skincare"), "three sets queued with the note", made);
  check(fires.length === 1, "the routine was fired", fires.length);
  const h = fires[0]?.headers ?? {};
  check(h.authorization === "Bearer sk-ant-oat01-test" && h["anthropic-version"] === "2023-06-01", "with its bearer token and anthropic-version", h);
  check(/claim and build/.test(JSON.parse(fires[0]?.body ?? "{}").text ?? ""), "and a text payload", fires[0]?.body);
  const t = await cb.readTrigger();
  check(t.configured && t.session === "https://claude.ai/code/session_1", "the session link is kept for the panel", t);

  console.log("the routine works the queue");
  const j1 = (await cb.claimJob())!;
  check(j1.status === "running" && j1.step === "claimed", "claim takes the oldest and marks it running", j1);
  await cb.startBuild(1, null, "admin");
  check(fires.length === 1, "a second start while a run is alive does not open another session", fires.length);
  const s1 = await cb.reportStep(j1.id, "html", "page 2/7", null);
  const after = (await cb.jobOf(j1.id))!;
  check(!s1.cancel && after.step === "html" && after.detail === "page 2/7" && after.progress > 0 && after.log.length === 2, "a step is recorded with its detail and progress", after);
  await cb.reportStep(j1.id, "idea", null, 5);
  check((await cb.jobOf(j1.id))!.progress === after.progress, "progress never goes backwards");
  check(await cb.finishJob(j1.id, 7).then(() => false, () => true), "finish is refused before a set exists");
  await cb.attachSet(j1.id, { id: "set1", slug: "glow-lab", name: "Glow Lab" });
  await cb.finishJob(j1.id, 7);
  const done = (await cb.jobOf(j1.id))!;
  check(done.status === "done" && done.progress === 100 && done.pages === 7 && done.setSlug === "glow-lab", "finish: done, 100%, its pages", done);

  console.log("cancel, fail, retry, stale");
  const j2 = (await cb.claimJob())!;
  await cb.cancelJob(j2.id);
  const c = await cb.reportStep(j2.id, "style", null, null);
  check(c.cancel && (await cb.jobOf(j2.id))!.status === "cancelled", "a running job asked to stop stops at its next step");
  const queued = (await cb.listJobs()).filter((j) => j.status === "queued");
  await cb.cancelJob(queued[0].id);
  check((await cb.jobOf(queued[0].id))!.status === "cancelled", "a waiting job is cancelled at once");
  const j3 = (await cb.claimJob())!;
  await cb.failJob(j3.id, "Render check failed");
  check((await cb.jobOf(j3.id))!.status === "failed", "fail records the reason");
  await raw.query("update claude_build_settings set value = null where key = 'trigger'");
  fires.length = 0;
  await cb.retryJob(j3.id);
  check((await cb.jobOf(j3.id))!.status === "queued" && fires.length === 1, "retry queues it again and fires the routine");
  const j4 = (await cb.claimJob())!;
  await raw.query("update claude_build_jobs set heartbeat_at = now() - interval '45 minutes' where id = $1", [j4.id]);
  const listed = await cb.listJobs();
  check(listed.find((j) => j.id === j4.id)?.status === "failed", "a running job silent for 30 minutes is marked failed", listed.find((j) => j.id === j4.id));
  check(await cb.reportStep(j4.id, "html", null, null).then(() => false, () => true), "a dead job takes no more steps");

  console.log("no trigger configured");
  delete process.env.CLAUDE_BUILD_TRIGGER_URL;
  fires.length = 0;
  await cb.startBuild(1, null, "admin");
  check(fires.length === 0 && !(await cb.readTrigger()).configured, "without one, the set waits for the schedule");

  await raw.end();
  stub.close();
  console.log(failures ? `\n${failures} failed` : "\nall passed");
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
