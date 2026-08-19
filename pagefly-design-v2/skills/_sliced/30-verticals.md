---
scope: slice
slice: vertical
name: verticals
version: 2.0
---

<!--
  SLICED AT RUNTIME — exactly ONE row is sent, addressed by id.
  The ids match the Step 1 chips one-to-one. The merchant already chose;
  nothing here is guessed from keywords.

  Columns
    arch      homepage archetype — A spec-led · B efficacy-led · C lookbook-led
              · D craft/origin-led · E consultative-led · F offer/subscription-led
              · G occasion-led
    style     preferred visualStyle ids, in order, when the merchant did not pick
    signature the one section on the homepage that gets the investment
    hero      the hero pattern to prefer
    motion    the register, and the one signature effect
    ban       patterns and treatments that are wrong for this trade
    proof     what counts as evidence here — this drives the copy
-->

## Apparel & accessories

<!--#fashion-apparel-->
arch C · style editorial, minimal, luxury · hero `hero-full-bleed-scrim`
signature `lookbook-strip` · also `usecase-tiles-overlay` by occasion
motion editorial — slow clip reveals, image-swap on card hover · no counters
ban spec-grid, ingredient-list, comparison-table, urgency countdowns
proof fit and fabric — what it is made of, how it falls, who it is cut for
<!--/-->

<!--#footwear-->
arch C · style streetwear, bold, minimal · hero `hero-full-bleed-scrim`
signature `lookbook-strip` in motion · also `spec-bars` for cushioning/drop
motion one energetic moment — a marquee or a fast `grow` on the grid
ban ingredient-list, origin-band, luxury serif display
proof mileage, terrain, how it wears after N months
<!--/-->

<!--#jewelry-watches-->
arch C · style luxury, editorial, minimal · hero `hero-editorial-stack`
signature macro `gallery-masonry-3` or `full-bleed-quote-band`
motion the quietest of all — one shine-sweep, slow fades, nothing that bounces
ban playful motion, glow, neubrutalist, countdown, discount language
proof material, weight, hallmark, who made it and where
<!--/-->

<!--#bags-accessories-->
arch C · style minimal, editorial, scandi · hero `hero-split-asymmetric`
signature `deep-dive-split` on interior and capacity
motion image-swap on ≤4 cards · nothing else
ban before/after, spec-grid, urgency
proof capacity in litres, what fits, leather source, stitch count
<!--/-->

<!--#eyewear-->
arch C · style minimal, editorial, tech · hero `hero-split-asymmetric`
signature `usecase-tiles-overlay` by face shape
motion try-on carousel · no parallax
ban parallax, origin-band, ingredient-list
proof lens spec, frame width in mm, face shapes it suits
<!--/-->

<!--#kids-apparel-->
arch C+G · style playful, organic, scandi · hero `hero-split-asymmetric`
signature `usecase-tiles-overlay` by age
motion `grow` on tiles · gentle
ban luxury serif display, dark bands, urgency
proof fabric safety standard, wash count, sizing by age and height
<!--/-->

## Beauty, health & wellness

<!--#skincare-->
arch B · style minimal, luxury, organic · hero `hero-split-asymmetric`
signature `ingredient-list` · `before-after-pair` required with a stated interval
motion soft — blur and scale reveals, gentle glow on hover
ban spec-grid, streetwear, glow on price, disease claims
proof concentration, clinical interval, skin types tested, what it does NOT do
<!--/-->

<!--#cosmetics-->
arch B+C · style bold, luxury, playful · hero `hero-full-bleed-scrim`
signature shade-range `lookbook-strip` · swatch hover swap
motion swatch swap on hover, one shine-sweep
ban before/after on colour cosmetics, spec-grid
proof shade count, finish, wear hours, undertone guidance
<!--/-->

<!--#haircare-->
arch B · style organic, minimal, editorial · hero `hero-split-asymmetric`
signature `before-after-pair` with drag handle · `routine-steps`
motion drag handle, soft reveals
ban spec-grid, urgency
proof hair type, weeks to result, what was measured
<!--/-->

<!--#fragrance-->
arch C · style luxury, editorial, minimal · hero `hero-editorial-stack`
signature `story-band` on the note pyramid
motion none beyond hover — this is the most restrained page you will build
ban before/after, stat grids, spec language, countdown
proof notes, concentration, longevity in hours, the perfumer
<!--/-->

