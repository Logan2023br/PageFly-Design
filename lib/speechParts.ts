/* ==========================================================================
   A notice read out in two voices: the Vietnamese of it in a Vietnamese
   voice, the English words in it — "Upsell Responsive", "upgrade",
   "review", a store's name — in an English one, so neither is read with
   the other's accent.

   Word by word: a Vietnamese letter (ă, ơ, đ, a tone mark…) makes a word
   Vietnamese, and so does one of the few Vietnamese words written without
   one (tin, xin, ngay…); any other word of plain letters is English.
   Single letters and signs go with the word before them ("bản B" is
   Vietnamese); a number is read in English only between two English words
   ("Builder 5-slot", "Build 2 page"), else in Vietnamese ("5★" is "năm
   sao"). A capitalised word with no mark beside a capitalised Vietnamese
   one is part of a Vietnamese name ("Cửa Hàng Hoa"). Names in capitals are
   read as words, not spelled out.

   No server-only import: the bell in the browser uses it.
   ========================================================================== */

export type SpeechPart = { lang: "vi" | "en"; text: string };

const VI_LETTERS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

/** Vietnamese words that carry no mark — read in Vietnamese all the same. */
const VI_PLAIN = new Set(["xin", "tin", "sao", "ngay", "theo", "cho", "anh", "em", "nay", "khi", "hay", "xong", "con", "trong", "ra", "vao", "la", "va"]);

type Kind = "vi" | "en" | "any" | "num";

function kindOf(word: string): Kind {
  const core = word.replace(/[^\p{L}\p{N}]/gu, "");
  if (!core) return "any";
  if (VI_LETTERS.test(core)) return "vi";
  if (/^\p{N}+$/u.test(core)) return "num";
  if (core.length === 1) return "any";
  return VI_PLAIN.has(core.toLowerCase()) ? "vi" : "en";
}

/** "SUN COAST" → "Sun Coast": a voice spells capitals out. */
const unshout = (w: string) => (/^\p{Lu}{2,}$/u.test(w.replace(/[^\p{L}]/gu, "")) ? w.charAt(0) + w.slice(1).toLowerCase() : w);

export function speechParts(text: string): SpeechPart[] {
  const words = text
    .replace(/★/g, " sao")
    .replace(/\s+[—–]\s+/g, ", ")
    .split(/\s+/)
    .filter(Boolean);
  const kinds = words.map(kindOf);
  const cap = (w: string | undefined) => !!w && /^\p{Lu}/u.test(w.replace(/^[^\p{L}]+/u, ""));
  /* an unmarked capitalised word beside a capitalised Vietnamese one: the same Vietnamese name */
  for (let pass = 0; pass < 2; pass++)
    kinds.forEach((k, i) => {
      if (k === "en" && cap(words[i]) && ((kinds[i - 1] === "vi" && cap(words[i - 1])) || (kinds[i + 1] === "vi" && cap(words[i + 1])))) kinds[i] = "vi";
    });
  const near = (i: number, step: number): "vi" | "en" | null => {
    for (let j = i + step; j >= 0 && j < kinds.length; j += step) if (kinds[j] === "vi" || kinds[j] === "en") return kinds[j] as "vi" | "en";
    return null;
  };
  const langs = kinds.map((k, i): "vi" | "en" => {
    if (k === "vi" || k === "en") return k;
    /* a number: English only inside English, else Vietnamese */
    if (k === "num") return near(i, -1) === "en" && near(i, 1) === "en" ? "en" : "vi";
    /* a letter or a sign: the word before, else the one after */
    return near(i, -1) ?? near(i, 1) ?? "vi";
  });
  const out: SpeechPart[] = [];
  words.forEach((w, i) => {
    const word = langs[i] === "en" ? unshout(w) : w;
    const last = out[out.length - 1];
    if (last && last.lang === langs[i]) last.text += ` ${word}`;
    else out.push({ lang: langs[i], text: word });
  });
  return out;
}
