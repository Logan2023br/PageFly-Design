import "server-only";

import { connection } from "./settings";

/* ==========================================================================
   The three services, as thin as they can be: Mixpanel's raw export (who
   picked a Store set), AC2 (the store behind a domain) and Crisp (what they
   said to us, whether they reviewed us, and the message we send).

   Same endpoints and shapes as scripts/bpu/bpu_ops.py, whose Crisp and AC2
   credentials these are. Every call answers instead of throwing on an HTTP
   status; a missing credential throws ConfigMissing so the job can say what
   to set rather than fail quietly.
   ========================================================================== */

export class ConfigMissing extends Error {
  constructor(what: string) {
    super(`Chưa cấu hình ${what} — đặt ở tab Cài đặt hoặc trong .env của VPS.`);
    this.name = "ConfigMissing";
  }
}

const UA = "Mozilla/5.0 (compatible; PageFly-SSU/1.0)";

type Answer<T> = { status: number; body: T | null; text: string };

async function call<T>(url: string, init: RequestInit = {}, timeoutMs = 25_000): Promise<Answer<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "User-Agent": UA, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const text = await res.text();
    let body: T | null = null;
    try {
      body = text ? (JSON.parse(text) as T) : null;
    } catch {
      body = null;
    }
    return { status: res.status, body, text };
  } catch (err) {
    return { status: 0, body: null, text: err instanceof Error ? err.message : String(err) };
  }
}

const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

/* ---------------------------------------------------------------- Mixpanel */

export type MixpanelEvent = { event: string; properties: Record<string, unknown> };

/** Mixpanel's export allows 60 calls an hour; a 429 pauses the reads. */
export class MixpanelBusy extends Error {
  constructor() {
    super("Mixpanel export đang giới hạn (429) — tạm dừng đọc 5 phút.");
    this.name = "MixpanelBusy";
  }
}

let toDateAhead = true;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * `select_template` events that carry a store_set, from `since` until now.
 *
 * The export takes whole days in the PROJECT's timezone, which may be ahead
 * of UTC: `to_date` is asked as tomorrow's UTC date first and, if Mixpanel
 * refuses a date in its future, as today's. Rows repeat between reads; the
 * caller deduplicates on $insert_id. With `domain`, only that store's — for
 * a customer added by hand, whose selects may be older than the backfill.
 *
 * The store_set filter is applied here, not in `where`: Mixpanel answered
 * the minute job's `defined(…) and … != null` with a bare 400. A couple of
 * days of select_template is small; only the one-store read filters there.
 */
export async function exportStoreSetSelects(since: Date, domain?: string): Promise<MixpanelEvent[]> {
  if (domain !== undefined && !/^[a-z0-9][a-z0-9.-]*$/.test(domain)) throw new Error(`Domain không hợp lệ: ${domain}`);
  const secret = await connection("mixpanel_secret");
  if (!secret) throw new ConfigMissing("Mixpanel (service account secret)");
  const username = await connection("mixpanel_username");
  const project = await connection("mixpanel_project_id");
  const auth = username ? basic(username, secret) : basic(secret, "");
  const from = ymd(new Date(since.getTime() - 86_400_000));
  const attempt = async (to: string) => {
    const q = new URLSearchParams({
      project_id: project,
      from_date: from,
      to_date: to,
      event: JSON.stringify(["select_template"]),
    });
    /* "in", not ==: some values carry a leading newline; the caller keeps exact matches */
    if (domain) q.set("where", `"${domain}" in properties["shopify_domain"]`);
    return call<never>(`https://data.mixpanel.com/api/2.0/export?${q}`, { headers: { Authorization: auth, Accept: "text/plain" } }, domain ? 120_000 : 60_000);
  };
  /* Which of the two the project takes is remembered, so the minute job
     spends one of Mixpanel's 60 export calls an hour, not two. */
  let r = await attempt(ymd(new Date(Date.now() + (toDateAhead ? 86_400_000 : 0))));
  if (r.status === 400 && toDateAhead) {
    toDateAhead = false;
    r = await attempt(ymd(new Date()));
  }
  if (r.status === 429) throw new MixpanelBusy();
  if (r.status !== 200) throw new Error(`Mixpanel export ${r.status}: ${r.text.trim().slice(0, 200) || "(Mixpanel không nói lý do)"}`);
  const out: MixpanelEvent[] = [];
  for (const line of r.text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as MixpanelEvent;
      const t = Number(e.properties?.time);
      if (Number.isFinite(t) && t * 1000 >= since.getTime() && e.properties?.store_set) out.push(e);
    } catch {
      // a torn line: skipped, read again next time
    }
  }
  return out;
}

/* ---------------------------------------------------------------- AC2 */

