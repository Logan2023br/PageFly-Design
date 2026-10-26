import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminGate } from "@/components/admin/adminGate";
import { FilterBar, Pager, SelectionFeed, TabNav } from "@/components/admin/collections/storeSetUpsell/Chrome";
import { AddStore } from "@/components/admin/collections/storeSetUpsell/AddStore";
import { CustomerCards } from "@/components/admin/collections/storeSetUpsell/CustomerCards";
import { LiveBar } from "@/components/admin/collections/storeSetUpsell/LiveBar";
import { MessageCards } from "@/components/admin/collections/storeSetUpsell/MessageCards";
import { SettingsPanel } from "@/components/admin/collections/storeSetUpsell/SettingsPanel";
import { StoresTable } from "@/components/admin/collections/storeSetUpsell/StoresTable";
import { hasStoreSetDatabase } from "@/lib/storeSetUpsell/db";
import { sampleMessage } from "@/lib/storeSetUpsell/messages";
import {
  SSU_TABS,
  jobState,
  listCustomers,
  listMessages,
  listSelections,
  setOptions,
  ssuCounts,
  storeStats,
  type SsuFilters,
  type SsuTabId,
} from "@/lib/storeSetUpsell/queries";
import { SSU_HELP, SSU_NUMERIC, connectionStates, getSsuSettings } from "@/lib/storeSetUpsell/settings";

/* /design/admin/collections/upsell — Store set upsell: everyone who picked a
   Store set template in PageFly (Mixpanel `select_template`), the thank-you
   and free-editing message from Logan on Crisp, and what came of it. A static
   segment, so it wins over `[id]`. */

const SAMPLE_KINDS = ["thanks", "edit_reminder", "care_read", "care_upgraded", "review_ask"] as const;

export const metadata = { title: "Store set upsell — PageFly Design Admin" };
export const dynamic = "force-dynamic";

export default async function StoreSetUpsellPage(props: PageProps<"/design/admin/collections/upsell">) {
  const gate = await adminGate("collections");
  if (gate) return gate;

  const sp = await props.searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v ? v : undefined;
  };
  const tab = (SSU_TABS.some((t) => t.id === one("tab")) ? one("tab") : "all") as SsuTabId;
  const f: SsuFilters = {
    q: one("q"),
    set: one("set"),
    from: one("from"),
    to: one("to"),
    app: one("app"),
    status: one("status"),
    kind: one("kind"),
    page: Number(one("page") ?? 1),
  };

  const shell = (children: React.ReactNode) => (
    <AdminShell
      current="collections"
      title="Store set upsell"
      subtitle="Ai đã bấm Select template của Store set trong PageFly — thông tin store, Crisp, tin cảm ơn + chỉnh sửa miễn phí từ Logan, và kết quả"
    >
      <div className="grid gap-4">
        <Link href="/design/admin/collections" className="w-fit text-[12.5px] text-pf-muted hover:text-pf-text">
          ← Collection pages
        </Link>
        {children}
      </div>
    </AdminShell>
  );

  if (!hasStoreSetDatabase()) {
    return shell(
      <p className="rounded-pf-card border border-pf-warn/30 bg-pf-warn/10 p-4 text-[13px] text-pf-warn">
        Store set upsell cần Postgres (DATABASE_URL), như Upsell Build Pages.
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
  } else if (tab === "pending" || tab === "waiting" || tab === "failed") {
    const statuses = tab === "pending" ? ["pending_review"] : tab === "waiting" ? ["approved", "sending"] : ["failed"];
    const r = await listMessages(statuses, f);
    body = <MessageCards rows={r.rows} mode={tab} />;
    pager = <Pager tab={tab} f={f} {...r} />;
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
      <LiveBar job={state.job} cursor={state.cursor} mode={cfg.mode} careMode={cfg.care_mode} paused={!!cfg.send_paused} />
      <TabNav tab={tab} counts={counts} />
      {tab === "all" && <AddStore />}
      {tab !== "settings" && <FilterBar tab={tab} f={f} sets={sets} />}
      {pager}
      {body}
      {pager}
    </>,
  );
}
