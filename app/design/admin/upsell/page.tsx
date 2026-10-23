import { AdminShell } from "@/components/admin/AdminShell";
import { adminGate } from "@/components/admin/adminGate";
import { FilterBar, Pager, TABS, TabNav, type TabId } from "@/components/admin/upsell/Chrome";
import { InstallsTable } from "@/components/admin/upsell/InstallsTable";
import { AutoMessages, type AutoCard } from "@/components/admin/upsell/AutoMessages";
import { autoMessageSample } from "@/lib/upsell/autoMessages";
import type { AutoMode } from "@/lib/upsell/types";
import { LeadCriteria } from "@/components/admin/upsell/LeadCriteria";
import { LeadTable } from "@/components/admin/upsell/LeadTable";
import { MessageQueue } from "@/components/admin/upsell/MessageQueue";
import { PendingPages } from "@/components/admin/upsell/PendingPages";
import { SettingsForm } from "@/components/admin/upsell/SettingsForm";
import { StatsPanel } from "@/components/admin/upsell/StatsPanel";
import {
  filterOptions,
  listAutoMessages,
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
    act: one("act"),
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
  } else if (tab === "messages" || tab === "waiting" || tab === "failed") {
    const status = tab === "messages" ? "pending_review" : tab === "waiting" ? "approved" : "failed";
    const r = await listMessages(status, f);
    const mode = tab === "messages" ? "drafts" : tab === "waiting" ? "waiting" : "failed";
    body = <MessageQueue rows={r.rows} mode={mode} window={window} />;
    pager = <Pager tab={tab} f={f} {...r} />;
  } else if (tab === "installs") {
    const r = await listInstallsPage(f);
    body = <InstallsTable rows={r.rows} />;
    pager = <Pager tab={tab} f={f} {...r} />;
  } else if (tab === "stats") {
    body = <StatsPanel s={await upsellStats(f)} />;
  } else if (tab === "auto") {
    const [reminders, offers] = await Promise.all([listAutoMessages("view_reminder"), listAutoMessages("edit_offer")]);
    const cards: AutoCard[] = [
      {
        kind: "view_reminder",
        title: "Tin khách đã xem — nhắc tải",
        when: `Soạn khi khách đã mở link page nhưng ${cfg.view_reminder_hours} giờ sau lần xem đầu vẫn chưa tải, và link chưa hết hạn. Mỗi lead một lần.`,
        mode: (cfg.view_reminder_mode as AutoMode) ?? "manual",
        sample: autoMessageSample("view_reminder", cfg),
        rows: reminders,
      },
      {
        kind: "edit_offer",
        title: "Tin khách đã tải — chỉnh sửa miễn phí",
        when: "Soạn khi khách đã tải file .pagefly, trong vòng 15 ngày kể từ ngày gửi page. Mỗi lead một lần.",
        mode: (cfg.edit_offer_mode as AutoMode) ?? "manual",
        sample: autoMessageSample("edit_offer", cfg),
        rows: offers,
      },
    ];
    body = <AutoMessages cards={cards} />;
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
      title="Upsell Build Pages"
      subtitle="BPU: page Claude dựng cho store mới cài — duyệt page, duyệt tin, theo dõi kết quả. Không tin nào tới khách khi chưa được duyệt."
    >
      <div className="grid gap-4">
        <TabNav tab={tab} counts={counts} />
        {tab !== "settings" && tab !== "criteria" && tab !== "auto" && <FilterBar tab={tab} f={f} pics={options.pics} categories={options.categories} />}
        {pager}
        {body}
        {pager}
      </div>
    </AdminShell>
  );
}