<!--#supplements-->
arch B · style minimal, tech, organic · hero `hero-split-asymmetric`
signature `ingredient-list` with dosages · `spec-bars` for study results
motion accordion on studies · counters only for clinical figures
ban before/after body imagery, unsourced claims, disease claims
proof dose per serving, study size and duration, third-party testing
<!--/-->

<!--#personal-care-devices-->
arch A+B · style tech, minimal · hero `hero-product-lead`
signature `spec-grid-4x2` · `sticky` buy bar on product pages
motion precise and mechanical — counters, spec bars, sticky rail. No bounce.
ban organic hand-drawn styling, disease claims, playful motion
proof watts, minutes of runtime, decibels, CE/certification, contraindications
<!--/-->

<!--#intimate-wellness-->
arch B · style minimal, organic, editorial · hero `hero-type-only`
signature `faq-accordion` on privacy, materials and safety
motion none
ban explicit imagery, playful, before/after, urgency
proof body-safe material, discreet packaging, what the data policy is
<!--/-->

## Food & beverage

<!--#coffee-tea-->
arch D · style organic, editorial, handmade · hero `hero-editorial-stack`
signature `origin-band` · `process-steps` for the roast
motion warm and physical — one parallax on the origin shot, `grow` on cards
ban spec-grid, sticky bar, tech styling
proof origin, altitude, roast date, tasting notes, brew ratio
<!--/-->

<!--#specialty-food-->
arch D · style organic, editorial, handmade · hero `hero-split-asymmetric`
signature `process-steps` · `origin-band`
motion subtle hover only
ban comparison-table, urgency
proof producer, region, batch size, shelf life
<!--/-->

<!--#snacks-confectionery-->
arch D+G · style playful, retro, bold · hero `hero-full-bleed-scrim`
signature `usecase-tiles-overlay` by flavour · marquee of flavours
motion carousel on flavours, `grow-shadow` on cards
ban luxury serif, clinical language
proof ingredients, allergens, what is not in it
<!--/-->

<!--#bakery-desserts-->
arch D · style handmade, organic, editorial · hero `hero-full-bleed-scrim`
signature macro `gallery-masonry-3`
motion none — the photography carries it
ban spec-grid, dark tech, urgency
proof baked-to-order window, delivery radius, allergens
<!--/-->

<!--#alcohol-->
arch D · style luxury, editorial, retro · hero `hero-editorial-stack`
signature `origin-band` plus tasting notes
motion one parallax · nothing else
ban playful, y2k, discount urgency, anything reading as pressure
proof vintage, region, ABV, cask, tasting note
<!--/-->

<!--#meal-kits-->
arch F · style playful, organic, minimal · hero `hero-split-asymmetric`
signature `process-steps` — how it works · `plan-comparison`
motion sticky price bar, `grow` on plan cards
ban luxury serif, spec-grid
proof minutes to cook, servings, what arrives in the box, cancel policy
<!--/-->

<!--#health-food-->
arch B+D · style organic, minimal · hero `hero-split-asymmetric`
signature `ingredient-list` · nutrition accordion
motion accordion, soft reveals
ban before/after body imagery, disease claims
proof macros per serving, sourcing, certification
<!--/-->

## Home & living

<!--#furniture-->
arch E+C · style scandi, minimal, editorial · hero `hero-full-bleed-scrim`
signature room `gallery-masonry-3` · dimension accordion
motion calm — one parallax on a room shot, `grow` on cards
ban spec-grid as hero proof, glow, urgency
proof dimensions in cm, material, weight capacity, assembly time, lead time
<!--/-->

<!--#home-decor-->
arch C · style editorial, scandi, handmade · hero `hero-full-bleed-scrim`
signature `lookbook-strip` of styled rooms
motion image-swap on hover
ban comparison-table, spec-grid
proof dimensions, material, how it was made, styling suggestions
<!--/-->

<!--#bedding-textiles-->
arch E+B · style scandi, minimal, organic · hero `hero-split-asymmetric`
signature material `deep-dive-split` — thread count, weave, GSM
motion accordion on care, slow reveals
ban dark tech, glow
proof GSM, weave, fibre origin, wash count before pilling
<!--/-->

<!--#kitchenware-->
arch D+E · style scandi, minimal, handmade · hero `hero-split-asymmetric`
signature `process-steps` on making, or `deep-dive-split`
motion `grow` on cards
ban y2k, urgency
proof material, oven/dishwasher rating, capacity, warranty
<!--/-->

