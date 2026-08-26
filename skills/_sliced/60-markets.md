---
scope: design
load: sliced
name: markets
version: 1.0
---

# Markets

One block per market, spliced in when the merchant picked one. Everything here
is a COMMERCIAL fact — what a shopper in that market looks for before they trust
a store, and what the page has to say to answer them.

Nothing here describes colour, type or layout. Those belong to the visual style
the merchant chose, and a market that overrode them would be overriding a
control the merchant actively pressed.

A page for a market with more to say ends up longer. That is a consequence of
carrying more facts, not a licence to pad.

<!--#us-->
**United States**
```
language   English (US)
price      $68.00 — dot decimal, tax excluded and not mentioned
payment    card, Apple Pay, Shop Pay; buy-now-pay-later is common (Klarna,
           Afterpay, Affirm) and worth naming when the price is over $80
delivery   free shipping over a threshold is the expectation, not a perk;
           name the threshold. 2-5 business days reads as normal
returns    30 days, free return shipping. Say the window as a number
trust      reviews with a count, a named guarantee, press logos
legal      nothing required on the page
reviews    a rating out of 5 and a count. Hundreds reads as established
```
Shoppers here decide fast and abandon fast. The facts that keep them are
shipping cost, return window and social proof, in that order.
<!--/-->

<!--#uk-->
**United Kingdom**
```
language   English (UK) — spelling is British: colour, jewellery, personalise
price      £58.00 — VAT INCLUDED, and saying so is worth a line
payment    card, Apple Pay, PayPal, Klarna
delivery   free UK delivery over a threshold; next-day is a paid upgrade worth
           naming. Say "delivery", not "shipping"
returns    14 days is the legal minimum; 30 reads as generous. Free returns
           is a differentiator rather than an assumption
trust      Trustpilot, a real UK address, VAT number for B2B
legal      "VAT included" where the price is shown
reviews    a rating out of 5, Trustpilot if they have it
```
Understatement carries further than superlatives here. A guarantee stated
plainly beats the same guarantee in capitals.
<!--/-->

<!--#in-->
**India**
```
language   English (India) unless the brief is in Hindi
price      ₹2,499 — Indian digit grouping (₹1,00,000 for one lakh), inclusive
           of GST, and say so
payment    UPI is the default. Cash on delivery is expected and its absence
           needs explaining. EMI at 3/6/9 months for anything over ₹3,000
delivery   3-5 days metro, 5-8 days elsewhere. Free delivery over a threshold
returns    7 days is the norm. Easy returns and a pickup, not a drop-off
trust      COD availability, a return window, a phone number, GST invoice
legal      "GST included" or "Inclusive of all taxes" where the price is shown
reviews    a rating and a count; photos in reviews carry real weight
```
Payment flexibility is a trust signal here, not a checkout detail — UPI, COD and
EMI answer the question "what if this goes wrong", and a page that leaves them
to the checkout has left the question open.
<!--/-->

<!--#cn-->
**China**
```
language   简体中文
price      ¥498 — no decimals on whole amounts
payment    支付宝 (Alipay), 微信支付 (WeChat Pay); card is not the default
delivery   次日达 or 48小时发货 — speed stated in hours or days, named
returns    7天无理由退货 is the legal standard and shoppers expect the phrase
trust      销量 (units sold), 好评率 (positive rating share), 官方旗舰店
legal      "7天无理由退货" where returns are mentioned
reviews    买家秀 — buyer photos, with counts. Volume is the proof
```
Volume sold and positive-review share do the work a Western page gives to a
guarantee badge. Say the numbers.
<!--/-->

<!--#jp-->
**Japan**
```
language   日本語
price      ¥5,480（税込）— tax-included, and the 税込 marker is expected
payment    クレジットカード, コンビニ払い, 代金引換, PayPay
delivery   a named date, not a range, and 送料無料 above a threshold
returns    stated plainly with its window; unopened-only is normal and should
           be said rather than hidden
trust      specifications in a table, materials named, country of manufacture
legal      税込 on the price; 特定商取引法 details belong in the footer
reviews    detailed and specific; a short review reads as no review
```
Precision is the trust signal. A spec table with eight rows does more here than
a paragraph of benefits, and vagueness reads as evasion.
<!--/-->

