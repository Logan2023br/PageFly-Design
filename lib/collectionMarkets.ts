/* ==========================================================================
   Collection pages by market — which language a set is written in, and, for
   the Japanese sets, the Japanese words /collection-pages/ja shows them with.

   A set's language is not typed in anywhere: it is read from its own pages'
   `<html lang>` (lib/collectionLanguage.ts), so a new set lands under the
   right chip with no admin step. This file only names the languages and
   carries the Japanese copy, which a page cannot supply about itself.

   Client-safe: no database, no Node.
   ========================================================================== */

export type LangCode = "ja" | "en" | "zh" | "ko" | "ar" | "fr" | "it" | "tr" | "other";

/** chip label, card badge — in order of the chips */
export const LANGS: { code: LangCode; label: string; badge: string }[] = [
  { code: "ja", label: "日本語 Japanese", badge: "JP 日本語" },
  { code: "en", label: "English", badge: "EN" },
  { code: "zh", label: "中文 Chinese", badge: "ZH 中文" },
  { code: "ko", label: "한국어 Korean", badge: "KO 한국어" },
  { code: "ar", label: "العربية Arabic", badge: "AR العربية" },
  { code: "fr", label: "Français", badge: "FR" },
  { code: "it", label: "Italiano", badge: "IT" },
  { code: "tr", label: "Türkçe", badge: "TR" },
  { code: "other", label: "Other", badge: "" },
];

/** "en-US" → "en", "zh-TW" → "zh"; English when the page names none. */
export function langOf(tag: string | null | undefined): LangCode {
  const base = (tag ?? "").trim().toLowerCase().split(/[-_]/)[0];
  if (!base) return "en";
  return (LANGS.find((l) => l.code === base)?.code ?? "other") as LangCode;
}

export const langInfo = (code: LangCode) => LANGS.find((l) => l.code === code) ?? LANGS[LANGS.length - 1];

/* --------------------------------------------------------------------------
   THE JAPANESE SETS, IN JAPANESE. Industry (for /ja's filter), a one-line
   category and a short description. A Japanese set missing here still shows
   on /ja, under その他 with its English blurb.
   -------------------------------------------------------------------------- */

export type JpIndustry = "fashion" | "beauty" | "kitchen" | "jewelry" | "craft" | "travel" | "camera" | "other";

export const JP_INDUSTRIES: { id: JpIndustry; label: string }[] = [
  { id: "fashion", label: "アパレル" },
  { id: "beauty", label: "コスメ・スキンケア" },
  { id: "kitchen", label: "キッチン" },
  { id: "jewelry", label: "ジュエリー" },
  { id: "craft", label: "雑貨・クラフト" },
  { id: "travel", label: "旅館・宿泊" },
  { id: "camera", label: "カメラ・レンタル" },
  { id: "other", label: "その他" },
];

export type JpCopy = { industry: JpIndustry; category: string; desc: string; isNew?: boolean };

export const JP_COPY: Record<string, JpCopy> = {
  sunpodo: {
    industry: "fashion",
    category: "アパレル（受注生産）",
    desc: "オックスフォードブルー×キャメル。昭和の百貨店の注文票をモチーフに、採寸から注文までを1ページで。",
    isNew: true,
  },
  hosaki: {
    industry: "beauty",
    category: "化粧筆・コスメ",
    desc: "熊野筆の工房をイメージ。パウダーホワイトとバイオレットに、紅の差し色。",
    isNew: true,
  },
  shinogi: {
    industry: "kitchen",
    category: "包丁・調理器具",
    desc: "鉄紺と鋼のトーンに、焼き戻しのブロンズ。刃角12°のラインを全ページに。",
    isNew: true,
  },
  sekka: {
    industry: "jewelry",
    category: "ジュエリー",
    desc: "雪と墨のパレットにトルマリンローズ。カラーストーン・ラボグロウンダイヤ向け。",
    isNew: true,
  },
  muroka: {
    industry: "beauty",
    category: "スキンケア（酒粕）",
    desc: "温かい白と墨にプラムの差し色。カードを裏返すと酒の裏ラベルが現れます。",
    isNew: true,
  },
  "wabi-kobo": {
    industry: "craft",
    category: "陶器・クラフト",
    desc: "和紙の白と藍。明朝体で、手仕事の器をわびさびの世界観で見せます。",
  },
  "kumo-ryokan": {
    industry: "travel",
    category: "旅館・宿泊",
    desc: "富士山麓の温泉旅館。和紙と松の緑に金。予約導線つき。",
  },
  "ink-and-paper": {
    industry: "craft",
    category: "文具・和紙",
    desc: "京都の文具店。和紙と朱色のインク、手ざわりのある書体で。",
  },
  "aperture-rental": {
    industry: "camera",
    category: "フィルムカメラ・レンタル",
    desc: "フィルムカメラの1日レンタル。あたたかい紙の色とオレンジ、アナログな明朝体。",
  },
  "neo-tokyo": {
    industry: "fashion",
    category: "ストリートウェア",
    desc: "渋谷のストリートブランドの新作ドロップ。黒とネオンピンク、夜の街。",
  },
  "neon-noir": {
    industry: "fashion",
    category: "ストリートウェア",
    desc: "渋谷のストリートウェア。ミッドナイトとネオンピンクのサイバーノワール。",
  },
};

/** The five new Japanese sets, in the order the "Made for Japan" strip shows them. */
export const JP_FEATURED = ["sunpodo", "hosaki", "shinogi", "sekka", "muroka"];
