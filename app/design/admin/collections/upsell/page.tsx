import { AdminShell } from "@/components/admin/AdminShell";
import { adminGate } from "@/components/admin/adminGate";
import { FilterBar, Pager, SelectionFeed, TabNav } from "@/components/admin/collections/storeSetUpsell/Chrome";
import { AddStore } from "@/components/admin/collections/storeSetUpsell/AddStore";
import { CustomerCards } from "@/components/admin/collections/storeSetUpsell/CustomerCards";
import { LiveBar, ModeSwitch } from "@/components/admin/collections/storeSetUpsell/LiveBar";
import { MessageCards } from "@/components/admin/collections/storeSetUpsell/MessageCards";
import { Section, SsuGroupNav, SsuReplyNav, SsuSentList } from "@/components/admin/collections/storeSetUpsell/Messages";
import { SettingsPanel } from "@/components/admin/collections/storeSetUpsell/SettingsPanel";
import { StoresTable } from "@/components/admin/collections/storeSetUpsell/StoresTable";
import { hasStoreSetDatabase } from "@/lib/storeSetUpsell/db";
import { sampleMessage } from "@/lib/storeSetUpsell/messages";
import { redirect } from "next/navigation";
import {
  OLD_TABS,
  SSU_GROUPS,
  SSU_TABS,
  groupCounts,
  jobState,
  listReplies,
  replyCounts,
  ssuGroupOf,
  type SsuGroup,
  listCustomers,
  listMessages,
  listSelections,
  setOptions,
  ssuCounts,
  storeStats,
  type SsuFilters,
  type SsuTabId,
} from "@/lib/storeSetUpsell/queries";
import { SSU_KIND_LABEL } from "@/lib/storeSetUpsell/types";
import { SSU_HELP, SSU_NUMERIC, connectionStates, getSsuSettings } from "@/lib/storeSetUpsell/settings";

/* /design/admin/collections/upsell — Store set upsell: everyone who picked a
   Store set template in PageFly (Mixpanel `select_template`), the thank-you
   and free-editing message from Logan on Crisp, and what came of it. A static
   segment, so it wins over `[id]`. */

const SAMPLE_KINDS = ["thanks", "edit_reminder", "care_read", "care_upgraded", "review_ask"] as const;

export const metadata = { title: "Upsell Collection Pages — PageFly Design Admin" };
export const dynamic = "force-dynamic";

