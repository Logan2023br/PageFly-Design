import type { ShowcasePage, ShowcaseSet } from "./showcasePages";

/* ==========================================================================
   THE SETS SHIPPED FOR /collection-pages-preview.

   Ten stores, seven pages each, written into `public/collection-sets/<set>/`
   from PageFly's own exports — the same two files per page as
   `public/showcase/`. Unlike the showcase sets they are not on the landing
   page: they reach the table through admin's import, land as "Visible
   preview", and are judged on /collection-pages-preview before any of them is
   switched to Visible.

   The page slugs follow the showcase sets', so every set reads the same in
   analytics: home, product-page, collection-page, about-us, contact,
   blog-article, and a sale named after its own offer.

   NOT EVERY SET IS A SHOP. Northwind, Atlas Studio, Kinetik, Roam Diaries,
   Salt & Smoke, Kumo Ryokan, Brightline Pros and Off The Record are a SaaS, a
   studio, an agency, two creators, an inn, a home-services firm and a podcast,
   and their seven pages are their own — the ten BFCM sets are seven pages of one
   Black Friday / Cyber Monday campaign, and the ten festival sets (Halloween to
   Tết) are a seasonal store's home, sale, countdown, gift boxes, guide, journal
   and last-minute page, and the ten subscription boxes are a box's home, plans,
   builder, product, how-it-works, gift and journal pages: each is listed whole, with the shared pages (home,
   about-us, contact, blog-article) keeping the shared slugs.
   ========================================================================== */

/** The seven pages, in the order a merchant meets them; only the sale differs. */
function pages(sale: { slug: string; label?: string }): ShowcasePage[] {
  return [
    { slug: "home", label: "Home", blurb: "The front page — what the store is, in one scroll." },
    {
      slug: "product-page",
      label: "Product",
      blurb: "One product, with the facts an order needs before it is placed.",
    },
    {
      slug: "collection-page",
      label: "Collection",
      blurb: "A category, laid out so a browser can choose.",
    },
    { slug: "about-us", label: "About", blurb: "Who is behind the shop, and why it exists." },
    { slug: "contact", label: "Contact", blurb: "How to reach a person, and what to expect back." },
    {
      slug: "blog-article",
      label: "Blog article",
      blurb: "A piece worth reading, with the products it mentions beside it.",
    },
    {
      slug: sale.slug,
      label: sale.label ?? "Sale",
      blurb: "A dated offer: countdown, tiers and a code, built to end.",
    },
  ];
}

const HOME: ShowcasePage = {
  slug: "home",
  label: "Home",
  blurb: "The front page — what it is, in one scroll.",
};
const ABOUT: ShowcasePage = { slug: "about-us", label: "About", blurb: "Who is behind it, and why it exists." };
const CONTACT: ShowcasePage = {
  slug: "contact",
  label: "Contact",
  blurb: "How to reach a person, and what to expect back.",
};

/* A Black Friday / Cyber Monday campaign: the main sale first, as the set's
   cover, then the campaign in the order it runs. */
function bfcm(): ShowcasePage[] {
  return [
    {
      slug: "black-friday-sale",
      label: "Black Friday",
      blurb: "The main event: the headline discount, the countdown and the best sellers.",
    },
    { slug: "early-access", label: "Early access", blurb: "The sign-up that lets the list shop first." },
    { slug: "doorbusters", label: "Doorbusters", blurb: "Limited-stock drops, released through the weekend." },
    { slug: "bundles", label: "Bundles", blurb: "Sets that cost less together than apart." },
    { slug: "cyber-monday", label: "Cyber Monday", blurb: "One more day, online only, with a code on top." },
    { slug: "gift-guide", label: "Gift guide", blurb: "Gifts by recipient and by budget." },
    { slug: "last-chance", label: "Last chance", blurb: "The extension: final hours, and the order-by date." },
  ];
}

/* A seasonal store: home first, as the set's cover, then the sale, the
   countdown and the boxed gifts, and the pages every festival shares. */