export type Ac2Store = {
  shopDomain?: string;
  name?: string;
  email?: string;
  phone?: string | number;
  country?: string;
  timezone?: string;
  shopifyPlan?: string;
  pageflyPlan?: string;
  pageflyPrice?: number | string;
  totalPages?: number | string;
  numPublished?: number | string;
  status?: string;
  createdAt?: string;
  uninstalledAt?: string;
};

/**
 * GET an AC2 stores path through BPU Ops' n8n proxy: the AC2 token stays in
 * n8n, this server holds only the proxy's key. null when it is not configured.
 */
async function ac2Get<T>(path: string): Promise<Answer<T> | null> {
  const proxy = await connection("n8n_ac2_url");
  const key = await connection("n8n_ac2_key");
  if (!proxy || !key) return null;
  const sep = proxy.includes("?") ? "&" : "?";
  return call<T>(`${proxy}${sep}${new URLSearchParams({ path })}`, { headers: { "X-BPU-Key": key } });
}

/** The store, or null when AC2 is not configured, does not answer, or does not know it. */
export async function ac2Store(domain: string): Promise<Ac2Store | null> {
  const r = await ac2Get<Ac2Store>(`/${encodeURIComponent(domain)}`);
  return r && r.status === 200 && r.body?.shopDomain ? r.body : null;
}

/* ---------------------------------------------------------------- Crisp */

type CrispBody<T> = { error?: boolean; reason?: string; data?: T };

