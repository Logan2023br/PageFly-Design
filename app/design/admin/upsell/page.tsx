import { AdminShell } from "@/components/admin/AdminShell";
import { adminGate } from "@/components/admin/adminGate";
import { FilterBar, Pager, TABS, TabNav, type TabId } from "@/components/admin/upsell/Chrome";
import { InstallsTable } from "@/components/admin/upsell/InstallsTable";
import { GroupHeader, GroupNav, ModeSwitch, SentList } from "@/components/admin/upsell/MessageGroups";
import { autoMessageSample } from "@/lib/upsell/autoMessages";
import { initialDraft } from "@/lib/upsell/review";
import type { LeadRow } from "@/lib/upsell/types";
import { LeadCriteria } from "@/components/admin/upsell/LeadCriteria";
import { LeadTable } from "@/components/admin/upsell/LeadTable";
import { MessageQueue } from "@/components/admin/upsell/MessageQueue";
import { PendingPages } from "@/components/admin/upsell/PendingPages";
import { SettingsForm } from "@/components/admin/upsell/SettingsForm";
import { StatsPanel } from "@/components/admin/upsell/StatsPanel";
import {
  MESSAGE_GROUPS,
  filterOptions,
  groupOf,
  listMessagesOfKinds,
  pendingByGroup,
  sentByGroup,
  listInstallsPage,
  listLeadTab,
  listMessages,
  tabCounts,
  upsellStats,
  type Filters,
} from "@/lib/upsell/adminQueries";
import { hasUpsellDatabase } from "@/lib/upsell/db";
import { NUMERIC_KEYS, SETTING_HELP, getSettings, maskSettings } from "@/lib/upsell/settings";

/* /design/admin/upsell — Upsell Build Pages. Read on the server per request,
   like the other admin screens; the tab and filters are in the URL. */

export const metadata = { title: "Upsell Build 2 pages — PageFly Design Admin" };
export const dynamic = "force-dynamic";