const GIFT_GUIDE: ShowcasePage = { slug: "gift-guide", label: "Gift guide", blurb: "Gifts by recipient and by budget." };
const LAST_MINUTE: ShowcasePage = {
  slug: "last-minute",
  label: "Last minute",
  blurb: "The order-by dates, express delivery and e-gift cards.",
};
const JOURNAL: ShowcasePage = {
  slug: "journal-article",
  label: "Journal",
  blurb: "A how-to for the season, with the products it uses beside it.",
};
function festival(
  sale: ShowcasePage,
  countdown: ShowcasePage,
  boxes: ShowcasePage,
  read: ShowcasePage = JOURNAL,
): ShowcasePage[] {
  return [HOME, sale, countdown, boxes, GIFT_GUIDE, read, LAST_MINUTE];
}

/* A subscription box: home first, as the set's cover, then the plans, the
   box builder and one product, then how it works, gifting and the journal. */
function subscription(): ShowcasePage[] {
  return [
    HOME,
    {
      slug: "subscription-plans",
      label: "Plans",
      blurb: "The plans side by side: what each box holds, and what it saves.",
    },
    { slug: "build-your-box", label: "Build your box", blurb: "Pick the items, watch the price drop." },
    { slug: "product-page", label: "Product", blurb: "One item, with subscribe-and-save beside buy-once." },
    { slug: "how-it-works", label: "How it works", blurb: "Choose, receive, skip or cancel — in steps." },
    { slug: "gift-a-subscription", label: "Gift a subscription", blurb: "A box for someone else, prepaid." },
    JOURNAL,
  ];
}

