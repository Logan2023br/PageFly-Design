#!/usr/bin/env python3
"""The Claude Review run's bookkeeping — what the admin panel shows.

  python3 runner.py begin                 -> prints GO or NOOP <why>. GO: the run is "running", the queue is set.
  python3 runner.py next                  -> prints the next set's slug (or NONE)
  python3 runner.py step <slug> <text>    -> "now: <set> — <text>"
  python3 runner.py finish <slug> <done|reimport|skipped|failed> [--note T] [--folder F] [--secs N]
  python3 runner.py stop?                 -> prints STOP when the admin pressed Stop (and records "stopped")
  python3 runner.py seq                   -> how many sets already went to an output folder (for the 20-per-folder count)
  python3 runner.py state                 -> the raw state
  python3 runner.py error <slug|-> <step> <message>   -> log an error (shown in red on the admin panel)
  python3 runner.py run <slug> <step> -- <command ...> -> step + run the command; on failure the error
                                                         (last lines of its output) is logged, exit code kept.
                                                         The heartbeat is kept fresh while it runs.
  python3 runner.py release               -> end of a firing that did not finish the queue: "running" -> "requested",
                                             so the next firing starts at once instead of waiting for a stale heartbeat

Queue rule: every set nobody has reviewed, plus sets Claude took but did not finish ("Claude
Reviewing"), in the admin's order. A set this run finished as "reimport" is not picked again (it waits for
Tu to import it again). A set with any Done review — Claude's included — is left alone. Hidden and paid sets are recorded as skipped (the public API gives no .pagefly).
"""
import json, sys, time
from datetime import datetime, timezone
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from common import jreq, all_sets  # noqa

P = "/api/admin/collection-pages/claude-review"
STALE = 10 * 60   # `run` beats every 2 min, so 10 min of silence means the firing died


def now(): return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def state():
    c, d = jreq("GET", P); assert c == 200 and d.get("ok"), (c, d); return d["state"]


def put(**patch):
    c, d = jreq("PUT", P, patch); assert c == 200 and d.get("ok"), (c, d); return d["state"]


def age(iso):
    return 1e9 if not iso else time.time() - datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def begin():
    s = state()
    if s["status"] not in ("requested", "running"):
        return print("NOOP status", s["status"])
    if s["status"] == "running" and age(s.get("heartbeatAt")) < STALE and "--force" not in sys.argv:
        return print("NOOP another run is alive (heartbeat %ds ago)" % age(s["heartbeatAt"]))
    finished = {d["slug"] for d in s.get("done", []) if d["result"] in ("done", "skipped", "reimport")}
    queue, skipped = [], []
    for x in all_sets():
        rv = x.get("review")
        if rv and rv["reviewer"] != "Claude": continue           # a TS member has it
        if rv and rv.get("doneAt"): continue                     # already reviewed (Claude Done too)
        if x["slug"] in finished: continue
        if x["visibility"] == "hidden" or x["access"] == "paid":
            skipped.append({"slug": x["slug"], "name": x["name"], "result": "skipped", "finishedAt": now(),
                            "note": f"{x['visibility']}/{x['access']}: the public API gives no .pagefly"})
            continue
        queue.append({"slug": x["slug"], "name": x["name"]})
    put(status="running" if queue else "finished", startedAt=s.get("startedAt") or now(), queue=queue, current=None,
        done=s.get("done", []) + [k for k in skipped if k["slug"] not in finished],
        message=f"Run resumed {now()}" if s["status"] == "running" else None)
    print("GO", len(queue), "sets")


def nxt():
    q = state()["queue"]; print(q[0]["slug"] if q else "NONE")


def step(slug, text):
    s = state(); name = next((q["name"] for q in s["queue"] if q["slug"] == slug), slug)
    cur = s.get("current") or {}
    started = cur.get("startedAt") if cur.get("slug") == slug else now()
    put(status="running", current={"slug": slug, "name": name, "step": text, "startedAt": started})


def error(slug, step_name, message):
    s = state()
    name = None
    if slug and slug != "-":
        name = next((q["name"] for q in s["queue"] if q["slug"] == slug), None) \
            or next((d["name"] for d in s.get("done", []) if d["slug"] == slug), slug)
    e = {"at": now(), "slug": None if slug in (None, "-") else slug, "name": name,
         "step": step_name[:200], "message": message.strip()[-2000:] or "(no message)"}
    put(errors=(s.get("errors") or []) + [e])
    print("error logged:", e["step"], "-", e["message"][:200])


def run(slug, step_name, cmd):
    import subprocess, threading
    step(slug, step_name)
    if cmd and cmd[0] in ("python3", "python"):
        cmd = [sys.executable] + cmd[1:]          # the interpreter `cr` picked, with the packages
    stop = threading.Event()

    def beat():
        while not stop.wait(120):
            try: put()
            except Exception: pass
    threading.Thread(target=beat, daemon=True).start()
    try:
        r = subprocess.run(cmd, capture_output=True, text=True)
    finally:
        stop.set()
    sys.stdout.write(r.stdout); sys.stderr.write(r.stderr)
    if r.returncode != 0:
        tail = "\n".join((r.stderr or r.stdout).strip().splitlines()[-12:])
        error(slug, step_name, f"`{' '.join(cmd)[:200]}` exited {r.returncode}:\n{tail}")
    sys.exit(r.returncode)


def finish(slug, result, note=None, folder=None, secs=None):
    s = state(); name = next((q["name"] for q in s["queue"] if q["slug"] == slug), slug)
    cur = s.get("current") or {}
    if secs is None and cur.get("slug") == slug: secs = round(age(cur["startedAt"]))
    item = {"slug": slug, "name": name, "result": result, "finishedAt": now()}
    if note: item["note"] = note
    if folder: item["folder"] = folder
    if secs is not None: item["secs"] = float(secs)
    done = [d for d in s.get("done", []) if d["slug"] != slug] + [item]
    timed = [d["secs"] for d in done if d.get("secs") and d["result"] in ("done", "reimport")]
    queue = [q for q in s["queue"] if q["slug"] != slug]
    status = s["status"]
    if not queue: status = "finished"
    put(done=done, queue=queue, current=None, status=status,
        avgSecs=(sum(timed) / len(timed)) if timed else s.get("avgSecs"))
    print("finished", slug, result, "left", len(queue))


def stopq():
    s = state()
    if s["status"] == "stopping":
        put(status="stopped", current=None); print("STOP")
    else: print("GO")


def release():
    s = state()
    if s["status"] == "running":
        put(status="requested", current=None); print("released")
    else: print("left as", s["status"])


def seq():
    print(sum(1 for d in state().get("done", []) if d.get("folder")))


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a: raise SystemExit(__doc__)
    def opt(k):
        return a[a.index(k) + 1] if k in a else None
    {"begin": begin, "next": nxt, "stop?": stopq, "seq": seq, "release": release,
     "state": lambda: print(json.dumps(state(), indent=1, ensure_ascii=False))}.get(a[0], lambda: None)()
    if a[0] == "step": step(a[1], " ".join(a[2:]))
    if a[0] == "finish":
        finish(a[1], a[2], opt("--note"), opt("--folder"), opt("--secs"))
        if a[2] == "failed": error(a[1], "set failed", opt("--note") or "failed")
    if a[0] == "error": error(a[1], a[2], " ".join(a[3:]))
    if a[0] == "run": run(a[1], a[2], a[a.index("--") + 1:])
