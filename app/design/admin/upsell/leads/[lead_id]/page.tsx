import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminGate } from "@/components/admin/adminGate";
import { CrispLink, PhoneLine, Pill, StatusBadge, WhatsappMark } from "@/components/admin/upsell/bits";
import { LeadMessages, PagePreviews, ReviewActions, Timeline } from "@/components/admin/upsell/LeadDetailParts";
import { filterOptions, leadDetail } from "@/lib/upsell/adminQueries";
import { customerClock, daysLeft, fmtVN, handleOf, money } from "@/lib/upsell/format";
import { hasUpsellDatabase } from "@/lib/upsell/db";
import { initialDraft } from "@/lib/upsell/review";
import { getSettings } from "@/lib/upsell/settings";

/* /design/admin/upsell/leads/:lead_id — one lead, everything about it. */

export const metadata = { title: "Lead — Upsell Build Pages" };
export const dynamic = "force-dynamic";

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 border-b border-pf-border py-1.5 text-[12.5px] last:border-0">
      <dt className="text-pf-faint">{k}</dt>
      <dd className="min-w-0 break-words text-pf-body">{children}</dd>
    </div>
  );
}

const ext = "text-pf-primary-hi hover:text-pf-text underline-offset-2 hover:underline";

export default async function LeadPage(props: PageProps<"/design/admin/upsell/leads/[lead_id]">) {
  const gate = await adminGate("upsell");
  if (gate) return gate;
  if (!hasUpsellDatabase()) notFound();
  const { lead_id } = await props.params;
  const [d, cfg, options] = await Promise.all([leadDetail(lead_id), getSettings(), filterOptions()]);
  if (!d) notFound();
  const { lead: l, design } = d;
  const clock = customerClock(l.timezone, cfg.send_hour_start, cfg.send_hour_end);
  const left = daysLeft(design?.design.expires_at);

  return (
    <AdminShell
      current="upsell"
      title={l.store_name || l.store_domain}
      subtitle={`${l.lead_id} · ${l.group === "control" ? "Đối chứng" : "Test"} · tạo ${fmtVN(l.created_at, true)}`}
      actions={
        <div className="flex items-center gap-2">
          <StatusBadge status={l.status} />
          <Link href="/design/admin/upsell" className="text-[12.5px] text-pf-faint hover:text-pf-text">
            ← Upsell
          </Link>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="grid content-start gap-4">
          <section className="rounded-pf-card border border-pf-border bg-pf-card p-4">
            <h2 className="pb-2 font-display text-[15px] font-bold text-pf-text">Thông tin store</h2>
            <dl>
              <Row k="Domain">
                <a className={ext} href={`https://${l.store_domain}`} target="_blank" rel="noreferrer">
                  {l.store_domain}
                </a>
              </Row>
              <Row k="Email">{l.email || "—"}</Row>
              <Row k="Phone">{l.phone ? <PhoneLine phone={l.phone} /> : "—"}</Row>
              <Row k="Quốc gia">{l.country || "—"}</Row>
              <Row k="Giờ khách">
                <span className={clock.inWindow ? "text-pf-success" : "text-pf-warn"}>{clock.time}</span> <span className="text-pf-faint">({clock.tz})</span>
              </Row>
              <Row k="Shopify plan">{l.shopify_plan || "—"}</Row>
              <Row k="PF plan">
                {d.install?.pf_plan || l.plan_at_send || "—"}
                {l.current_plan && l.current_plan !== l.plan_at_send ? ` → ${l.current_plan}` : ""}
              </Row>
              <Row k="Điểm">
                <span className="font-semibold">{l.lead_score ?? "—"}</span>
                <p className="text-[11.5px] text-pf-faint">{l.score_reasons}</p>
              </Row>
              <Row k="Onboarding">{l.onboarding_intent || "—"}</Row>
              <Row k="Ngành hàng">{l.category_hint || "—"}</Row>
              <Row k="Số sản phẩm">{l.product_count || "—"}</Row>
              <Row k="Link nhanh">
                <div className="flex flex-wrap gap-3">
                  <a className={ext} href={`https://ac2.pagefly.io/app-data/stores/${l.store_domain}`} target="_blank" rel="noreferrer">
                    AC2
                  </a>
                  {l.ticket_link && <CrispLink href={l.ticket_link} label="Mở ticket Crisp" />}
                  {design && (
                    <a className={ext} href={`/new-page?id=${design.design.id}`} target="_blank" rel="noreferrer">
                      Trang khách
                    </a>
                  )}
                </div>
              </Row>
            </dl>
          </section>
          <section className="rounded-pf-card border border-pf-border bg-pf-card p-4">
            <h2 className="pb-2 font-display text-[15px] font-bold text-pf-text">Số liệu</h2>
            <dl>
              <Row k="Gửi">{fmtVN(l.sent_at, true)}</Row>
              <Row k="Đã đọc">{l.message_read ? "✓" : "—"}</Row>
              <Row k="Lượt xem">
                {l.unique_views} người · {l.views} lượt {l.first_view_at && <span className="text-pf-faint">· đầu tiên {fmtVN(l.first_view_at)}</span>}
              </Row>
              <Row k="Lượt tải">{l.downloads}</Row>
              <Row k="Bấm xem plan">{l.cta_clicks}</Row>
              <Row k="Rating">{l.rating ? `${l.rating}★` : "—"}</Row>
              <Row k="Góp ý">{l.last_comment || "—"}</Row>
              <Row k="Phản hồi">
                {l.replied ? (
                  <>
                    <Pill tone={l.sentiment === "Positive" ? "ok" : l.sentiment === "Negative" ? "bad" : "muted"}>{l.sentiment ?? "?"}</Pill>{" "}
                    {l.feedback_summary || l.last_reply_text}
                  </>
                ) : (
                  "—"
                )}
              </Row>
              <Row k="Page">
                {l.pages_at_send ?? "?"} → {l.pages_now ?? "?"} · publish {l.published_now ?? "?"}
                {l.used_page ? " · đã dùng page" : ""}
              </Row>
              <Row k="Nâng cấp">{l.upgraded ? `${l.upgraded_to ?? ""} · ${money(l.mrr_added)} · ${fmtVN(l.upgraded_at)}` : "—"}</Row>
              <Row k="Link còn">{left === null ? "—" : left <= 0 ? "Hết hạn" : `${left} ngày`}</Row>
              {l.error && <Row k="Lỗi">{l.error}</Row>}
              {l.reject_reason && <Row k="Lý do từ chối">{l.reject_reason}</Row>}
              {l.rebuild_note && <Row k="Ghi chú rebuild">{l.rebuild_note}</Row>}
              <Row k="WhatsApp">
                <WhatsappMark leadId={l.lead_id} sentAt={l.whatsapp_sent_at} sentBy={l.whatsapp_sent_by} />
              </Row>
              <Row k="Rebuild">{l.rebuild_count} lần</Row>
              {l.reviewed_by && <Row k="Duyệt bởi">{`${l.reviewed_by.replace(/^admin:/, "")} · ${fmtVN(l.reviewed_at)}`}</Row>}
            </dl>
          </section>
        </aside>

        <div className="grid content-start gap-6">
          {design ? (
            <>
              {l.build_note && (
                <p className="rounded-pf-md border border-pf-border bg-pf-card px-3 py-2 text-[12.5px] text-pf-muted">
                  <span className="font-semibold text-pf-body">Ghi chú của Claude: </span>
                  {l.build_note}
                </p>
              )}
              <PagePreviews
                designId={design.design.id}
                versions={design.versions}
                current={design.design.version}
                pages={design.pages.map((p) => ({ slot: p.slot, type: p.type, title: p.title, size_bytes: p.size_bytes }))}
                storeHandle={handleOf(l.store_domain)}
              />
            </>
          ) : (
            <p className="rounded-pf-card border border-dashed border-pf-border px-4 py-8 text-center text-[13px] text-pf-faint">Chưa có page nào được build cho lead này.</p>
          )}
          {l.status === "pending_review" && design && (
            <ReviewActions leadId={l.lead_id} draft={initialDraft(l, design.design.id, cfg)} pageTypes={[l.page1_type, l.page2_type]} />
          )}
          <LeadMessages leadId={l.lead_id} messages={d.messages} ticketLink={l.ticket_link} />
          <Timeline leadId={l.lead_id} events={d.events} pic={l.pic} pics={options.pics} notes={l.internal_notes} />
        </div>
      </div>
    </AdminShell>
  );
}