<!--#lighting-->
arch E+C · style scandi, minimal, luxury · hero `hero-full-bleed-scrim`
signature ambience `gallery-masonry-3` in day/night pairs
motion `before-after-pair` as day/night with a drag handle
ban playful, urgency
proof lumens, colour temperature, dimmable, bulb type, cable length
<!--/-->

<!--#garden-outdoor-->
arch G+E · style organic, scandi, handmade · hero `hero-full-bleed-scrim`
signature `usecase-tiles-overlay` by season or space size
motion one parallax on a garden shot
ban glass, y2k, clinical
proof material weathering, size, season, care schedule
<!--/-->

<!--#home-improvement-->
arch E · style minimal, bold, tech · hero `hero-split-asymmetric`
signature `before-after-pair` with drag handle
motion drag handle, accordion on fitting
ban luxury serif
proof coverage per unit, drying time, tools needed, guarantee
<!--/-->

<!--#cleaning-household-->
arch F+B · style playful, minimal, organic · hero `hero-split-asymmetric`
signature `before-after-pair` · `plan-comparison` for refills
motion drag handle, sticky bar
ban luxury, editorial serif
proof what it removes, surfaces safe, refills per year, ingredients
<!--/-->

## Electronics & tech

<!--#consumer-electronics-->
arch A · style tech, dark, minimal · hero `hero-type-only` or `hero-full-bleed-scrim`
signature `spec-grid-4x2` · `spec-bars`
motion precise and mechanical — counters, spec bars, sticky buy bar. Never decorative.
ban organic, handmade, serif display, playful
proof measured numbers with units, test conditions, warranty, what is in the box
<!--/-->

<!--#audio-->
arch A · style dark, tech, editorial · hero `hero-type-only`
signature `spec-bars` for ANC/battery/latency · `spec-grid-4x2`
motion bars fill on reveal, sticky buy bar, one accent word in the display
ban playful, y2k, pastel
proof dB, hours, driver size, codec, frequency response
<!--/-->

<!--#phone-accessories-->
arch A · style minimal, tech, bold · hero `hero-product-lead`
signature compatibility `comparison-table`
motion sticky bar, `grow`
ban luxury serif, origin-band
proof exact device compatibility, drop rating, material, warranty
<!--/-->

<!--#computer-gaming-->
arch A · style dark, tech, y2k · hero `hero-type-only`
signature `spec-grid-4x2` · `comparison-table`
motion glow permitted here and almost nowhere else · counters
ban scandi, organic, luxury
proof Hz, ms, polling rate, switch type, benchmark with conditions
<!--/-->

<!--#smart-home-->
arch A · style tech, minimal, glass · hero `hero-split-asymmetric`
signature ecosystem `deep-dive-split` · compatibility accordion
motion accordion, sticky, one device animation
ban handmade, retro
proof protocols supported, hub required or not, power draw, app platforms
<!--/-->

<!--#drones-cameras-->
arch A · style dark, tech, bold · hero `hero-full-bleed-scrim` with real footage
signature sample-output band · `spec-grid-4x2`
motion video hero, spec bars
ban studio-white product photography outside the buy box
proof sensor, range in km, flight minutes, stabilisation, sample footage
<!--/-->

## Sport, outdoor & mobility

<!--#fitness-equipment-->
arch A · style bold, dark, tech · hero `hero-split-asymmetric`
signature `spec-grid-4x2` · `stat-strip-3up`
motion fast and confident — counters, progress bars, sticky bar
ban luxury serif, before/after body imagery
proof load rating in kg, footprint in cm, material, warranty years
<!--/-->

<!--#activewear-->
arch C+A · style bold, streetwear, minimal · hero `hero-full-bleed-scrim`
signature `lookbook-strip` in motion · `spec-bars` for fabric properties
motion image-swap, one marquee
ban ingredient-list, origin-band
proof fabric weight, stretch, moisture handling, fit by activity
<!--/-->

<!--#outdoor-camping-->
arch G+A · style organic, bold, retro · hero `hero-full-bleed-scrim`
signature `usecase-tiles-overlay` by terrain or season
motion carousel, video hero
ban luxury, glass, y2k
proof pack weight, temperature rating, waterproof rating, capacity
<!--/-->

<!--#cycling-ebike-->
arch A · style bold, dark, tech · hero `hero-full-bleed-scrim`
signature `spec-grid-4x2` · `usecase-tiles-overlay` by terrain · sticky bar required
motion counters, spec bars, sticky
ban ingredient-list, before/after, studio-white hero
proof range in km, motor watts, weight, charge hours, frame sizes
<!--/-->