export default async function StoreSetUpsellPage(props: PageProps<"/design/admin/collections/upsell">) {
  const gate = await adminGate("ssu");
  if (gate) return gate;

  const sp = await props.searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v ? v : undefined;
  };
  /* The message tabs moved under Tin nhắn: an old link still lands. */
  const old = OLD_TABS[one("tab") ?? ""];
  if (old) {
    const qs = new URLSearchParams({ tab: "messages", group: old.group });
    if (old.read) qs.set("read", old.read);
    if (old.check) qs.set("check", old.check);
    if (one("q")) qs.set("q", one("q")!);
    redirect(`/design/admin/collections/upsell?${qs}`);
  }
  const tab = (SSU_TABS.some((t) => t.id === one("tab")) ? one("tab") : "all") as SsuTabId;
  const f: SsuFilters = {
    q: one("q"),
    set: one("set"),
    from: one("from"),
    to: one("to"),
    app: one("app"),
    status: one("status"),
    kind: one("kind"),
    group: one("group"),
    read: one("read") === "1" || one("read") === "0" ? one("read") : undefined,
    reply: one("reply"),
    check: one("check") === "1" || one("check") === "0" ? one("check") : undefined,
    page: Number(one("page") ?? 1),
  };

  const shell = (children: React.ReactNode) => (
    <AdminShell
      current="ssu"
      title="Upsell Collection Pages"
      subtitle="Ai đã bấm Select template của Store set trong PageFly — thông tin store, Crisp, tin cảm ơn + chỉnh sửa miễn phí từ Logan, và kết quả"
    >
      <div className="grid gap-4">{children}</div>
    </AdminShell>
  );

  if (!hasStoreSetDatabase()) {
    return shell(
      <p className="rounded-pf-card border border-pf-warn/30 bg-pf-warn/10 p-4 text-[13px] text-pf-warn">
        Upsell Collection Pages cần Postgres (DATABASE_URL), như Upsell Build 2 pages.
      </p>,
    );
  }

  const [counts, sets, cfg, state] = await Promise.all([ssuCounts(), setOptions(), getSsuSettings(), jobState()]);

  let body: React.ReactNode;
  let pager: React.ReactNode = null;
  if (tab === "stores") {
    const r = await storeStats(f);
    body = <StoresTable s={r} f={f} />;
    pager = <Pager tab={tab} f={f} {...r} />;
  } else if (tab === "feed") {
    body = <SelectionFeed rows={await listSelections(f)} />;
  } else if (tab === "messages") {
    const group = ssuGroupOf(f.group);
    const ids = Object.keys(SSU_GROUPS) as SsuGroup[];
    const [gc, rc] = await Promise.all([groupCounts(), replyCounts()]);
    const nav = (
      <SsuGroupNav
        groups={ids.map((id) => ({ id, label: SSU_GROUPS[id].label, pending: gc[id].pending, sent: gc[id].sent, read: gc[id].read }))}
        current={group}
        unchecked={counts.needs_check ?? 0}
      />
    );
    if (group === "replied") {
      const reply = (f.reply && f.reply in SSU_GROUPS ? f.reply : "main") as SsuGroup;
      const r = await listReplies(reply, f);
      body = (
        <>
          {nav}
          <SsuReplyNav groups={ids.map((id) => ({ id, label: SSU_GROUPS[id].label }))} current={reply} check={f.check as "0" | "1" | undefined} counts={rc} />
          <CustomerCards rows={r.rows} editDays={cfg.edit_days} />
        </>
      );
      pager = <Pager tab={tab} f={{ ...f, reply }} {...r} />;
    } else {
      const kinds = SSU_GROUPS[group].kinds;
      const all = { ...f, read: undefined, page: 1 };
      const [pending, waiting, failed, sent] = await Promise.all([
        listMessages(["pending_review"], all, kinds, 100),
        listMessages(["approved", "sending"], all, kinds, 100),
        listMessages(["failed"], all, kinds, 100),
        listMessages(["sent"], { ...f, page: 1 }, kinds, 100),
      ]);
      body = (
        <>
          {nav}
          <section className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4">
            <p className="text-[12.5px] text-pf-muted">{SSU_GROUPS[group].kinds.map((k) => SSU_KIND_LABEL[k]).join(" · ")}</p>
            {group === "review" ? (
              <p className="text-[12px] text-pf-faint">Tin xin review không tự soạn: chọn "Xin review app" rồi bấm Soạn tin trên thẻ khách — tin vào Chờ duyệt.</p>
            ) : (
              /* key: a fresh switch when the group changes */
              <ModeSwitch
                key={group}
                setting={group === "care" ? "care_mode" : "mode"}
                mode={group === "care" ? cfg.care_mode : cfg.mode}
                label={SSU_GROUPS[group].label}
              />
            )}
          </section>
          <Section title={`Chờ duyệt (${pending.total})`}>
            <MessageCards rows={pending.rows} mode="pending" />
          </Section>
          {waiting.total > 0 && (
            <Section title={`Chờ gửi (${waiting.total})`}>
              <MessageCards rows={waiting.rows} mode="waiting" />
            </Section>
          )}
          {failed.total > 0 && (
            <Section title={`Lỗi gửi (${failed.total})`}>
              <MessageCards rows={failed.rows} mode="failed" />
            </Section>
          )}
          <SsuSentList rows={sent.rows} group={group} read={f.read as "1" | "0" | undefined} counts={gc[group]} />
        </>
      );
    }
  } else if (tab === "settings") {
    body = (
      <SettingsPanel
        initial={cfg}
        help={SSU_HELP}
        numeric={SSU_NUMERIC}
        connections={await connectionStates()}
        samples={Object.fromEntries(
          await Promise.all(SAMPLE_KINDS.map(async (k) => [k, await sampleMessage(k, cfg)] as const)),
        )}
      />
    );
  } else {
    const r = await listCustomers(tab, f);
    body = <CustomerCards rows={r.rows} editDays={cfg.edit_days} />;
    pager = <Pager tab={tab} f={f} {...r} />;
  }

  return shell(
    <>
      <LiveBar job={state.job} cursor={state.cursor} paused={!!cfg.send_paused} />
      <TabNav tab={tab} counts={counts} />
      {tab === "all" && <AddStore />}
      {tab !== "settings" && <FilterBar tab={tab} f={f} sets={sets} />}
      {pager}
      {body}
      {pager}
    </>,
  );
}
