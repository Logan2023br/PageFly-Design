import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* ==========================================================================
   A BROWSER, DRIVEN OVER THE DEVTOOLS PROTOCOL.

   NOT PLAYWRIGHT, and the reason is where this runs. The export path lives on a
   self-hosted VPS whose deploy hook runs `npm run build` in place over the
   directory it is serving; a devDependency that downloads three browsers on
   install is 300 MB and a postinstall step in exactly the place this project
   has already had an outage. Chrome is one binary that is either present or
   not, and when it is not, `launch` says so and the caller carries on without
   the check — which is the correct behaviour for a fidelity check, since a page
   that cannot be measured must still be exported.

   NODE 22 HAS `WebSocket`. That was the only thing Playwright was really being
   asked for: a websocket client. The rest of the protocol is JSON over it.
   ========================================================================== */

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
].filter((p): p is string => typeof p === "string" && p !== "");

/** The binary, or null when this machine has none. */
export function chromePath(): string | null {
  return CHROME_PATHS.find((p) => existsSync(p)) ?? null;
}

type Message = { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message: string } };

export type Session = {
  /** run an expression in the page and get its JSON value back */
  evaluate: <T>(expression: string) => Promise<T>;
  /** navigate and wait for load */
  open: (url: string) => Promise<void>;
  /** set the viewport, in CSS pixels */
  resize: (width: number, height: number) => Promise<void>;
  /** a PNG of the whole page, or of one rectangle of it */
  shoot: (clip?: { x: number; y: number; width: number; height: number }) => Promise<Uint8Array>;
  close: () => Promise<void>;
};

/**
 * Launch a headless Chrome and open one page in it.
 *
 * Returns null rather than throwing when there is no browser: this is a check,
 * and a missing check must never be the reason a merchant's export fails.
 */
export async function launch(): Promise<Session | null> {
  const bin = chromePath();
  if (!bin) return null;

  const profile = mkdtempSync(join(tmpdir(), "pfd-chrome-"));
  let child: ChildProcess;
  let wsUrl: string;
  try {
    child = spawn(
      bin,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--hide-scrollbars",
        "--disable-extensions",
        "--disable-background-networking",
        "--force-device-scale-factor=1",
        `--user-data-dir=${profile}`,
        "--remote-debugging-port=0",
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    wsUrl = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("chrome did not start in 15s")), 15_000);
      let buffer = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const found = /ws:\/\/[^\s]+/.exec(buffer);
        if (found) {
          clearTimeout(timer);
          resolve(found[0]);
        }
      });
      child.on("exit", () => {
        clearTimeout(timer);
        reject(new Error("chrome exited before it was ready"));
      });
    });
  } catch {
    rmSync(profile, { recursive: true, force: true });
    return null;
  }

  const socket = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error("could not connect to chrome"));
  });

  let nextId = 0;
  const waiting = new Map<number, { ok: (v: unknown) => void; no: (e: Error) => void }>();
  const events = new Map<string, (() => void)[]>();
  socket.onmessage = (e) => {
    const msg = JSON.parse(String(e.data)) as Message & { sessionId?: string };
    if (typeof msg.id === "number") {
      const slot = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (!slot) return;
      if (msg.error) slot.no(new Error(msg.error.message));
      else slot.ok(msg.result);
      return;
    }
    if (msg.method) {
      const list = events.get(msg.method) ?? [];
      events.set(msg.method, []);
      for (const fn of list) fn();
    }
  };

  /* A box rather than a variable, because `send` closes over it AND is what
     performs the attach that fills it: the two calls that set it up are sent
     before there is a session, and every call after carries one. */
  const state: { sessionId?: string } = {};
  const send = <T>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
    const id = ++nextId;
    return new Promise<T>((ok, no) => {
      waiting.set(id, { ok: ok as (v: unknown) => void, no });
      socket.send(
        JSON.stringify({ id, method, params, ...(state.sessionId ? { sessionId: state.sessionId } : {}) }),
      );
    });
  };
  const once = (method: string, ms: number): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      const list = events.get(method) ?? [];
      list.push(() => {
        clearTimeout(timer);
        resolve();
      });
      events.set(method, list);
    });

  const { targetId } = await send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const attached = await send<{ sessionId: string }>("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  state.sessionId = attached.sessionId;
  await send("Page.enable");
  await send("Runtime.enable");

  const close = async (): Promise<void> => {
    try {
      socket.close();
    } catch {
      /* already gone */
    }
    child.kill();
    /* Chrome writes its profile out as it dies, so the directory is often not
       empty at the instant the socket closes. Retried rather than raced: a
       leftover temp directory is nothing, an exception here would abort an
       export that had already succeeded. */
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* the operating system will get it */
    }
  };

  return {
    async open(url) {
      const loaded = once("Page.loadEventFired", 20_000);
      await send("Page.navigate", { url });
      await loaded;
    },
    async resize(width, height) {
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
    },
    async evaluate<T>(expression: string) {
      const res = await send<{ result: { value: T }; exceptionDetails?: { text: string } }>(
        "Runtime.evaluate",
        { expression, returnByValue: true, awaitPromise: true },
      );
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
      return res.result.value;
    },
    async shoot(clip) {
      const { data } = await send<{ data: string }>("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
      });
      return Uint8Array.from(Buffer.from(data, "base64"));
    },
    close,
  };
}