<!--#ev-mobility-->
arch A · style tech, dark, minimal · hero `hero-type-only`
signature `spec-grid-4x2` on range and charge
motion counters, sticky bar
ban handmade, retro
proof range, top speed, charge time, load rating, road legality
<!--/-->

<!--#water-sports-->
arch G+A · style bold, organic, retro · hero `hero-full-bleed-scrim`
signature `usecase-tiles-overlay` by condition
motion video hero, one parallax
ban luxury serif, clinical
proof volume in litres, rider weight range, fin setup, conditions it suits
<!--/-->

<!--#hunting-fishing-->
arch A+G · style retro, bold, organic · hero `hero-split-asymmetric`
signature `spec-grid-4x2`
motion none beyond hover
ban y2k, glass, playful
proof draw weight, line rating, range, material, season
<!--/-->

<!--#team-sports-->
arch G+A · style bold, streetwear · hero `hero-full-bleed-scrim`
signature `usecase-tiles-overlay` by position or level
motion carousel, `grow`
ban luxury, scandi
proof weight, grip, level it suits, certification for match play
<!--/-->

## Kids, pets & hobby

<!--#baby-gear-->
arch G+E · style scandi, organic, minimal · hero `hero-split-asymmetric`
signature safety and standards band · `comparison-table` by stage
motion accordion on standards, gentle reveals
ban dark bands, glow, urgency mechanics
proof safety standard number, age and weight range, materials, wash guidance
<!--/-->

<!--#toys-games-->
arch G · style playful, retro, bold · hero `hero-full-bleed-scrim`
signature age `usecase-tiles-overlay`
motion `grow`, carousel, one playful bounce — this is the trade where cute is on-brand
ban luxury serif, dark tech
proof age range, piece count, play time, safety standard
<!--/-->

<!--#pet-supplies-->
arch G+F · style playful, organic, minimal · hero `hero-split-asymmetric`
signature size/breed `usecase-tiles-overlay` · UGC `gallery-masonry-3`
motion `grow`, a heart pop, UGC carousel
ban luxury, clinical, dark
proof size chart by breed and weight, material, ingredients, vet input
<!--/-->

<!--#art-craft-->
arch D · style handmade, organic, retro · hero `hero-editorial-stack`
signature `process-steps` — what you can make with it
motion `grow` on project cards
ban tech, glass, spec-grid
proof pigment, GSM, lightfastness, what it works on
<!--/-->

<!--#music-instruments-->
arch D+A · style editorial, dark, retro · hero `hero-full-bleed-scrim`
signature sound-sample band · `spec-grid-4x2`
motion audio player, magnifier on detail shots
ban playful, y2k
proof tonewood, scale length, pickup, string gauge, sample audio
<!--/-->

<!--#books-stationery-->
arch D+C · style editorial, minimal, handmade · hero `hero-editorial-stack`
signature `gallery-masonry-3` of interior spreads
motion image-swap, slow reveals
ban spec-grid, urgency
proof page count, paper GSM, binding, dimensions
<!--/-->

<!--#collectibles-->
arch C+D · style dark, retro, editorial · hero `hero-full-bleed-scrim`
signature `gallery-masonry-3` with condition labels · magnifier required
motion magnifier, slow reveals
ban playful, glass
proof edition size, condition grade, year, provenance, authentication
<!--/-->

## Auto, tools & industrial

<!--#auto-parts-->
arch A+E · style bold, dark, tech · hero `hero-split-asymmetric`
signature fitment `comparison-table` by make/model/year
motion sticky bar, accordion on fitment
ban luxury serif, playful
proof exact fitment, OEM part number, material, torque spec
<!--/-->

<!--#moto-powersports-->
arch A · style bold, dark, retro · hero `hero-full-bleed-scrim`
signature `usecase-tiles-overlay` by riding type
motion video hero, sticky bar
ban scandi, glass
proof fitment, certification, weight, material
<!--/-->

<!--#tools-hardware-->
arch A · style bold, tech, minimal · hero `hero-product-lead`
signature `spec-grid-4x2` — torque, capacity, duty cycle
motion sticky bar, counters
ban luxury, playful
proof torque in Nm, duty cycle, battery platform, warranty
<!--/-->

