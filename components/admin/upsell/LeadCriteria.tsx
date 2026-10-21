/* ==========================================================================
   Tab — Tiêu chí lead: how a newly installed store becomes a lead.

   ⚠ A COPY, IN WORDS, OF `score_store()` IN scripts/bpu/bpu_ops.py. The script
   is what actually scores; this screen only explains it. Change a rule there
   and change it here in the same commit. The three thresholds are read from
   Settings, so they are always the live values.
   ========================================================================== */

type Rule = { group: string; when: string; points: string; tone: "plus" | "minus" };

const RULES: Rule[] = [
  { group: "Gói Shopify", when: "Grow, Advanced, Plus, Professional, Unlimited hoặc \"Shopify\"", points: "+3", tone: "plus" },
  { group: "Gói Shopify", when: "Basic (không phải development)", points: "+1", tone: "plus" },
  { group: "Gói Shopify", when: "Trial, development, partner, staff, affiliate, frozen, paused", points: "−2", tone: "minus" },
  { group: "Email", when: "Email theo tên miền riêng (không phải Gmail, Yahoo, Outlook, iCloud, Proton…)", points: "+2", tone: "plus" },
  { group: "Số điện thoại", when: "Store có số điện thoại", points: "+1", tone: "plus" },
  { group: "Tên store", when: "Tên riêng", points: "+1", tone: "plus" },
  { group: "Tên store", when: "Tên mặc định (\"My Store\", \"Mi tienda\", \"Ma boutique\", \"Mein Shop\"…)", points: "−1", tone: "minus" },
  { group: "Domain", when: "Dạng store test (test-, stg-, -test, bys-user-store, zd-store)", points: "−2", tone: "minus" },
  { group: "Onboarding (Mixpanel)", when: "Mục đích có rebuild, import hoặc connector", points: "+2", tone: "plus" },
  { group: "Onboarding (Mixpanel)", when: "Mục đích có create", points: "+1", tone: "plus" },
  { group: "Sản phẩm công khai", when: "Từ 10 sản phẩm trở lên", points: "+2", tone: "plus" },
  { group: "Sản phẩm công khai", when: "1–9 sản phẩm", points: "+1", tone: "plus" },
  { group: "Storefront", when: "Đang mở, không để password", points: "+1", tone: "plus" },
];

const EXAMPLES: { store: string; math: string; total: number; password?: boolean }[] = [
  { store: "Gói Shopify, email riêng, có phone, tên riêng, 12 sản phẩm, đang mở", math: "3 + 2 + 1 + 1 + 2 + 1", total: 10 },
  { store: "Basic, Gmail, không phone, tên riêng, 3 sản phẩm, đang mở", math: "1 + 0 + 0 + 1 + 1 + 1", total: 4 },
  { store: "Password, gói Shopify, email riêng, tên riêng, onboarding create", math: "3 + 2 + 1 + 1", total: 7, password: true },
  { store: "Password, Basic, Gmail, tên riêng, onboarding create", math: "1 + 1 + 1", total: 3, password: true },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4">
      <h3 className="text-[13px] font-semibold text-pf-text">{title}</h3>
      {children}
    </section>
  );
}

const TH = "px-3 py-2 font-semibold";
const TD = "px-3 py-2 align-top";