export const PREVIEW_SETS: ShowcaseSet[] = [
  {
    id: "aurum",
    name: "Aurum",
    blurb: "A fine-jewellery atelier — near-black and antique gold, Cormorant serif, quiet luxury.",
    pages: pages({ slug: "private-sale", label: "Private sale" }),
  },
  {
    id: "volt",
    name: "VOLT",
    blurb: "A streetwear drop label — black and acid lime, Anton caps, countdowns everywhere.",
    pages: pages({ slug: "archive-sale" }),
  },
  {
    id: "dew",
    name: "Dew",
    blurb: "Clean, vegan skincare — oat cream and sage green, Fraunces serif, soft and calm.",
    pages: pages({ slug: "glow-week-sale" }),
  },
  {
    id: "nova",
    name: "Nova",
    blurb: "Consumer audio and wearables — deep navy, electric blue to violet, Sora, product-launch polish.",
    pages: pages({ slug: "cyber-week-sale" }),
  },
  {
    id: "pip-and-pop",
    name: "Pip & Pop",
    blurb: "Wooden toys for kids — indigo and sunshine yellow, Baloo rounded type, playful.",
    pages: pages({ slug: "summer-toy-sale" }),
  },
  {
    id: "ember-roast",
    name: "Ember Roast",
    blurb: "A specialty coffee roaster — espresso brown and ember orange, Playfair serif, warm.",
    pages: pages({ slug: "clearance-sale" }),
  },
  {
    id: "oaken",
    name: "Oaken",
    blurb: "Scandinavian solid-wood furniture — linen white and oak, Instrument Serif, calm space.",
    pages: pages({ slug: "sample-sale" }),
  },
  {
    id: "forge",
    name: "Forge",
    blurb: "Sports supplements — charcoal and signal red, Bebas Neue caps, hard-edged.",
    pages: pages({ slug: "black-friday-sale" }),
  },
  {
    id: "pawsome",
    name: "Pawsome",
    blurb: "A pet-supplies shop — teal and tangerine on cream, Fredoka rounded type, friendly.",
    pages: pages({ slug: "pet-week-sale" }),
  },
  {
    id: "maison-lune",
    name: "Maison Lune",
    blurb: "Slow fashion for women — blush ivory and dusty rose, Bodoni Moda, editorial.",
    pages: pages({ slug: "archive-sale" }),
  },
  {
    id: "northwind",
    name: "Northwind",
    blurb: "A B2B analytics SaaS — midnight navy and electric indigo, Plus Jakarta Sans, dashboard-crisp.",
    pages: [
      HOME,
      { slug: "platform", label: "Platform", blurb: "What the product does, feature by feature." },
      { slug: "pricing", label: "Pricing", blurb: "The plans side by side, and what each one includes." },
      { slug: "customers", label: "Customers", blurb: "Logos, numbers and the teams who already run on it." },
      ABOUT,
      CONTACT,
      {
        slug: "blog-article",
        label: "Blog article",
        blurb: "A long read that teaches, with the product beside it.",
      },
    ],
  },
  {
    id: "atlas-studio",
    name: "Atlas Studio",
    blurb: "An architecture and interiors practice — stone grey and ink, Syne display, gallery-quiet.",
    pages: [
      HOME,
      { slug: "projects", label: "Projects", blurb: "The built work, filterable by kind." },
      { slug: "project-detail", label: "Project", blurb: "One building, told in pictures and facts." },
      { slug: "services", label: "Services", blurb: "What the studio does, from first sketch to handover." },
      { slug: "studio", label: "Studio", blurb: "The people and the way they work." },
      { slug: "journal-article", label: "Journal", blurb: "An essay from the studio's journal." },
      CONTACT,
    ],
  },
  {
    id: "kinetik",
    name: "Kinetik",
    blurb: "A creative agency — lilac white, hot coral and violet, Unbounded display, loud motion.",
    pages: [
      HOME,
      { slug: "work", label: "Work", blurb: "Selected projects, filterable by discipline." },
      { slug: "case-study", label: "Case study", blurb: "One launch, from brief to results." },
      { slug: "services", label: "Services", blurb: "What the agency does, and how an engagement runs." },
      ABOUT,
      { slug: "insights-article", label: "Insights", blurb: "A point of view, written to be shared." },
      CONTACT,
    ],
  },
  {
    id: "roam-diaries",
    name: "Roam Diaries",
    blurb: "A slow-travel YouTube creator — deep teal and terracotta on sand, Archivo Black, warm.",
    pages: [
      HOME,
      { slug: "videos", label: "Videos", blurb: "Every episode, browsable by destination and series." },
      { slug: "episode", label: "Episode", blurb: "One episode, with the notes and places from it." },
      { slug: "travel-guide", label: "Travel guide", blurb: "An honest guide to one place, to read before going." },
      { slug: "shop", label: "Shop", blurb: "Presets, prints and gear — the creator's own store." },
      { slug: "collab", label: "Collab", blurb: "For brands: the audience, the formats and how to ask." },
      ABOUT,
    ],
  },
  {
    id: "salt-and-smoke",
    name: "Salt & Smoke",
    blurb: "A home-cooking channel — charred black and saffron, DM Serif Display, kitchen heat.",
    pages: [
      HOME,
      { slug: "episodes", label: "Episodes", blurb: "Every recipe video, browsable by craving and time." },
      { slug: "watch", label: "Watch", blurb: "One episode, with the recipe under the video." },
      { slug: "recipe-article", label: "Recipe", blurb: "A written recipe, step by step." },
      { slug: "shop", label: "Shop", blurb: "Cookware, sauces and the cookbook." },
      ABOUT,
      CONTACT,
    ],
  },
  {
    id: "verdant",
    name: "Verdant",
    blurb: "A house-plant shop — sage mist and forest green, Gloock serif, fresh and botanical.",
    pages: pages({ slug: "spring-plant-sale" }),
  },
  {
    id: "optique",
    name: "Optique",
    blurb: "Designer eyewear — violet and sunshine yellow, Bricolage Grotesque, bright and bold.",
    pages: pages({ slug: "summer-sale" }),
  },
  {
    id: "cuvee",
    name: "Cuvee",
    blurb: "A small-producer wine merchant — burgundy and champagne gold, Marcellus, cellar elegance.",
    pages: pages({ slug: "cellar-clearance" }),
  },
  {
    id: "summit-supply",
    name: "Summit Supply",
    blurb: "Outdoor gear — moss green on canvas, Big Shoulders caps, rugged and trail-tested.",
    pages: pages({ slug: "end-of-season-sale" }),
  },
  {
    id: "wick-house",
    name: "Wick House",
    blurb: "Hand-poured candles — smoky brown and amber glow, Young Serif, slow evenings.",
    pages: pages({ slug: "winter-glow-sale" }),
  },
  {
    id: "cha-yun",
    name: "Cha Yun",
    blurb: "A Chinese tea house, in Chinese — rice paper and cinnabar red, brush calligraphy, calm.",
    pages: pages({ slug: "mid-autumn-sale" }),
  },
  {
    id: "hua-yan",
    name: "Hua Yan",
    blurb: "Guochao cosmetics, in Chinese — oxblood and palace gold, ZCOOL display, ornate.",
    pages: pages({ slug: "double-11-sale" }),
  },
  {
    id: "zhixin",
    name: "Zhixin",
    blurb: "A smart-home brand, in Chinese — deep navy, azure and aqua, launch-event tech.",
    pages: pages({ slug: "618-sale" }),
  },
  {
    id: "rangoli-house",
    name: "Rangoli House",
    blurb: "Handwoven Indian ethnic wear — plum, magenta and marigold, Rozha One, festive.",
    pages: pages({ slug: "diwali-sale" }),
  },
  {
    id: "spice-route",
    name: "Spice Route",
    blurb: "Farm-direct Indian spices — roasted brown and turmeric gold, Yatra One, earthy.",
    pages: pages({ slug: "harvest-festival-sale" }),
  },
  {
    id: "dar-al-oud",
    name: "Dar Al Oud",
    blurb: "An oud and perfume house, in Arabic, right to left — black and gold, Ruqaa script, opulent.",
    pages: pages({ slug: "ramadan-eid-sale" }),
  },
  {
    id: "halawiyat-baghdad",
    name: "Halawiyat Baghdad",
    blurb: "A Baghdad sweets bakery, in Arabic, right to left — cream and pistachio green, Kufi, homely.",
    pages: pages({ slug: "eid-sale" }),
  },
  {
    id: "wabi-kobo",
    name: "Wabi Kobo",
    blurb: "Handmade Japanese ceramics, in Japanese — washi white and indigo, Mincho serif, wabi-sabi.",
    pages: pages({ slug: "kura-dashi-sale" }),
  },
  {
    id: "neo-tokyo",
    name: "Neo Tokyo",
    blurb: "Shibuya streetwear drops, in Japanese — black and neon pink, Dela Gothic, night city.",
    pages: pages({ slug: "archive-sale" }),
  },
  {
    id: "kumo-ryokan",
    name: "Kumo Ryokan",
    blurb: "A hot-spring inn below Mt. Fuji, in Japanese — washi and pine green with gold, Old Mincho, serene.",
    pages: [
      HOME,
      { slug: "rooms", label: "Rooms", blurb: "Every room type, with what each one looks out on." },
      { slug: "dining", label: "Dining", blurb: "The seasonal kaiseki, course by course." },
      { slug: "experiences", label: "Experiences", blurb: "What to do during a stay, by kind." },
      { slug: "journal-article", label: "Journal", blurb: "A letter from the inn's journal." },
      ABOUT,
      CONTACT,
    ],
  },
  {
    id: "fairway-club",
    name: "Fairway Club",
    blurb: "Country-club golf apparel — navy and ivory with gold, Libre Baskerville, preppy polish.",
    pages: pages({ slug: "clubhouse-clearance" }),
  },
  {
    id: "dink-society",
    name: "Dink Society",
    blurb: "Pickleball gear — navy, ball yellow and court orange, Rubik Mono, sporty and loud.",
    pages: pages({ slug: "summer-smash-sale" }),
  },
  {
    id: "lone-star-boot-co",
    name: "Lone Star Boot Co",
    blurb: "Handmade western boots — saddle leather brown on parchment, Rye display, Texan heritage.",
    pages: pages({ slug: "rodeo-days-sale" }),
  },
  {
    id: "smokestack-bbq",
    name: "Smokestack BBQ",
    blurb: "Kansas City BBQ sauces and rubs — charcoal, fire red and mustard, Lobster script, smoky.",
    pages: pages({ slug: "fourth-of-july-sale" }),
  },
  {
    id: "groove-swim",
    name: "Groove Swim",
    blurb: "Retro swimwear — sunset peach, tangerine and pink, Shrikhand script, '70s summer.",
    pages: pages({ slug: "end-of-summer-sale" }),
  },
  {
    id: "little-acorn",
    name: "Little Acorn",
    blurb: "Organic baby essentials — oat cream, clay pink and sage, Sniglet rounded type, gentle.",
    pages: pages({ slug: "spring-snuggle-sale" }),
  },
  {
    id: "rest-co",
    name: "Rest Co",
    blurb: "A mattress-in-a-box brand — midnight navy and lavender, Newsreader serif, dreamy calm.",
    pages: pages({ slug: "memorial-day-sale" }),
  },
  {
    id: "mane-theory",
    name: "Mane Theory",
    blurb: "Curly-hair care — cocoa, terracotta and honey gold, Abril Fatface, warm and proud.",
    pages: pages({ slug: "curl-fest-sale" }),
  },
  {
    id: "brightline-pros",
    name: "Brightline Pros",
    blurb: "A home-services company — navy and safety yellow, Oswald caps, built to get the call.",
    pages: [
      HOME,
      { slug: "services", label: "Services", blurb: "Every trade offered, with what each visit covers." },
      { slug: "service-areas", label: "Service areas", blurb: "Where the crews work, town by town." },
      { slug: "projects", label: "Projects", blurb: "Recent jobs, filterable by trade." },
      { slug: "get-a-quote", label: "Get a quote", blurb: "The estimate form, short enough to finish." },
      ABOUT,
      CONTACT,
    ],
  },
  {
    id: "off-the-record",
    name: "Off The Record",
    blurb: "A weekly podcast — cobalt, ink and hot pink, Alfa Slab One, newsroom energy.",
    pages: [
      HOME,
      { slug: "episodes", label: "Episodes", blurb: "The archive, searchable by topic and guest." },
      { slug: "episode", label: "Episode", blurb: "One episode, with the player, notes and guests." },
      { slug: "merch", label: "Merch", blurb: "The show's own store." },
      { slug: "sponsor", label: "Sponsor", blurb: "For advertisers: the audience and the ad formats." },
      ABOUT,
      {
        slug: "blog-article",
        label: "Blog article",
        blurb: "A long read that picks up where an episode left off.",
      },
    ],
  },
  {
    id: "obsidian-bfcm",
    name: "Obsidian BFCM",
    blurb: "A consumer-tech store's campaign — black and silver, Anybody display, stark and premium.",
    pages: bfcm(),
  },
  {
    id: "velvet-bfcm",
    name: "Velvet BFCM",
    blurb: "A beauty brand's campaign — blush pink and wine red, Prata serif, glossy.",
    pages: bfcm(),
  },
  {
    id: "holo-bfcm",
    name: "Holo BFCM",
    blurb: "A streetwear drop's campaign — violet, hot pink and ice blue, Michroma, holographic Y2K.",
    pages: bfcm(),
  },
  {
    id: "evergreen-bfcm",
    name: "Evergreen BFCM",
    blurb: "A home-goods store's holiday event — forest green, ivory and gold, Gilda Display, classic.",
    pages: bfcm(),
  },
  {
    id: "signal-bfcm",
    name: "Signal BFCM",
    blurb: "A boots-and-basics store's campaign — black and signal yellow, Schibsted Grotesk, brutalist.",
    pages: bfcm(),
  },
  {
    id: "aurora-bfcm",
    name: "Aurora BFCM",
    blurb: "A sleep and wellness brand's campaign — night navy, aurora mint and lilac, Gabarito, dreamy.",
    pages: bfcm(),
  },
  {
    id: "wrapped-bfcm",
    name: "Wrapped BFCM",
    blurb: "A toy and gift shop's campaign — candy red on cream, Caprasimo, Christmas cheer.",
    pages: bfcm(),
  },
  {
    id: "receipt-bfcm",
    name: "Receipt BFCM",
    blurb: "A coffee roaster's campaign — paper white, ink and orange, Martian Mono, till-receipt style.",
    pages: bfcm(),
  },
  {
    id: "atelier-bfcm",
    name: "Atelier BFCM",
    blurb: "A fashion house's private sale — stone, ink and cobalt, Cinzel caps, couture restraint.",
    pages: bfcm(),
  },
  {
    id: "plum-bfcm",
    name: "Plum BFCM",
    blurb: "A jewellery and fragrance brand's campaign — plum and peach, Petrona serif, luxe.",
    pages: bfcm(),
  },
  {
    id: "hollow-manor",
    name: "Hollow Manor",
    blurb: "A gothic Halloween house — candlelit black and blood red, Pirata One blackletter, darkly beautiful.",
    pages: festival(
      {
        slug: "halloween-sale",
        label: "Halloween sale",
        blurb: "The season's offer, with a countdown to Hallows' Eve.",
      },
      {
        slug: "13-nights",
        label: "13 Nights",
        blurb: "A new curiosity revealed each night, at its lowest price.",
      },
      { slug: "gift-sets", label: "Gift sets", blurb: "Wax-sealed boxes, priced by size." },
    ),
  },
  {
    id: "boo-crew",
    name: "Boo Crew",
    blurb: "Kids' Halloween costumes and pajamas — pumpkin orange and grape purple, Creepster, cute not scary.",
    pages: festival(
      {
        slug: "halloween-sale",
        label: "Halloween sale",
        blurb: "The season's offer, with a countdown to trick-or-treat.",
      },
      { slug: "costume-shop", label: "Costume shop", blurb: "Costumes by age and by monster." },
      { slug: "boo-bundles", label: "Boo bundles", blurb: "Costume, bucket and pajamas, cheaper together." },
      {
        slug: "party-ideas",
        label: "Party ideas",
        blurb: "A not-too-scary party for little kids, with what to buy for it.",
      },
    ),
  },
  {
    id: "deepa-diwali",
    name: "Deepa Diwali",
    blurb: "A Diwali store for India — indigo night and marigold orange, Eczar serif, festive.",
    pages: festival(
      {
        slug: "diwali-sale",
        label: "Diwali sale",
        blurb: "The festival offer, with a countdown to Lakshmi Puja.",
      },
      {
        slug: "5-days-of-diwali",
        label: "5 Days of Diwali",
        blurb: "Dhanteras to Bhai Dooj — a new offer unlocks each day.",
      },
      { slug: "festive-hampers", label: "Festive hampers", blurb: "Gift hampers, priced by size." },
    ),
  },
  {
    id: "double-eleven",
    name: "Double Eleven",
    blurb: "A Singles' Day mega sale, in Chinese — hot pink-red on blush, ZCOOL KuaiLe, loud and fast.",
    pages: festival(
      {
        slug: "mega-sale",
        label: "Mega sale",
        blurb: "The 11.11 main venue: half price, coupons and a countdown to midnight.",
      },
      { slug: "hourly-flash", label: "Hourly flash", blurb: "A limited drop on every hour of the day." },
      { slug: "bundles", label: "Bundles", blurb: "Sets that cost less together than apart." },
      {
        slug: "shopping-guide",
        label: "Shopping guide",
        blurb: "How coupons, thresholds and price protection stack.",
      },
    ),
  },
  {
    id: "frost-christmas",
    name: "Frost Christmas",
    blurb: "A Nordic Christmas home store — frost white and ice blue, Bellefair serif, quiet and calm.",
    pages: festival(
      { slug: "holiday-sale", label: "Holiday sale", blurb: "The Christmas offer, with a countdown." },
      { slug: "advent-calendar", label: "Advent calendar", blurb: "Twenty-four doors, one offer a day." },
      { slug: "gift-sets", label: "Gift sets", blurb: "Boxed sets, priced by size." },
    ),
  },
  {
    id: "jolly-and-co",
    name: "Jolly and Co",
    blurb: "A retro Christmas shop since 1952 — cream, candy red and pine green, Berkshire Swash, nostalgic.",
    pages: festival(
      { slug: "holiday-sale", label: "Holiday sale", blurb: "The Christmas offer, with a countdown." },
      {
        slug: "12-days-of-christmas",
        label: "12 Days of Christmas",
        blurb: "A new deal each day, like the song.",
      },
      { slug: "gift-boxes", label: "Gift boxes", blurb: "Boxed gifts, priced by size." },
    ),
  },
  {
    id: "ugly-sweater-club",
    name: "Ugly Sweater Club",
    blurb: "Ugly Christmas sweaters — candy pink, red and green, Bowlby One, loud and silly.",
    pages: festival(
      { slug: "holiday-sale", label: "Holiday sale", blurb: "The Christmas offer, with a countdown." },
      {
        slug: "sweater-contest",
        label: "Sweater contest",
        blurb: "A prize for the ugliest sweater, and a deal a day until it's judged.",
      },
      { slug: "matching-sets", label: "Matching sets", blurb: "Family and couple sets, cheaper together." },
      { slug: "party-guide", label: "Party guide", blurb: "How to throw the ultimate ugly sweater party." },
    ),
  },
  {
    id: "eight-lights",
    name: "Eight Lights",
    blurb: "A Hanukkah store — pale blue and royal blue, Suez One, bright and gentle.",
    pages: festival(
      {
        slug: "hanukkah-sale",
        label: "Hanukkah sale",
        blurb: "The holiday offer, with a countdown to the first night.",
      },
      { slug: "8-nights", label: "8 Nights", blurb: "A new gift unlocks each night of Hanukkah." },
      { slug: "gift-boxes", label: "Gift boxes", blurb: "Boxed gifts, priced by size." },
    ),
  },
  {
    id: "midnight-gala",
    name: "Midnight Gala",
    blurb: "New Year's Eve partywear — black and champagne gold, Limelight deco, glamorous.",
    pages: festival(
      {
        slug: "new-year-sale",
        label: "New Year sale",
        blurb: "The year-end offer, with a countdown to midnight.",
      },
      {
        slug: "countdown-to-midnight",
        label: "Countdown to midnight",
        blurb: "Deals that unlock as the year runs out.",
      },
      { slug: "party-kits", label: "Party kits", blurb: "The party, boxed — priced by size." },
    ),
  },
  {
    id: "tet-an-khang",
    name: "Tet An Khang",
    blurb: "Vietnamese Tết gifts, in Vietnamese — lucky red and gold on cream, Lora serif, traditional.",
    pages: festival(
      { slug: "tet-sale", label: "Tet sale", blurb: "The Tết offer, with a countdown to the new year." },
      {
        slug: "lucky-countdown",
        label: "Lucky countdown",
        blurb: "From Ông Táo to Giao thừa, a lucky offer each day.",
      },
      { slug: "gift-baskets", label: "Gift baskets", blurb: "Tết baskets, priced by size." },
    ),
  },
  {
    id: "marigold-coffee-club",
    name: "Marigold Coffee Club",
    blurb: "Mexican single-origin coffee by subscription — marigold cream and magenta, Bungee, festive.",
    pages: subscription(),
  },
  {
    id: "holi-hues-nail-club",
    name: "Holi Hues Nail Club",
    blurb: "A monthly vegan gel-polish box — white with hot pink and violet, Righteous, Holi colour.",
    pages: subscription(),
  },
  {
    id: "lantern-tea-club",
    name: "Lantern Tea Club",
    blurb: "Single-estate teas each month — rice paper, night navy and lantern orange, Alice serif, calm.",
    pages: subscription(),
  },
  {
    id: "crescent-scent-club",
    name: "Crescent Scent Club",
    blurb: "A monthly attar and oud box — sand, deep teal and gold, El Messiri, Arabian luxe.",
    pages: subscription(),
  },
  {
    id: "self-love-club",
    name: "Self Love Club",
    blurb: "A monthly self-care box — blush pink and cherry red, Bagel Fat One, sweet.",
    pages: subscription(),
  },
  {
    id: "clover-plant-club",
    name: "Clover Plant Club",
    blurb: "Plant of the month — mint and clover green, Uncial Antiqua, Irish luck.",
    pages: subscription(),
  },
  {
    id: "game-day-crate",
    name: "Game Day Crate",
    blurb: "Sauces and snacks before every big game — field green and burnt orange, Graduate varsity, sporty.",
    pages: subscription(),
  },
  {
    id: "star-spangled-tee-club",
    name: "Star Spangled Tee Club",
    blurb: "American-made basics by subscription — parchment, navy and flag red, Bevan slab, heritage.",
    pages: subscription(),
  },
  {
    id: "pencil-case-learning-box",
    name: "Pencil Case Learning Box",
    blurb: "A monthly STEM project for ages 4–10 — paper white and crayon blue, Gaegu handwriting, playful.",
    pages: subscription(),
  },
  {
    id: "petal-skincare-refill",
    name: "Petal Skincare Refill",
    blurb: "Botanical skincare in refill pouches — petal white and lavender, Italiana serif, gentle.",
    pages: subscription(),
  },
  {
    id: "terra-refill",
    name: "Terra Refill",
    blurb: "Plastic-free refills in glass — oat paper and moss green, Fraunces serif, earthy.",
    pages: pages({ slug: "earth-day-sale", label: "Earth Day sale" }),
  },
  {
    id: "spectrum",
    name: "Spectrum",
    blurb: "Gender-free Pride basics — white with rainbow and hot pink, Bricolage Grotesque, loud.",
    pages: pages({ slug: "pride-sale", label: "Pride sale" }),
  },
  {
    id: "bunny-and-bloom",
    name: "Bunny and Bloom",
    blurb: "Easter toys and baskets for little ones — pastel pink and lilac, Chewy, sweet.",
    pages: pages({ slug: "spring-sale", label: "Spring sale" }),
  },
  {
    id: "jade-lantern",
    name: "Jade Lantern",
    blurb: "Lunar New Year teas and gift sets — cream, lantern red and gold, Noto Serif SC, auspicious.",
    pages: pages({ slug: "new-year-sale", label: "New Year sale" }),
  },
  {
    id: "boxed-outlet",
    name: "Boxed Outlet",
    blurb: "Open-box tech for Boxing Day — kraft brown and red, Archivo Narrow, warehouse bold.",
    pages: pages({ slug: "boxing-day-sale", label: "Boxing Day sale" }),
  },
  {
    id: "harvest-table",
    name: "Harvest Table",
    blurb: "Thanksgiving cookware and linen — cream and pumpkin, Playfair Display, warm.",
    pages: pages({ slug: "thanksgiving-sale", label: "Thanksgiving sale" }),
  },
  {
    id: "gal-pals",
    name: "Gal Pals",
    blurb: "Galentine's Day gifts for best friends — bubblegum pink, Pacifico script, playful.",
    pages: pages({ slug: "galentines-sale", label: "Galentine's sale" }),
  },
  {
    id: "her-edit",
    name: "Her Edit",
    blurb: "Women-founded fashion for March 8 — lavender and violet, Syne, editorial.",
    pages: pages({ slug: "womens-day-sale", label: "Women's Day sale" }),
  },
  {
    id: "grain-and-grit",
    name: "Grain and Grit",
    blurb: "Handmade leather goods for dad — saddle tan on canvas, Cormorant SC, rugged.",
    pages: pages({ slug: "fathers-day-sale", label: "Father's Day sale" }),
  },
  {
    id: "splash-club",
    name: "Splash Club",
    blurb: "Songkran swim and water gear — aqua on white, Fredoka, splashy.",
    pages: pages({ slug: "summer-sale", label: "Summer sale" }),
  },
  {
    id: "biergarten-home",
    name: "Biergarten Home",
    blurb: "Oktoberfest glassware and tableware — Bavarian blue and white, Alegreya SC, festive.",
    pages: pages({ slug: "oktoberfest-sale", label: "Oktoberfest sale" }),
  },
  {
    id: "carnaval",
    name: "Carnaval",
    blurb: "Rio carnival partywear — neon pink and purple, Lilita One, loud.",
    pages: pages({ slug: "carnival-sale", label: "Carnival sale" }),
  },
  {
    id: "sakura-studio",
    name: "Sakura Studio",
    blurb: "Hanami ceramics — blossom pink on white, Zen Maru Gothic, soft and calm.",
    pages: pages({ slug: "spring-sale", label: "Spring sale" }),
  },
  {
    id: "bom-beauty",
    name: "Bom Beauty",
    blurb: "Korean skincare gift sets for Chuseok — ivory and hanbok pink, Gowun Batang, gentle.",
    pages: pages({ slug: "chuseok-sale", label: "Chuseok sale" }),
  },
  {
    id: "maison-tricolore",
    name: "Maison Tricolore",
    blurb: "A Paris café's coffee and pâtisserie for July 14 — navy, white and red, Bodoni Moda, French chic.",
    pages: pages({ slug: "bastille-day-sale", label: "Bastille Day sale" }),
  },
  {
    id: "fiesta-verde",
    name: "Fiesta Verde",
    blurb: "Small-batch hot sauces for Cinco de Mayo — navy and chili red, Sancreek western, fiery.",
    pages: pages({ slug: "cinco-de-mayo-sale", label: "Cinco de Mayo sale" }),
  },
  {
    id: "noor-home",
    name: "Noor Home",
    blurb: "Brass lanterns and oud for Eid al-Adha — ivory and emerald, Amiri serif, serene.",
    pages: pages({ slug: "eid-sale", label: "Eid sale" }),
  },
  {
    id: "lights-out",
    name: "Lights Out",
    blurb: "Candles and solar lanterns for Earth Hour — black with amber glow, Space Grotesk, dark mode.",
    pages: pages({ slug: "earth-hour-sale", label: "Earth Hour sale" }),
  },
  {
    id: "masquerade",
    name: "Masquerade",
    blurb: "Mardi Gras statement jewellery — purple, green and gold, Cinzel Decorative, theatrical.",
    pages: pages({ slug: "mardi-gras-sale", label: "Mardi Gras sale" }),
  },
  {
    id: "tartan-and-thistle",
    name: "Tartan and Thistle",
    blurb: "Scottish lambswool and tweed for Burns Night — oatmeal, pine and claret, EB Garamond, heritage.",
    pages: pages({ slug: "winter-sale", label: "Winter sale" }),
  },
];
