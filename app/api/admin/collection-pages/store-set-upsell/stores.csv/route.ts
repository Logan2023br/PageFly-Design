import { guard } from "../../shared";
import { fail } from "@/lib/upsell/api";
import { storeStats } from "@/lib/storeSetUpsell/queries";

/* GET …/store-set-upsell/stores.csv?q=&set=&from=&to=&app=&status= — the
   "Store dùng page sets" table, every row, as CSV. */
export const dynamic = "force-dynamic";

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const sp = new URL(req.url).searchParams;
    const one = (k: string) => sp.get(k) || undefined;
    const s = await storeStats(
      { q: one("q"), set: one("set"), from: one("from"), to: one("to"), app: one("app"), status: one("status"), page: 1 },
      20_000,
    );
    const head = [
      "store_domain", "store_name", "email", "phone", "country", "city", "timezone", "installed_at", "days_on_app",
      "pagefly_plan", "pagefly_price", "shopify_plan", "dev_store", "app_status", "store_sets", "page_count", "pages_used",
      "pages_in_store", "published", "first_selected_at", "last_selected_at", "selections", "app_review", "upsell_status",
      "sent_at", "read_at", "replied", "upgraded_to",
    ];
    const lines = s.rows.map((r) =>
      [
        r.store_domain, r.store_name, r.email, r.phone, r.country, r.city, r.timezone, r.installed_at, r.days_on_app,
        r.pf_plan, r.pf_price, r.shopify_plan, r.is_dev_store, r.app_status, r.sets.join(" | "), r.page_count, r.pages_used.join(" | "),
        r.pages, r.published, r.first_selected_at, r.last_selected_at, r.selections, r.app_review, r.status,
        r.sent_at, r.read_at, r.replied, r.upgraded_to,
      ]
        .map(cell)
        .join(","),
    );
    return new Response([head.join(","), ...lines].join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="store-set-stores-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return fail(err);
  }
}
