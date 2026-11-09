/* ==========================================================================
   The bell's voice: each notice split into Vietnamese and English parts.

       npx tsx scripts/test-speech-parts.ts
   ========================================================================== */

import { speechParts, type SpeechPart } from "../lib/speechParts";

let failed = 0;
function check(text: string, want: SpeechPart[], what: string) {
  const got = speechParts(text);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ✓ ${what}`);
  else {
    failed++;
    console.log(`  ✗ ${what}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
  }
}
const vi = (text: string): SpeechPart => ({ lang: "vi", text });
const en = (text: string): SpeechPart => ({ lang: "en", text });

check(
  "Upsell Responsive: khách SUN COAST ELEMENTS (bản B) vừa phản hồi tin nhắn.",
  [en("Upsell Responsive:"), vi("khách"), en("Sun Coast Elements"), vi("(bản B) vừa phản hồi tin nhắn.")],
  "English product and store name, Vietnamese around them; capitals read as words; bản B in Vietnamese",
);
check(
  "Xin chúc mừng! Upsell Responsive có user upgrade mới: Pet Felice (bản B), lên gói Builder 5-slot Monthly.",
  [vi("Xin chúc mừng!"), en("Upsell Responsive"), vi("có"), en("user upgrade"), vi("mới:"), en("Pet Felice"), vi("(bản B), lên gói"), en("Builder 5-slot Monthly.")],
  "unmarked Vietnamese words (Xin) stay Vietnamese; a plan name stays English",
);
check("Upsell Responsive: khách mystore (bản A) vừa review 5★.", [en("Upsell Responsive:"), vi("khách"), en("mystore"), vi("(bản A) vừa"), en("review"), vi("5 sao.")], "5★ is read năm sao");
check("Build 2 page: khách Cửa Hàng Hoa vừa phản hồi tin nhắn.", [en("Build 2 page:"), vi("khách Cửa Hàng Hoa vừa phản hồi tin nhắn.")], "a number inside English is English; a Vietnamese name stays whole");
check("Claude Build báo lỗi.", [en("Claude Build"), vi("báo lỗi.")], "two parts");

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