<!--#de-->
**Germany**
```
language   Deutsch
price      58,00 € — comma decimal, symbol after the number, inkl. MwSt.
payment    Rechnung (invoice) matters and its absence is felt; PayPal, Klarna,
           SEPA-Lastschrift. Card is not the default it is elsewhere
delivery   1-3 Werktage, DHL named. Versandkostenfrei ab a threshold
returns    14 days is the legal right; 30 reads as generous. Widerrufsrecht
trust      Trusted Shops, a real Impressum, Made in Germany where true
legal      "inkl. MwSt. zzgl. Versand" where the price is shown
reviews    detailed, critical, specific. Perfect scores read as fake
```
Claims need backing here. A number with a source beats an adjective, and an
unqualified superlative costs credibility rather than buying it.
<!--/-->

<!--#fr-->
**France**
```
language   Français
price      58,00 € — comma decimal, symbol after the number, TTC
payment    Carte Bancaire, PayPal, paiement en 3 fois sans frais
delivery   Colissimo or Mondial Relay named; livraison offerte above a
           threshold. Point relais is a real preference, not a fallback
returns    14 days legal, 30 generous. Retour gratuit where true
trust      Avis vérifiés, made in France where true, a French address
legal      "TTC" on the price
reviews    a rating and a count; Avis Vérifiés carries weight
```
Provenance and craft sell here. Where the thing is made, and by whom, is worth a
band of its own when there is a real answer.
<!--/-->

<!--#vn-->
**Vietnam**
```
language   Tiếng Việt
price      1.290.000₫ — dot grouping, symbol after
payment    COD dẫn đầu; chuyển khoản, Momo, ZaloPay, thẻ
delivery   2-3 ngày nội thành, 3-5 ngày tỉnh; freeship trên một mức
returns    đổi trả 7 ngày, và nói rõ ai chịu phí ship
trust      COD, hotline hiển thị, ảnh thật của khách, shop uy tín
legal      giá đã bao gồm VAT nếu có xuất hoá đơn
reviews    ảnh thật và bình luận ngắn; số lượng đã bán có sức nặng
```
Cash on delivery and a visible phone number carry most of the trust here.
Customer photographs beat studio photographs for proof.
<!--/-->

<!--#id-->
**Indonesia**
```
language   Bahasa Indonesia
price      Rp249.000 — dot grouping, no decimals
payment    COD, transfer bank, GoPay, OVO, DANA, ShopeePay; cicilan 0%
delivery   JNE, J&T or SiCepat named; gratis ongkir above a threshold
returns    garansi 7 hari, and say who pays the return
trust      COD, gratis ongkir, testimoni with photographs, admin responsif
legal      harga sudah termasuk PPN where applicable
reviews    photographs and short comments; terjual counts carry weight
```
Free shipping is the single strongest lever here — when it exists, it belongs
where it is seen before the price.
<!--/-->

<!--#br-->
**Brazil**
```
language   Português (Brasil)
price      R$ 349,00 — comma decimal, and "em até 12x sem juros" matters as
           much as the price itself
payment    Pix (instant, and often discounted — say the discount), cartão em
           até 12x, boleto
delivery   Correios or a named carrier; frete grátis above a threshold
returns    7 days is the Código de Defesa do Consumidor right; say it
trust      parcelamento, frete grátis, site seguro, CNPJ
legal      "à vista no Pix" beside the instalment price
reviews    a rating and a count; photographs help
```
The instalment line is not a payment detail here, it is the price. A page that
shows only the total has hidden the number the shopper is deciding on.
<!--/-->

<!--#gulf-->
**Gulf (UAE, Saudi Arabia)**
```
language   English, unless the brief is in Arabic — then العربية, and the page
           reads right-to-left
price      AED 249 or ﷼ 249 — no decimals on whole amounts
payment    card, Apple Pay, Tabby and Tamara (buy-now-pay-later, widely used),
           cash on delivery
delivery   same-day or next-day in the major cities and worth naming; free
           delivery above a threshold
returns    14 days, free returns where true
trust      COD, fast delivery, authenticity guarantee for anything branded
legal      VAT included where applicable
reviews    a rating and a count
```
Speed and authenticity are the two questions. Counterfeits are a live worry in
several categories, so a guarantee of genuineness earns its place.
<!--/-->

<!--#au-->
**Australia**
```
language   English (AU) — spelling is British: colour, organise
price      $68.00 AUD — say AUD, because the symbol is ambiguous here
payment    card, Apple Pay, PayPal, Afterpay and Zip
delivery   Australia Post named; free shipping above a threshold, and 3-7
           business days is normal outside the capitals
returns    30 days reads as standard
trust      Australian owned where true, local warehouse, ACCC-safe claims
legal      GST included where the price is shown
reviews    a rating and a count
```
Distance is the objection. Where the stock ships from, and how long it really
takes to the states away from the capitals, is worth saying plainly.
<!--/-->
