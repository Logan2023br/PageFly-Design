import { AdminShell } from "@/components/admin/AdminShell";
import { adminGate } from "@/components/admin/adminGate";
import { FilterBar, Pager, TABS, TabNav, type TabId } from "@/components/admin/upsell/Chrome";
import { InstallsTable } from "@/components/admin/upsell/InstallsTable";
import { LeadTable } from "@/components/admin/upsell/LeadTable";
import { MessageQueue } from "@/components/admin/upsell/MessageQueue";
import { PendingPages } from "@/components/admin/upsell/PendingPages";
import { SettingsForm } from "@/components/admin/upsell/SettingsForm";
import { StatsPanel } from "@/components/admin/upsell/StatsPanel";
import {
  filterOptions,
  listInstallsPage,
  listLeadTab,
  listMessages,
  tabCounts,
  upsellStats,
  type Filters,
} from "@/lib/upsell/adminQueries";
import { hasUpsellDatabase } from "@/lib/upsell/db";
import { NUMERIC_KEYS, SETTING_HELP, getSettings } from "@/lib/upsell/settings";

/* /design/admin/upsell — Upsell Build Pages. Read on the server per request,
   like the other admin screens; the tab and filters are in the URL. */

export const metadata = { title: "Upsell Build Pages — PageFly Design Admin" };
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
    page: Number(one("page") ?? 1),
  };

  if (!hasUpsellDatabase()) {
    return (
      <AdminShell current="upsell" title="Upsell Build Pages">
        <p className="rounded-pf-card border border-pf-warn/30 bg-pf-warn/10 p-4 text-[13px] text-pf-warn">
          Upsell Build Pages cần Postgres. Đặt DATABASE_URL rồi khởi động lại — bộ lưu file không hỗ trợ module này.
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
    body = <PendingPages leads={r.rows} />;
    pager = <Pager tab={tab} f={f} {...r} />;
  } else if (tab === "messages" || tab === "waiting") {
    const r = await listMessages(tab === "messages" ? "pending_review" : "approved", f);
    body = <MessageQueue rows={r.rows} mode={tab === "messages" ? "drafts" : "waiting"} window={window} />;
    pager = <Pager tab={tab} f={f} {...r} />;
  } else if (tab === "installs") {
    const r = await listInstallsPage(f);
    body = <InstallsTable rows={r.rows} />;
    pager = <Pager tab={tab} f={f} {...r} />;
  } else if (tab === "stats") {
    body = <StatsPanel s={await upsellStats(f)} />;
  } else if (tab === "settings") {
    body = <SettingsForm initial={cfg} help={SETTING_HELP} numeric={NUMERIC_KEYS} />;
  } else {
    const r = await listLeadTab(tab, f);
    body = <LeadTable rows={r.rows} variant={tab} />;
    pager = <Pager tab={tab} f={f} {...r} />;
  }

  return (
    <AdminShell
      current="upsell"
      title="Upsell Build Pages"
      subtitle="BPU: page Claude dựng cho store mới cài — duyệt page, duyệt tin, theo dõi kết quả. Không tin nào tới khách khi chưa được duyệt."
    >
      <div className="grid gap-4">
        <TabNav tab={tab} counts={counts} />
        {tab !== "settings" && <FilterBar tab={tab} f={f} pics={options.pics} categories={options.categories} />}
        {pager}
        {body}
        {pager}
      </div>
    </AdminShell>
  );
}