<!--#industrial-b2b-->
arch E · style minimal, tech · hero `hero-split-asymmetric`
signature spec/catalogue table · `lead-form-split`
motion accordion on specs · nothing else
ban video hero, glow, y2k, consumer urgency
proof tolerance, standard number, lead time, MOQ, certification
<!--/-->

<!--#medical-dental-->
arch E+B · style minimal, tech · hero `hero-split-asymmetric`
signature `certification-logo-row` · `spec-grid-4x2`
motion accordion on regulatory · none decorative
ban playful, urgency, before/after without a consent notice, disease claims
proof regulatory class, standard number, sterilisation, training required
<!--/-->

<!--#office-professional-->
arch E · style minimal, scandi, tech · hero `hero-split-asymmetric`
signature `comparison-table` across models or tiers
motion accordion
ban y2k, streetwear
proof throughput, dimensions, warranty, service terms
<!--/-->

## Digital, services & causes

<!--#saas-app-->
arch F+A · style tech, minimal, glass · hero `hero-split-asymmetric`
signature device-framed `deep-dive-split` · `plan-comparison`
motion `grow` on plan cards, sticky pricing, one interface animation
ban organic, handmade, origin-band
proof what it integrates with, uptime, data location, free tier limits
<!--/-->

<!--#online-course-->
arch F · style editorial, minimal, bold · hero `hero-split-asymmetric`
signature curriculum `process-steps` · instructor `story-band`
motion accordion on syllabus, progress bar
ban luxury serif, urgency countdowns
proof hours of material, modules, who teaches it and their record, outcome
<!--/-->

<!--#digital-download-->
arch F · style minimal, bold, y2k · hero `hero-type-only`
signature preview `gallery-masonry-3`
motion `grow`, magnifier
ban origin-band, ingredient-list
proof file formats, what software it needs, licence terms, update policy
<!--/-->

<!--#agency-service-->
arch E · style editorial, minimal, neubrutalist · hero `hero-editorial-stack`
signature case-study `deep-dive-split` with a real number
motion `grow` on case cards
ban spec-grid, stock office imagery
proof a named client outcome with a figure, the process, who does the work
<!--/-->

<!--#local-service-->
arch E · style organic, minimal, handmade · hero `hero-split-asymmetric`
signature booking `lead-form-split` with a map
motion none
ban video hero, glow
proof service area, hours, response time, licence or insurance
<!--/-->

<!--#events-tickets-->
arch G · style bold, streetwear, y2k · hero `hero-full-bleed-scrim`
signature line-up or agenda grid · countdown
motion carousel, countdown, video hero
ban luxury serif, minimal restraint
proof date, venue, capacity, who is on, what the ticket includes
<!--/-->

<!--#travel-hospitality-->
arch C+G · style luxury, editorial, organic · hero `hero-full-bleed-scrim`
signature `gallery-masonry-3` of the property
motion one parallax, carousel
ban spec-grid, urgency, glow
proof distances, room sizes, what is included, season, cancellation terms
<!--/-->

<!--#membership-community-->
arch F · style editorial, playful, minimal · hero `hero-split-asymmetric`
signature `plan-comparison` · member `story-band`
motion accordion, sticky pricing
ban luxury serif, spec-grid
proof what members get, how often, community size, cancel policy
<!--/-->

<!--#nonprofit-cause-->
arch E+G · style editorial, organic, minimal · hero `hero-full-bleed-scrim`
signature `stat-strip-3up` with sourced figures · `story-band`
motion none
ban glossy stock, urgency mechanics, glow
proof where the money goes with a percentage and a source, who is helped
<!--/-->

<!--#real-estate-->
arch E+C · style luxury, minimal, editorial · hero `hero-full-bleed-scrim`
signature property `gallery-masonry-3` · floorplan
motion magnifier, one parallax
ban playful, y2k, urgency
proof floor area, rooms, year, energy rating, distances
<!--/-->

<!--#finance-insurance-->
arch E · style minimal, tech · hero `hero-split-asymmetric`
signature `comparison-table` · `process-steps`
motion accordion on disclosures · nothing else
ban video hero, glow, playful, urgency
proof rate, term, what is excluded, regulator and registration number
<!--/-->

## Fallback

<!--#general-->
arch E · style minimal, editorial · hero `hero-split-asymmetric`
signature `usecase-tiles-overlay`
motion restrained — two effects, both quiet
ban none specific; the ban list in composition still applies
proof whatever the merchant's own words name — a number, a material, a duration
<!--/-->