export function LeadCriteria({ threshold, minProducts, controlPercent }: { threshold: number; minProducts: number; controlPercent: number }) {
  return (
    <div className="grid gap-4 text-[13px] text-pf-body">
      <p className="text-pf-muted">
        Mỗi giờ BPU Ops quét store vừa cài PageFly, chấm điểm từng store theo bảng dưới rồi quyết định store nào thành lead. Các
        ngưỡng lấy từ tab <strong className="text-pf-text">Cài đặt</strong>, đổi ở đó là áp dụng từ lần quét sau.
      </p>

      <Section title="1. Điểm cộng / trừ">
        <div className="overflow-x-auto rounded-pf-card border border-pf-border">
          <table className="w-full text-left text-[12.5px]">
            <thead className="bg-pf-card-hi text-[11px] uppercase tracking-[0.06em] text-pf-faint">
              <tr>
                <th className={TH}>Tiêu chí</th>
                <th className={TH}>Điều kiện</th>
                <th className={`${TH} text-right`}>Điểm</th>
              </tr>
            </thead>
            <tbody>
              {RULES.map((r) => (
                <tr key={r.group + r.when} className="border-t border-pf-border">
                  <td className={`${TD} whitespace-nowrap font-semibold text-pf-text`}>{r.group}</td>
                  <td className={TD}>{r.when}</td>
                  <td className={`${TD} text-right font-semibold ${r.tone === "plus" ? "text-pf-success" : "text-pf-danger"}`}>{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-pf-muted">
          Tối đa <strong className="text-pf-text">13 điểm</strong> với store đang mở, <strong className="text-pf-text">10 điểm</strong> với
          store để password (không có điểm sản phẩm và điểm storefront mở).
        </p>
      </Section>

      <Section title="2. Điều kiện thành lead (xét theo thứ tự)">
        <ol className="grid list-decimal gap-2 pl-5">
          <li>
            <strong className="text-pf-text">App phải đang cài.</strong> Store đã gỡ PageFly thì loại.
          </li>
          <li>
            <strong className="text-pf-text">Store đang mở phải có từ {minProducts} sản phẩm công khai</strong> (
            <code>min_products</code>). Thiếu thì loại với lý do &ldquo;No public products&rdquo;, rồi được kiểm lại ở mốc 24 giờ và 72 giờ sau
            khi cài. Store để password không bị loại ở bước này.
          </li>
          <li>
            <strong className="text-pf-text">Điểm phải từ {threshold} trở lên</strong> (<code>score_threshold</code>). Thấp hơn thì loại.
          </li>
          <li>
            Đạt cả ba thì thành lead. <strong className="text-pf-text">{controlPercent}%</strong> lead vào nhóm{" "}
            <strong className="text-pf-text">Đối chứng</strong> (<code>control_percent</code>): không build, chỉ để so tỉ lệ nâng cấp. Số còn
            lại vào <strong className="text-pf-text">Hàng đợi build</strong>.
          </li>
        </ol>
      </Section>

      <Section title="3. Store để password">
        <ul className="grid list-disc gap-2 pl-5">
          <li>Vẫn được chấm điểm và vẫn có thể thành lead, nhưng Builder không đọc được sản phẩm của store.</li>
          <li>
            Builder dựng <strong className="text-pf-text">page mẫu theo ngành</strong>: tên store, ngôn ngữ theo quốc gia, ảnh miễn phí bản
            quyền, sản phẩm ví dụ, không ghi giá. Ngành lấy từ loại sản phẩm chủ store chọn lúc onboarding (Mixpanel), nếu không có thì đoán
            từ tên store. Không đoán được ngành thì lead bị bỏ qua.
          </li>
          <li>
            Page mẫu có ghi chú &ldquo;Page mẫu: store đang để password…&rdquo; trong ghi chú build. Tin nhắn gửi khách nói page &ldquo;ready for your
            own products and photos&rdquo; thay vì &ldquo;built with your own products&rdquo;.
          </li>
          <li>
            Vì mất điểm sản phẩm và điểm storefront mở, phần lớn store để password nhỏ (Basic, Gmail) sẽ dưới ngưỡng {threshold} điểm.
          </li>
        </ul>
      </Section>

      <Section title={`4. Ví dụ (ngưỡng hiện tại: ${threshold} điểm)`}>
        <div className="overflow-x-auto rounded-pf-card border border-pf-border">
          <table className="w-full text-left text-[12.5px]">
            <thead className="bg-pf-card-hi text-[11px] uppercase tracking-[0.06em] text-pf-faint">
              <tr>
                <th className={TH}>Store</th>
                <th className={TH}>Cách tính</th>
                <th className={`${TH} text-right`}>Tổng</th>
                <th className={TH}>Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {EXAMPLES.map((e) => {
                const ok = e.total >= threshold;
                return (
                  <tr key={e.store} className="border-t border-pf-border">
                    <td className={TD}>{e.store}</td>
                    <td className={`${TD} whitespace-nowrap text-pf-muted`}>{e.math}</td>
                    <td className={`${TD} text-right font-semibold text-pf-text`}>{e.total}</td>
                    <td className={`${TD} whitespace-nowrap font-semibold ${ok ? "text-pf-success" : "text-pf-danger"}`}>
                      {ok ? (e.password ? "Lead, page mẫu" : "Lead") : `Loại (dưới ${threshold})`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