export default async function UpsellAdminPage(props: PageProps<"/design/admin/upsell">) {
  const gate = await adminGate("upsell");
  if (gate) return gate;

  const sp = await props.searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v ? v : undefined;
  };
  const tab = (TABS.some((t) => t.id === one("tab")) ? one("tab") : "pages") as TabId;
  const f: Filters = {
    q: one("q"),
    from: one("from"),
    to: one("to"),
    pic: one("pic"),
    cat: one("cat"),
    min_score: one("min_score"),
    act: one("act"),
    group: one("group"),
    read: one("read"),
    page: Number(one("page") ?? 1),
  };

  if (!hasUpsellDatabase()) {
    return (
      <AdminShell current="upsell" title="Upsell Build 2 pages">
        <p className="rounded-pf-card border border-pf-warn/30 bg-pf-warn/10 p-4 text-[13px] text-pf-warn">
          Upsell Build 2 pages cần Postgres. Đặt DATABASE_URL rồi khởi động lại — bộ lưu file không hỗ trợ module này.
        </p>
      </AdminShell>
    );
  }

  const [counts, options, cfg] = await Promise.all([tabCounts(), filterOptions(), getSettings()]);
  const window = { start: cfg.send_hour_start, end: cfg.send_hour_end };

  let body: React.ReactNode;
  let pager: React.ReactNode = null;
  if (tab === "pages") {
    const r = await listLeadTab("pages", f);
    body = (
      <div className="grid gap-4">
        <section className="rounded-pf-card border border-pf-border bg-pf-card p-4">
          <ModeSwitch
            setting="page_review_mode"
            mode={cfg.page_review_mode === "auto" ? "auto" : "manual"}
            labels={{ manual: "Duyệt thủ công", auto: "Tự duyệt" }}
            hint={{
              manual: "Build xong, page nằm ở đây chờ bạn duyệt rồi mới gửi khách.",
              auto: "Build xong là tự duyệt và tự gửi tin đầu tiên trong giờ của khách — không chờ bạn. Page đang chờ bên dưới vẫn cần duyệt tay.",
            }}
          />
        </section>
        <PendingPages leads={r.rows} />
      </div>
    );
    pager = <Pager tab={tab} f={f} {...r} />;
  } else if (tab === "messages") {
    const group = groupOf(f.group);
    const def = MESSAGE_GROUPS[group];
    const read = f.read === "1" || f.read === "0" ? f.read : undefined;
    const [pending, sent, perGroup, sentCounts] = await Promise.all([
      listMessages("pending_review", f, def.kinds),
      listMessagesOfKinds(def.kinds, ["sent"], 100, read === undefined ? null : read === "1"),
      pendingByGroup(),
      sentByGroup(),
    ]);
    const sample =
      group === "build"
        ? initialDraft(
            { store_name: "Your Store", store_domain: "your-store.myshopify.com", page1_type: "home", page2_type: "product", pic: null } as LeadRow,
            "EXAMPLE1",
            cfg,
          )
        : autoMessageSample(group === "viewed" ? "view_reminder" : "edit_offer", cfg);
    const description = {
      build: "Tin đầu tiên gửi kèm 2 page (tạo khi bạn duyệt page), các follow-up và tin xin review do BPU Ops soạn.",
      viewed: `Tạo khi khách đã mở link page nhưng ${cfg.view_reminder_hours} giờ sau lần xem đầu vẫn chưa tải, và link còn hạn. Mỗi khách một lần.`,
      downloaded: "Tạo khi khách đã tải file .pagefly, trong vòng 3 ngày chỉnh sửa miễn phí kể từ ngày gửi page. Mỗi khách một lần.",
    }[group];
    const mode = cfg[def.setting] === "auto" ? "auto" : "manual";
    body = (
      <div className="grid gap-4">
        <GroupNav groups={(Object.keys(MESSAGE_GROUPS) as (keyof typeof MESSAGE_GROUPS)[]).map((id) => ({ id, label: MESSAGE_GROUPS[id].label, pending: perGroup[id], ...sentCounts[id] }))} current={group} />
        <GroupHeader setting={def.setting} mode={mode} description={description} sample={sample} />
        <section className="grid gap-2">
          <h3 className="text-[13.5px] font-semibold text-pf-text">Chờ duyệt ({pending.total})</h3>
          <MessageQueue rows={pending.rows} mode="drafts" window={window} />
          {pending.pages > 1 && <Pager tab={tab} f={{ ...f, group }} {...pending} />}
        </section>
        <SentList rows={sent} group={group} read={read} counts={sentCounts[group]} />
      </div>
    );
  } else if (tab === "waiting" || tab === "failed") {
    const status = tab === "waiting" ? "approved" : "failed";
    const r = await listMessages(status, f);
    const mode = tab === "waiting" ? "waiting" : "failed";
    body = <MessageQueue rows={r.rows} mode={mode} window={window} />;
    pager = <Pager tab={tab} f={f} {...r} />;
  } else if (tab === "installs") {
    const r = await listInstallsPage(f);
    body = <InstallsTable rows={r.rows} />;
    pager = <Pager tab={tab} f={f} {...r} />;
  } else if (tab === "stats") {
    body = <StatsPanel s={await upsellStats(f)} />;
  } else if (tab === "criteria") {
    body = <LeadCriteria threshold={cfg.score_threshold} minProducts={cfg.min_products} controlPercent={cfg.control_percent} />;
  } else if (tab === "settings") {
    body = <SettingsForm initial={maskSettings(cfg)} help={SETTING_HELP} numeric={NUMERIC_KEYS} />;
  } else {
    const r = await listLeadTab(tab, f);
    body = <LeadTable rows={r.rows} variant={tab} />;
    pager = <Pager tab={tab} f={f} {...r} />;
  }

  return (
    <AdminShell
      current="upsell"
      title="Upsell Build 2 pages"
      subtitle="BPU: page Claude dựng cho store mới cài — duyệt page, duyệt tin, theo dõi kết quả. Không tin nào tới khách khi chưa được duyệt."
    >
      <div className="grid gap-4">
        <TabNav tab={tab} counts={counts} />
        {tab !== "settings" && tab !== "criteria" && <FilterBar tab={tab} f={f} pics={options.pics} categories={options.categories} />}
        {pager}
        {body}
        {pager}
      </div>
    </AdminShell>
  );
}