async function crisp<T>(method: string, path: string, body?: unknown): Promise<Answer<CrispBody<T>> & { wid: string }> {
  const id = await connection("crisp_identifier");
  const key = await connection("crisp_key");
  if (!id || !key) throw new ConfigMissing("Crisp (CRISP_IDENTIFIER, CRISP_KEY)");
  const wid = await connection("crisp_website_id");
  const r = await call<CrispBody<T>>(`https://api.crisp.chat/v1/website/${wid}${path}`, {
    method,
    headers: { Authorization: basic(id, key), "X-Crisp-Tier": "plugin" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ...r, wid };
}

const ok = (r: { status: number; body: CrispBody<unknown> | null }) => r.status >= 200 && r.status < 300 && !r.body?.error;

export type CrispConversation = {
  session_id: string;
  state?: string;
  created_at?: number;
  updated_at?: number;
  meta?: { email?: string; nickname?: string; data?: Record<string, unknown>; subject?: string };
  last_message?: string;
};

/** A value Crisp holds as text or number, as a number — "5", 5, " 5 " → 5. */
export function reviewValue(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

export type ReviewCheck = {
  conversations: { session_id: string; link: string; updated_at: string | null; app_review: number | null; subject: string | null; state: string | null }[];
  /** the highest app_review on any of them, or on the customer's profile */
  app_review: number | null;
};

/**
 * Every Crisp conversation with this email (List conversations, searched by
 * the email, then kept only where the conversation's own email is it), and
 * the `app_review` each one's data holds — plus the people profile's, since
 * a field set on the profile shows in the same sidebar.
 */
export async function reviewCheck(email: string): Promise<ReviewCheck> {
  const want = email.trim().toLowerCase();
  const found = new Map<string, CrispConversation>();
  const wid = await connection("crisp_website_id");
  for (let page = 1; page <= 3; page++) {
    const q = new URLSearchParams({ search_query: want, search_type: "text", per_page: "50" });
    const r = await crisp<CrispConversation[]>("GET", `/conversations/${page}?${q}`);
    if (!ok(r)) throw new Error(`Crisp search ${r.status}: ${r.body?.reason ?? r.text.slice(0, 120)}`);
    const list = Array.isArray(r.body?.data) ? r.body.data : [];
    for (const c of list) if (c.session_id && (c.meta?.email ?? "").trim().toLowerCase() === want) found.set(c.session_id, c);
    if (list.length < 50) break;
  }
  const conversations: ReviewCheck["conversations"] = [];
  let best: number | null = null;
  for (const c of found.values()) {
    let data = c.meta?.data;
    if (!data) {
      const m = await crisp<{ data?: Record<string, unknown> }>("GET", `/conversation/${c.session_id}/meta`);
      data = ok(m) ? m.body?.data?.data : undefined;
    }
    const v = reviewValue(data?.app_review);
    if (v !== null && (best === null || v > best)) best = v;
    conversations.push({
      session_id: c.session_id,
      link: ticketLink(wid, c.session_id),
      updated_at: c.updated_at ? new Date(c.updated_at).toISOString() : null,
      app_review: v,
      subject: c.meta?.subject ?? null,
      state: c.state ?? null,
    });
  }
  const p = await crisp<{ data?: Record<string, unknown> }>("GET", `/people/data/${encodeURIComponent(want)}`).catch(() => null);
  if (p && ok(p)) {
    const v = reviewValue(p.body?.data?.data?.app_review);
    if (v !== null && (best === null || v > best)) best = v;
  }
  conversations.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  return { conversations, app_review: best };
}

export function ticketLink(wid: string, sid: string): string {
  return `https://app.crisp.chat/website/${wid}/inbox/${sid}/`;
}

/** Who a message is from on Crisp: the name, and the operator's face when known. */
export type CrispSender = { type: "website"; nickname: string; avatar?: string; user_id?: string };

type Operator = { user_id: string; names: string[]; avatar: string | null };
let operators: { at: number; list: Operator[] } | null = null;

/**
 * The sender for `name`: with `avatar` when one is set on the Cài đặt tab,
 * else the Crisp operator of that name (first name or full name), whose
 * user_id and avatar BPU Ops uses the same way. The operator list is read
 * once an hour; if the token may not read it, the message goes with the
 * name alone, as before.
 */
export async function crispSender(name: string, avatar: string): Promise<CrispSender> {
  if (avatar.trim()) return { type: "website", nickname: name, avatar: avatar.trim() };
  if (!operators || Date.now() - operators.at > 3_600_000) {
    type Row = { details?: { user_id?: string; first_name?: string; last_name?: string; nickname?: string; avatar?: string | null } };
    const r = await crisp<Row[]>("GET", "/operators/list").catch(() => null);
    const rows = r && ok(r) && Array.isArray(r.body?.data) ? r.body.data : [];
    operators = {
      at: Date.now(),
      list: rows
        .map((x) => x.details ?? {})
        .filter((d) => d.user_id)
        .map((d) => ({
          user_id: d.user_id!,
          names: [d.first_name, d.nickname, [d.first_name, d.last_name].filter(Boolean).join(" ")]
            .filter((n): n is string => !!n)
            .map((n) => n.trim().toLowerCase()),
          avatar: d.avatar ?? null,
        })),
    };
  }
  const op = operators.list.find((o) => o.names.includes(name.trim().toLowerCase()));
  return op
    ? { type: "website", nickname: name, user_id: op.user_id, ...(op.avatar ? { avatar: op.avatar } : {}) }
    : { type: "website", nickname: name };
}

/**
 * Adds a segment to a conversation, keeping the ones it has (Crisp's meta
 * PATCH replaces the list).
 */
export async function addSegment(sid: string, segment: string): Promise<void> {
  const r = await crisp<{ segments?: string[] }>("GET", `/conversation/${sid}/meta`);
  if (!ok(r)) throw new Error(`Crisp meta ${r.status}`);
  const have = Array.isArray(r.body?.data?.segments) ? r.body.data.segments : [];
  if (have.includes(segment)) return;
  const w = await crisp("PATCH", `/conversation/${sid}/meta`, { segments: [...have, segment] });
  if (!ok(w)) throw new Error(`Crisp segment ${w.status}: ${w.body?.reason ?? w.text.slice(0, 120)}`);
}

/**
 * Opens a new conversation for the email and writes the message in it, as
 * BPU Ops does for the first upsell message: the email and store on the
 * conversation, the text from `sender`, a private note saying where it came
 * from, then resolved — a reply from the customer reopens it.
 */
export async function sendInNewConversation(o: {
  email: string;
  nickname: string;
  subject: string;
  content: string;
  sender: CrispSender;
  note: string;
}): Promise<{ session_id: string; ticket_link: string }> {
  const created = await crisp<{ session_id?: string }>("POST", "/conversation", {});
  const sid = created.body?.data?.session_id;
  if (!ok(created) || !sid) throw new Error(`Crisp create ${created.status}: ${created.body?.reason ?? created.text.slice(0, 120)}`);
  await crisp("PATCH", `/conversation/${sid}/meta`, { email: o.email, nickname: o.nickname, subject: o.subject });
  await sendInConversation(sid, o.content, o.sender);
  await crisp("POST", `/conversation/${sid}/message`, {
    type: "note",
    from: "operator",
    origin: "chat",
    content: o.note,
    user: { type: "website", nickname: "PageFly Team" },
  });
  await resolveConversation(sid);
  return { session_id: sid, ticket_link: ticketLink(created.wid, sid) };
}

/** Resolved after every message, as BPU Ops does: a reply from the customer reopens it. */
export async function resolveConversation(sid: string): Promise<void> {
  await crisp("PATCH", `/conversation/${sid}/state`, { state: "resolved" });
}

export async function sendInConversation(sid: string, content: string, sender: CrispSender): Promise<void> {
  const r = await crisp("POST", `/conversation/${sid}/message`, {
    type: "text",
    from: "operator",
    origin: "chat",
    content,
    user: sender,
  });
  if (!ok(r)) throw new Error(`Crisp message ${r.status}: ${r.body?.reason ?? r.text.slice(0, 120)}`);
}

export type CrispMessage = {
  type?: string;
  from?: "user" | "operator";
  content?: unknown;
  timestamp?: number;
  delivered?: string;
  read?: string;
  user?: { nickname?: string };
};

export async function conversationMessages(sid: string): Promise<CrispMessage[]> {
  const r = await crisp<CrispMessage[]>("GET", `/conversation/${sid}/messages`);
  if (!ok(r)) throw new Error(`Crisp messages ${r.status}`);
  return Array.isArray(r.body?.data) ? r.body.data : [];
}

/* ---------------------------------------------------------------- test */

export type ConnectionTest = { service: "Mixpanel" | "Crisp" | "AC2"; ok: boolean; detail: string };

/**
 * One cheap read per service, for "Kiểm tra kết nối" on the Cài đặt tab
 * (Crisp refuses a page smaller than 20: 416 underflow_page_size).
 * Mixpanel's costs one of its 60 export calls an hour; nothing is written.
 */
export async function testConnections(sampleDomain: string | null): Promise<ConnectionTest[]> {
  const why = (status: number, text: string) =>
    status === 401 || status === 403 ? `sai token (${status}${text ? `: ${text.slice(0, 80)}` : ""})` : status === 0 ? `không kết nối được: ${text.slice(0, 120)}` : `trả lời ${status}: ${text.slice(0, 120)}`;

  /* A service account is checked with /api/app/me — instant, and it lists the
     projects the account may read. Only a bare project secret (no username)
     falls back to a one-row export, which can take a while. */
  const mixpanel = async (): Promise<ConnectionTest> => {
    const secret = await connection("mixpanel_secret");
    if (!secret) return { service: "Mixpanel", ok: false, detail: "chưa điền secret" };
    const username = await connection("mixpanel_username");
    const project = await connection("mixpanel_project_id");
    if (username) {
      const r = await call<{ results?: { projects?: Record<string, { name?: string }> } }>("https://mixpanel.com/api/app/me", {
        headers: { Authorization: basic(username, secret) },
      });
      if (r.status !== 200) return { service: "Mixpanel", ok: false, detail: why(r.status, r.text) };
      const projects = r.body?.results?.projects;
      if (!projects || Object.keys(projects).length === 0) return { service: "Mixpanel", ok: true, detail: "service account đúng" };
      return projects[project]
        ? { service: "Mixpanel", ok: true, detail: `đọc được project ${project} (${projects[project].name ?? ""})` }
        : { service: "Mixpanel", ok: false, detail: `service account đúng nhưng không có quyền vào project ${project}` };
    }
    const day = ymd(new Date(Date.now() - 86_400_000));
    const q = new URLSearchParams({ project_id: project, from_date: day, to_date: day, event: JSON.stringify(["select_template"]), limit: "1" });
    const r = await call<never>(`https://data.mixpanel.com/api/2.0/export?${q}`, { headers: { Authorization: basic(secret, ""), Accept: "text/plain" } }, 60_000);
    if (r.status === 200) return { service: "Mixpanel", ok: true, detail: `đọc được project ${project}` };
    if (r.status === 429) return { service: "Mixpanel", ok: true, detail: "mã đúng, đang bị giới hạn 60 lần/giờ — thử lại sau" };
    return { service: "Mixpanel", ok: false, detail: why(r.status, r.text) };
  };

  const crispTest = async (): Promise<ConnectionTest> => {
    try {
      const r = await crisp<CrispConversation[]>("GET", "/conversations/1?per_page=20");
      return ok(r)
        ? { service: "Crisp", ok: true, detail: `đọc được website ${r.wid}` }
        : { service: "Crisp", ok: false, detail: why(r.status, r.body?.reason ?? r.text) };
    } catch (err) {
      return { service: "Crisp", ok: false, detail: err instanceof ConfigMissing ? "chưa điền identifier / key" : String(err) };
    }
  };

  const ac2 = async (): Promise<ConnectionTest> => {
    const domain = sampleDomain ?? "pagefly-demo.myshopify.com";
    const r = await ac2Get<Ac2Store>(`/${encodeURIComponent(domain)}`);
    if (!r) return { service: "AC2", ok: false, detail: "chưa điền n8n URL + key" };
    const via = "qua n8n";
    if (r.status === 200 && r.body?.shopDomain) return { service: "AC2", ok: true, detail: `đọc được store ${domain} ${via}` };
    if (r.status === 401 || r.status === 403) {
      const key = await connection("n8n_ac2_key");
      return { service: "AC2", ok: false, detail: `${why(r.status, r.text)} ${via} — key đang lưu: bắt đầu "${key.slice(0, 4)}", ${key.length} ký tự` };
    }
    return { service: "AC2", ok: false, detail: `${why(r.status, r.text)} ${via} (store thử: ${domain})` };
  };

  return Promise.all([mixpanel(), crispTest(), ac2()]);
}
