# Reel and reveal research

Output of the four-angle research workflow the first session launched and never
finished. This run completed all four research agents (61 findings) and then died
on a session limit before synthesis and critique, so **what follows is raw research,
not a plan** — nothing here has been through an adversarial pass.

Read `HANDOFF.md` first. The most decision-relevant single number in this document
is in Angle 1, "Uniform padding is the lie": on RIPDEX's own `base-set-rip.json`,
uniform reel padding puts the grail in **98.5%** of spins against true odds of
**0.0269%**. What we actually shipped is not uniform padding — see HANDOFF.md
§"The reel and the near-miss padding" for the numbers on the real implementation.

To resume the unfinished synthesis and critique phases, see the resume command at
the bottom of this file.


---

## Angle 1 — The case-opening reel

### Summary

The case-opening reel is two things welded together, and they separate cleanly. The CRAFT is a deceleration curve so lopsided it is almost a joke — the canonical implementation covers ~67% of its travel in the first second and then spends seven seconds crawling the last third, so the final cell takes 2.4 seconds to cross a marker it has already effectively reached. That curve, plus a hard reference marker, plus a tick whose rate is the literal derivative of the velocity, is what makes a stop feel decisive instead of arbitrary. None of it requires lying. The MANIPULATION is entirely in what the strip is made of: in every clone I read, the ~100 padding cells are drawn UNIFORMLY at random from the case pool while the real draw is weighted, and the winner is then painted into a fixed slot (73, 78, 80) that was chosen before the first frame. Quantified against RIPDEX's own base-set-rip.json: the Charizard's true weight is 0.0269%, but uniform padding would put an average of 4.13 copies in the strip and it would appear in 98.5% of all spins. That is a 3,700x overrepresentation of the grail, presented as scenery. That single line — how the non-winning cells are sampled — is the whole difference between a dramatization and a lie, and it is one function call wide. An honest RIPDEX reel is therefore completely buildable: weight-sample every cell from the same pool weights openPack() draws from, place the already-recorded ledger outcome at the landing index, compute the travel distance from that index by measurement rather than magic numbers, and never decorate adjacency. The cost is that the reel is then genuinely boring 86% of the time — because that is what the pack is — and the correct response is to make the commons look like commons rather than to salt the strip. Two structural notes from the code: the reel cannot occupy the slot the current s-roll deal-animation occupies (that step runs during the fetch and is honest precisely because it is indeterminate — a reel needs the outcome first), and rip-page.ts already telegraphs tier before the card turns (present() adds .grail and the takeover FX before await wait(ch.suspenseMs)), so a tier-scaled reel duration is consistent with a decision the product has already made rather than a new ethical question.


### Findings (14)


#### The 8s / cubic-bezier(.08,.6,0,1) curve — two thirds of the travel in the first second

**What it is.** The genre standard, verbatim across 51+ GitHub repos in an exact-string code search: `transition: all 8s cubic-bezier(.08,.6,0,1)` on the strip, with the strip translated a fixed distance in one assignment. Numerically integrated: 50% of travel done at 0.53s, 90% at 2.91s, 99% at 6.00s. Instantaneous cell rate falls ~78/sec at 0.2s → 22/sec at 0.8s → 6.8/sec at 2s → 0.8/sec at 6s. Of ~60-68 cells that cross the marker, ~40-46 cross in the first second; the last single cell takes 2.4s to cross and the last five cells eat 4.6s of the 8s. For comparison RIPDEX's own --ease cubic-bezier(.16,1,.3,1) is much gentler (50% at 0.81s, last cell 3.4s) and OrderDeck's 1-(1-t)^3 gentler still (50% at 1.65s).

**Why it works.** The curve encodes a physical claim: something heavy was thrown and is now grinding to rest against friction. The violent opening second is not for reading — nothing is legible at 45 cells/sec — it is there to establish momentum so the crawl reads as the momentum dying rather than as a slow animation. The payoff is that the last two seconds are spent on ONE cell, which converts the entire tail of the animation into scrutiny of the actual result. That is the opposite of a progress bar: a progress bar spends its time on the middle, this spends its time on the answer.

**For RIPDEX.** Directly usable and cost-free. rip-page.ts already declares --ease and --spring at the top of RIP_CSS, and the deck/plate roller already proves the page can carry a bespoke curve. A reel would want its own token (the design system's --ease is too soft for this) — something in the .08–.12 / .55–.65 / 0 / 1 family. Keep the exact-string discipline the file already uses; a stray backtick in a CSS comment near it breaks the template literal (HANDOFF §5).

**Honest or manipulative.** Pure craft. The curve makes no claim about the outcome, only about the motion. Nothing in it depends on the result being predetermined — you can drive an identical curve toward a target you computed from a result you already know honestly.


#### The winner is not landed on — it is painted into a fixed slot before the first frame

**What it is.** PySkins builds 100 cells then does `document.getElementById('raffle1-CardNumber73').style.backgroundImage = url(winner)` and translates marginLeft to -10480px. qb-lootcrate builds 101 cells and overwrites `#CardNumber78`, translating to -6770px. JMarsDC builds 101, writes the reward at index 80 and then overwrites and centres on 78 (an actual bug in the wild — the reel and the reward disagree by two cells). The travel distance is a hardcoded constant with a mobile branch (`width = 10480; if (window.innerWidth <= 500) width = 5680`), so the item only lands truly centred at one viewport width; everywhere else it lands approximately.

**Why it works.** Deterministic geometry guarantees the reveal ends framed, at a known pixel, at a known time, so every downstream beat (the highlight class, the drop sound at 8500-9000ms, the modal) can be a plain setTimeout. It is the cheapest possible way to make an unpredictable outcome produce a perfectly predictable presentation.

**For RIPDEX.** RIPDEX must invert this. The honest version computes the distance FROM the outcome instead of writing the outcome INTO the geometry: find the index at which the real variantId sits in the strip, measure cell pitch and viewport centre at runtime (JMarsDC's second setTimeout does exactly this — `targetCenter = idx*itemWidth + itemWidth/2; shift = targetCenter - holderCenter`) and translate by that. Measurement is not optional here: rip-page.ts sizes everything off `--card-w:min(66vw,332px)` with two height breakpoints, so a hardcoded pixel distance would be wrong on most screens.

**Honest or manipulative.** The slot-placement itself is neutral engineering — RIPDEX's outcome is equally settled before the animation (POST /api/rip records to the ledger before a pixel moves). What is manipulative is what the placement ENABLES: once the winner is a paint job rather than a position, the other 99 cells are free to be anything, and they are.


#### Uniform padding is the lie — quantified against RIPDEX's own pack file

**What it is.** PySkins: `for (i=0; i<100; i++) { randed = getRandomBetween(0, caseInfo.skins.length-1); ... }` — every non-winning cell is a uniform pick over the case's item list. qb-lootcrate is identical (`randomInt(1, items[case].length)`). The draw that actually decided the outcome is weighted; the reel is not. So the strip's visible rarity distribution is flat while the real one is a power law.

**Why it works.** It manufactures near-misses at industrial scale without a single line of code that says 'near-miss'. Every spin shows the grail several times, adjacent to the marker sometimes, and the player's memory encodes 'I keep almost getting it'. The literature is unambiguous that this is load-bearing: near-misses elicit the largest heart-rate accelerations of any outcome type and drive persistence via frustrated arousal, and problem gamblers bet more after them.

**For RIPDEX.** Computed on /Users/holdengoodwin/code/ripdex/apps/web/packs/generated/base-set-rip.json — pool of 24 variants, total weight 115,195, rarest is base1|4|holofoil|unlimited at 0.0269%. Uniform padding over 99 cells: 4.13 expected copies of the Charizard, present in 98.52% of spins. Weight-sampled padding: 0.027 expected copies, present in 2.63% of spins. Same for 151-rip (pool 28, rarest 0.0206%): 97.27% vs 2.02%. The fix is literally swapping `getRandomBetween(0, pool.length-1)` for the pack's existing weighted draw. JMarsDC's clone already does this by accident — it pads with `currentCase.rollItem()`, the real weighted roller — so the honest construction exists in the wild.

**Honest or manipulative.** Manipulative, and the single most manipulative thing in the genre. For RIPDEX it is also self-defeating: /packs publishes the exact odds table, so a reel that shows the Charizard four times per spin is contradicted by the site's own page. Not a subtle violation — a checkable one.


#### The tail: cells that keep coming after the winner

**What it is.** The winner sits at index 73 of 100 (PySkins) or 78 of 101 (qb-lootcrate) — never at the end. 22-27 cells remain to the right of the marker when the reel stops, so during the final 2-4 second crawl the player can see what is arriving next and what has just gone by. OrderDeck takes the opposite approach: `totalCells = EXTRA_CYCLES*pool.length + winnerIdx + 1` makes the winner the LAST cell, with nothing after it.

**Why it works.** The tail is what makes the stop read as an interruption of ongoing motion rather than as the end of a list. A reel that stops because it ran out of items feels like a slideshow ending; one that stops mid-stream feels like a wheel settling. It also gives peripheral vision something to do during the crawl, which is where the tension actually lives.

**For RIPDEX.** Keep the tail — it is the difference between a reel and a carousel — but note the interaction with a 24-item pool: with a weighted strip the tail is honest scenery. Given RIPDEX's --card-w of up to 332px, a viewport showing 3-5 cells means the tail only needs ~8-12 cells, not 27.

**Honest or manipulative.** Craft on its own; the vector for manipulation when combined with uniform padding, because the visible tail is exactly where an oversampled grail does its damage. Honest tail = same weighted sampler as everything else. Never hand-place the tail.


#### Landing jitter: never stop pixel-centred

**What it is.** OrderDeck: `const jitter = (Math.random() - 0.5) * CELL_WIDTH * 0.4; targetX = -(cellCenter - viewportCenter + jitter)` — the stop lands within ±20% of a cell width of true centre, then on completion it snaps `transform` to exactly targetX and names the true winner regardless of where the marker visually sits.

**Why it works.** A pixel-perfect stop reads as a lookup table resolving. An off-centre stop reads as an object coming to rest where physics left it. It is the same trick as not snapping a dice roll to a face.

**For RIPDEX.** Cheap and worth having, with one guardrail RIPDEX specifically needs: cap the jitter well below half a cell pitch so the marker can never sit on a boundary with two cards equally under it. At ±20% you are safe; at ±45% you have accidentally built a near-miss generator out of a polish detail.

**Honest or manipulative.** Craft, with a manipulation adjacent to it. Jitter that keeps the winner unambiguously under the marker is honest imprecision. Jitter tuned so a second card is half-visible under the marker is a manufactured near-miss wearing a physics costume.


#### The tick is the velocity — audio as the derivative of the motion

**What it is.** OrderDeck ticks once per centred-cell change inside the rAF loop: it recomputes `centerCellIdx = floor((-x + viewportCenter)/CELL_WIDTH)` every frame and fires `synth.tick(600)` only when that index changes, so tick rate == cells/sec == instantaneous speed, with no separate audio timeline to keep in sync. On landing it fires `ding(1320)` and then `fanfare()` 200ms later. PySkins layers a looping opening sound at volume 0.1 from t=0 and a `case_drop_01.mp3` at 9000ms — 1s AFTER the 8s transition ends.

**Why it works.** Deriving the tick from position rather than from a timer means the ear hears the deceleration curve directly; the thinning-out of ticks IS the animation, and it works even in peripheral vision or with eyes closed. The two-stage stop (impact ding, then a beat, then the flourish) separates 'it stopped' from 'here is what it means', which is the same separation RIPDEX already makes with metadataDelayMs.

**For RIPDEX.** Maps onto choreographyFor()'s existing structure almost one-to-one: the ding is the landing, the 200ms gap is metadataDelayMs in miniature. RIPDEX has zero audio today and zero dependencies — a WebAudio oscillator tick is ~15 lines and no package. Must be opt-in/muted by default (autoplay policy will block it before first interaction anyway, and the RIP PACK click is the gesture that unlocks it).

**Honest or manipulative.** Craft. The tick reports motion that is really happening. It becomes manipulation only if the sting is triggered by card rarity as cells pass the marker rather than by the cell change itself — i.e. a rising sound when a grail goes by.


#### The marker as a hard physical claim

**What it is.** PySkins: `.raffle-roller:before` is a 5px solid vertical bar at left:50%, z-index 10, full height, in a contrast colour; the holder is `overflow:hidden` with 2px accent borders top and bottom. OrderDeck uses paired top/bottom markers framing a 700px viewport that shows exactly 5 × 140px cells. On landing, a `.winning-item` / `.center-cell` class adds a coloured border and glow to the specific cell.

**Why it works.** A hard, thin, unambiguous reference edge is what converts translation into adjudication. Without it a moving strip is decorative; with it, every frame is a claim about which item is currently selected. The integer cell count in the viewport matters too — 5 cells at 140px means cells align to the frame instead of being clipped arbitrarily, so the strip reads as discrete objects rather than a texture.

**For RIPDEX.** Fits the design system without a new colour: the marker is a --accent violet hairline (shadow-as-border per HANDOFF §4: `box-shadow: 0 0 0 1px`, never a literal border), and the landed-cell treatment reuses the existing tier value colouring — .t-GRAIL gold, .t-TIER_4 #e0b0ff, .t-TIER_3 --em. Size the viewport to an integer multiple of the cell pitch derived from --card-w. Note that .marquee in design.ts already uses a mask-image gradient for edge fade; the same mask works here and does NOT collapse 3D because the reel should be a flat layer anyway.

**Honest or manipulative.** Craft, entirely. The marker is the reel's honesty mechanism — it makes the selection unambiguous, which is precisely what the CS:GO complaints below are about.


#### The reel is demonstrably not the decision, and players already know — which is a liability, not a secret

**What it is.** In CS:GO the unboxed item is in your Steam inventory before the reel finishes; opening the inventory mid-spin or having someone else refresh it shows the item early. Community threads document players who saw the animation land between a knife and a P2000, or saw a Huntsman symbol pass under the marker, and received something else — and concluded the system was rigged.

**Why it works.** It doesn't, past a point. The predetermination is fine and universal; what corrodes trust is that the animation is allowed to imply a proximity the outcome never had, so any visual ambiguity gets read as evidence of manipulation. The genre pays a permanent reputational tax for a few seconds of manufactured tension.

**For RIPDEX.** This is RIPDEX's opening. The current flow already has the right shape — rip() POSTs to /api/rip, the ledger records, the image preloads, and only then does any choreography run; the file's own header comment calls this 'the only ordering that makes the reveal honest'. A reel built on that ordering can say the quiet part out loud: the seedline already reads SEED COMMITTED · OUTCOME SETTLED SERVER-SIDE during the roll step. Put the openingId or the serverSeedHash prefix on screen DURING the spin, so the reel is visibly a replay of a settled, checkable fact.

**Honest or manipulative.** The predetermination is honest and unavoidable. Hiding it is the manipulation. RIPDEX should treat the reel's non-decisiveness as a feature to display rather than a fact to obscure.


#### Multi-reel: parallel strips staggered by 500ms

**What it is.** PySkins supports 1-3 simultaneous reels stacked vertically with 20px gaps, each launched with `setTimeout(..., 500 * row)`. Each reel is independent, has its own winner slot, and the rolling flag only clears when the last row finishes. This is the case-battle / multi-open format.

**Why it works.** The stagger gives you three stops instead of one, spaced far enough apart to be read individually but close enough to compound. It also solves the multi-card reveal problem without N × 8 seconds of serial waiting.

**For RIPDEX.** Not applicable today and worth saying so plainly: both generated packs are cardsPerPack: 1, and openPack draws a single card, so there is nothing to parallelise. This matters if a multi-card pack or a 'rip 3' ever ships — the stagger constant transfers directly, and the honest version staggers by row without reordering the rows by value (sorting so the best lands last would be a manufactured build).

**Honest or manipulative.** Craft. Becomes manipulation the moment the rows are ordered by outcome value rather than by draw order.


#### Skip and speed are requirements, not compromises

**What it is.** Rocket League shipped a SKIP DROP OPENING ANIMATION setting. CS2 case simulators offer a Classic mode with the full reel plus auto-open at adjustable 0.5x–10x. Hypixel players have been asking for a mystery-box skip for years for the same reason: the animation is priced per-opening and the price gets intolerable at volume.

**Why it works.** The reel's value is front-loaded onto the first few openings. By the tenth, the 8 seconds is a tax on the thing the player actually wants, and forcing it converts delight into resentment — which reads to the user as the site padding time on purpose.

**For RIPDEX.** choreographyFor() in tiers.ts is already the right home: it returns per-tier timings 'so pacing can be tuned without touching animation code'. Add a reel duration to RevealChoreography and a user-side speed multiplier applied on top. Note the existing page already has a skip-shaped affordance — the tear is drag-gated and the flip is click-gated, so a repeat user is already partly in control of pacing; a reel that cannot be clicked through would be the first blocking beat in the sequence.

**Honest or manipulative.** Craft. Withholding a skip specifically to extend exposure would be manipulation of exactly the kind the product's premise rules out.


#### What an honest reel is made of — three constructions, with their real costs

**What it is.** (a) WEIGHTED SAMPLE: every cell drawn with the pack's actual weights, real outcome placed at the landing index. (b) POOL ENUMERATION (OrderDeck's model): EXTRA_CYCLES=5 full repeats of the pool in order, then a partial cycle ending on the winner — every pool member appears exactly once per cycle. (c) HYBRID: enumerate the contents but encode probability visually (cell width, dimming, or a printed odds label per cell).

**Why it works.** (a) is the only one whose visible frequencies match the published odds table — the reel becomes a live sample of the pack. (b) makes no likelihood claim at all: it is an inventory scrolling past, which is honest in a different register and guarantees the player sees the Charizard is genuinely in there. (c) tries to have both and is the most information-dense.

**For RIPDEX.** Computed on the real pools: with (a) over 99 cells, 86.3% of base-set-rip cells are the top-10 commons and you see ~16 of 24 distinct variants; with (b) you see all 24 every cycle. (a) is the recommendation, because /packs already publishes the exact table and a weighted reel is the only construction that cannot contradict it. Its cost is real and should be designed for, not engineered away: the reel is mostly commons, because the pack is mostly commons. Answer that by making commons LOOK like commons — small, dim, desaturated, using the existing tile treatment where each card paints its own --art glow — so that the rate at which something bright goes past is itself the true rate. If (b) is chosen instead, label the strip PACK CONTENTS, never spin it as though it were sampling, and shuffle each cycle from the public clientSeed/nonce so a fixed order can't be learned and used to read the outcome off the initial velocity.

**Honest or manipulative.** All three are honest constructions. (a) is honest about likelihood; (b) is honest about contents and silent about likelihood; (c) is honest about both but busier. The dishonest option is the one nobody needs to build: enumerate the pool so rares are guaranteed visible, then present it as if it were sampling.


#### Adjacency is unavoidable; dramatising adjacency is the violation

**What it is.** In any reel over a 24-item pool, a rare card will sometimes sit one or two cells from the landing position — not by design, but because the strip has to be made of something. The genre's move is to notice this and decorate it: highlight the rare cell as it passes, slow the crawl further when a high-value card is near the marker, add a rising sting, or write 'SO CLOSE' copy afterwards.

**Why it works.** For them, it converts a layout artifact into a near-miss event with all the arousal that implies. Nothing about the underlying reel changed; only the interpretation the UI supplied.

**For RIPDEX.** This is the sharpest line RIPDEX has to hold, and it is a UI rule rather than a data rule. With weighted sampling the neighbour of the landing cell is a grail at roughly the true grail rate (~0.05% for an immediate neighbour, ~2.6% anywhere in the strip), so honest adjacency is rare enough to be a curiosity. The rule: no cell gets any treatment based on its value while it is in motion, no easing change based on what is near the marker, no post-hoc copy about what almost landed. The landed cell gets the tier treatment; everything else is scenery painted by the sampler.

**Honest or manipulative.** The adjacency is honest. Every one of the decorations listed above is a manufactured near-miss, and each is the kind that would be trivially caught — the strip's contents are client-side and inspectable, and a highlight rule is a grep away.


#### Where the reel can actually go in RIPDEX's existing sequence

**What it is.** Read rip-page.ts's rip(): show s-roll → wait 750ms → fetch /api/rip → preload imageLarge → wait 420ms → startTear() → drag-to-tear → finishTear() (550ms strip throw, 430ms wait) → present(), which applies choreographyFor(): grail = 2200ms suspense + 1400ms flip + 1100ms metadata delay. A grail today is roughly 6-7s of choreography after the tear, on top of network time. The current s-roll deck/plate animation runs DURING the fetch and is deliberately indeterminate — the code comments that the progress bar is linear because 'an indeterminate bar that accelerates and decelerates reads as progress toward something. This one is a heartbeat, not a measure.'

**Why it works.** That comment is the constraint. A reel must know its target before frame one, so it cannot occupy the loading slot the deck animation occupies without either faking the early motion or stalling on the network mid-spin.

**For RIPDEX.** Three viable placements, in order of preference: (1) the reel REPLACES the tear+flip as an alternate presentation mode — it is the same job (deferred reveal) done differently, and stacking an 8s reel on top of a grail's existing ~7s gives a 15s sequence nobody will sit through twice; (2) the reel replaces the deck/plate roller and starts only after the fetch resolves, with the deck animation demoted to a short pre-roll covering network latency; (3) reel for repeat rips, tear for the first. Whichever is chosen, keep the image preload — a reel of 24-28 cells over a 24-28 variant pool needs only 24-28 unique images, all of which /packs already serves, so the strip is cheap.

**Honest or manipulative.** Honest either way. The only trap is placement (1) done carelessly: if the reel starts before /api/rip resolves, the early motion is by definition not aimed at anything, and that is a scripted tease no matter how good it looks.


#### The page already telegraphs tier before the reveal — so tier-scaled reel timing is settled precedent, not a new question

**What it is.** In present(), the grail path runs before the flip: chrome.classList.add('hide'), grailFx.classList.add('on'), sparks(), card.classList.add('grail') — all of it BEFORE `await wait(ch.suspenseMs)` and before the card turns. The pedestal, the gold bloom and the halo are up while the card is still face-down. Non-grail tier-3/4 similarly dim the background first. choreographyFor() scales suspense 220ms → 2200ms by tier.

**Why it works.** It escalates using something true — the outcome is already known, so intensifying ahead of the flip dramatises a real fact rather than inventing one. The surprise moves from 'is it good' to 'which good one is it', which is a legitimate and often better beat.

**For RIPDEX.** A reel duration scaled the same way (roughly 2.5s for tier 1 up to 7-8s for a grail) is consistent with a decision this codebase already made, and it fits choreographyFor()'s stated purpose. Be deliberate about it though: a longer spin is a spoiler, and combined with the takeover already firing pre-flip, a grail is announced twice before the card is seen. If that feels like too much, the cleaner option is a constant reel duration with tier scaling applied only after the landing — which is also the version that keeps the deceleration curve identical on every rip and therefore leaks nothing.

**Honest or manipulative.** Honest in both directions. Scaling is truthful escalation; constant duration is truthful concealment. The one thing to avoid is scaling the duration and then also pretending the outcome is unknown — dressing a 7-second grail spin in 'could be anything' copy.


### Sources

- /Users/holdengoodwin/code/ripdex/apps/web/src/rip-page.ts (rip(), present(), finishTear(), RIP_CSS tokens, the .deck/.plate roller and its 'heartbeat, not a measure' comment)
- /Users/holdengoodwin/code/ripdex/packages/pokemon-core/src/tiers.ts (choreographyFor, RevealChoreography, DEFAULT_TIER_CONFIG bands)
- /Users/holdengoodwin/code/ripdex/apps/web/src/design.ts (MOTION_JS runtime, RIPDEX_MOTION.scan, .marquee/.track + mask-image, prefers-reduced-motion handling)
- /Users/holdengoodwin/code/ripdex/apps/web/src/rip-engine.ts (RipEngine.rip — ledger record before reveal, oddsTable, choreography in the response)
- /Users/holdengoodwin/code/ripdex/packages/pokemon-core/src/odds.ts (PackPoolEntry weights, oddsTable, validatePackConfig)
- /Users/holdengoodwin/code/ripdex/apps/web/packs/generated/base-set-rip.json (pool 24, totalWeight 115195, base1|4|holofoil|unlimited at 0.0269%)
- /Users/holdengoodwin/code/ripdex/apps/web/packs/generated/151-rip.json (pool 28, totalWeight 320733, rarest 0.0206%)
- https://github.com/py-skins/PySkins — frontend/src/components/OpenCases/CaseOpening/RaffleRoller.jsx and RaffleRoller.module.scss (100 cells, uniform padding, winner written to index 73, 8s cubic-bezier(.08,.6,0,1), -10480px / -5680px, drop sound at 9000ms, 1-3 reels staggered 500ms)
- https://github.com/Ulysses07/OrderDeck — OrderDeck.Overlay/wwwroot/animations/roulette-strip/index.js (rAF, 1-(1-t)^3, 4500ms/2800ms, CELL_WIDTH 140 / VIEWPORT 700, EXTRA_CYCLES 5 pool repeats with winner last, ±20% cell jitter, per-cell tick, ding + fanfare at +200ms)
- https://github.com/JoeSzymkowiczFiveM/qb-lootcrate — html/index.js (101 cells, uniform padding, #CardNumber78, -6770px, winning-item class at 8500ms)
- https://github.com/JMarsDC/CSGO-CASE-OPENING-SIMULATOR — Shop/OpenCaseLogic.js (pads with the real weighted rollItem(); computes the landing shift from measured itemWidth and holder centre; reward written at index 80 but centred on 78)
- GitHub code search: exact string "cubic-bezier(.08,.6,0,1)" returns 51 results, "cubic-bezier(0.08, 0.6, 0, 1)" a further 13 — the de facto genre standard
- https://www.csgoroll.com/info/provably-fair/ — server seed hashed and committed before use, revealed for verification
- https://intercom.help/csgoroll/en/articles/11093702-what-is-a-roll-spin — Roll Spin described purely as an alternate animation for unboxing and PvP, explicitly not a mechanical change
- https://steamcommunity.com/app/730/discussions/0/35222218619490647 — CS:GO reel described as presentation only; item is in the inventory before the roulette stops
- https://steamcommunity.com/app/730/discussions/0/364042262889179791 — players reporting animation/outcome mismatch and concluding the system is rigged
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7214505/ — The Near-Miss Effect in Slot Machines: A Review and Experimental Analysis Over Half a Century Later
- https://pmc.ncbi.nlm.nih.gov/articles/PMC10867214/ — Gambling and virtual reality: unraveling the illusion of near-misses effect (frustrated arousal, persistence)
- https://www.researchgate.net/publication/230801294_Psychophysiological_arousal_signatures_of_near-misses_in_slot_machine_play — near-misses produce the largest heart-rate accelerations of any outcome type
- https://www.rocketleague.com/news/rocket-league-patch-notes-v2-63 — SKIP DROP OPENING ANIMATION setting
- https://casecalculator.app/simulator — Classic full-reel mode plus auto-open at 0.5x–10x speed
- https://hypixel.net/threads/a-way-to-skip-the-mystery-box-opening-animation.782087/ — animation fatigue at volume
- https://uism.co.jp/en/blog/why-are-people-obsessed-with-gacha-what-capsule-toys-can-teach-us-about-ux-engagement-strategy/ — waiting time as ritual; tactile/auditory feedback maximising anticipation
- https://nichegamer.com/the-casino-app-boom-and-what-it-reveals-about-game-design/ — explicit link between gacha near-pulls and slot near-win animations


---

## Angle 2 — Pokémon TCG Pocket's pack opening

### Summary

Pokémon TCG Pocket's pack opening, reconstructed at beat level from developer talks (CEDEC 2025), Japanese community "確定演出" (guaranteed-cue) guides, published per-slot pull rates, and design critiques — then mapped onto RIPDEX as it actually exists in the code (cardsPerPack: 1, five steps in rip-page.ts, tier-scaled choreography in tiers.ts, a live padNearMiss() at rip-page.ts:808).

The headline: PTCGP does NOT generate excitement by faking tension. It generates it with four honest structures — (1) the pack is genuinely back-loaded and revealed in that order, so escalation is a true statement about the remaining odds; (2) its rarity "tells" are ONE-DIRECTIONAL — a cue fires only when something good is really in the pack, but does not always fire when it is, so the cue can never lie and its absence never kills hope; (3) pack length itself is variable (~8.33% are six-card packs) and signalled at the tear, so the reveal has a truthful structural surprise; (4) every pack pays a guaranteed non-random floor (5 Pack Points) so the median pack is mathematically never a zero.

That last one is the direct answer to RIPDEX's core problem. PTCGP's median pack is also boring — slots 1-3 are 100% one-diamond commons by rule. It survives that because a boring pack still moves three counters the player cares about (Pack Points toward a card they chose, dex completion, Shinedust from dupes) and because the boring cards are still nice OBJECTS. RIPDEX currently has a one-card pack with no floor, so its median rip is a true zero — which no amount of choreography fixes.

Also flagging: rip-page.ts:808 padNearMiss() seats a rare tile next to the winner ~70% of non-rare spins. Its comments defend it carefully and it is far from the worst version of the idea, but it is a fabricated adjacency, and PTCGP's one-directional tell is a strictly better mechanic that gets more tension out of information that is actually true.


### Findings (15)


#### Slot-ordered escalation: the pack is genuinely back-loaded, and revealed in that order

**What it is.** A standard PTCGP pack is five cards. Slots 1-3 are 100% one-diamond commons — zero rare chance, by rule. Slot 4 is where rarity starts (Crown 0.040%, ★★★ 0.222%, ★★ 0.500%, ★ 2.257%, ◇◇◇◇ 1.666%, ◇◇◇ 5.000%, ◇◇ 90%). Slot 5 is roughly 4x slot 4 across the board (Crown 0.160%, ★★★ 0.888%, ★★ 2.000%, ★ 10.288%, ◇◇◇◇ 6.664%, ◇◇◇ 20%, ◇◇ 60%). Cards are revealed in slot order, 1 to 5. So the reveal walks monotonically up an expected-value curve, and the last card is genuinely the best bet in the pack.

**Why it works.** Tension is normally manufactured by withholding. Here it is manufactured by TRUTH: at every moment the player's remaining expected value is rising, and they know it. Cards 1-3 are deliberately not suspenseful — they are the runway, and burning them fast is correct because there is nothing to be suspenseful about. All the emotional budget is spent on slots 4 and 5. This also converts a boring pack into a shape rather than a flat line: even an all-common pack has a rising-then-resolving arc, not five identical shrugs. It is the physical-TCG 'open so the rare is last' trick, promoted from folk practice to guaranteed structure.

**For RIPDEX.** This is the biggest structural gap. RIPDEX packs are cardsPerPack: 1 (apps/web/packs/charizard-chase.ts:17, apps/web/packs/generate.ts:163). One card means there is no slot curve, no runway, no rising line — just a single binary that is a Tier 1 dud 90%+ of the time. Everything else PTCGP does about pacing is downstream of having multiple slots. The transferable move is a multi-card pack whose slots have PUBLISHED, DIFFERENT weight tables, revealed worst-slot-first: e.g. 3 cards where slots 1-2 draw from a capped-value sub-pool and slot 3 draws from the full pool including grails. openPack() in snapshot.ts already loops cardsPerPack times through a weighted draw; per-slot pools would mean odds.ts carrying an array of weight tables instead of one, and /packs rendering a per-slot odds table — which is MORE fairness surface, not less. If a one-card pack is economically fixed, the weaker substitute is to give the single card a truthful multi-beat resolution (see the one-directional tell finding).

**Honest or manipulative.** Completely honest, and the cleanest kind of honest — it does not dramatize the outcome at all, it changes the underlying distribution so that the natural reveal order IS an escalation. Nothing is misrepresented; the odds per slot are published. This is the opposite of a manufactured near-miss: it is a manufactured near-CERTAINTY of rising stakes, which is a real property of the pack.


#### The one-directional 'confirmed' tell (確定演出) — a cue that can never lie

**What it is.** During the tear and reveal, PTCGP may fire one of several escalation cues: a loud cracker/party-popper burst sound at the moment the seal breaks; bright light spilling out of the cut edge (often orange); a rainbow-coloured light burst; a background colour shift from the standard blue to pink/gold when the cards come up; a distinct melody instead of the standard opening sound. Each of these is a 確定演出 — 'confirmed cue' — meaning: if it fires, a ★1-or-above card IS in the pack. Crucially, the Japanese guides are explicit that the implication runs one way only: the cues do not always appear even when a rare is present, and a rare can arrive with no flourish at all. There is also a NON-guaranteed cue kept deliberately separate — a sparkle on the card frame when you tilt a revealed card diagonally — which the guides label 確定演出ではない (not a confirmed cue).

**Why it works.** This is the single most transferable idea here, and it is a genuinely elegant piece of design. A deterministic tell (fires iff rare) would be honest but would kill the game: no cue would mean 'confirmed dud' and the rest of the reveal is dead air. A probabilistic-but-lying tell (sometimes fires with no rare) manufactures near-misses. PTCGP takes the third option: P(cue | rare) is meaningfully less than 1, and P(cue | no rare) is exactly 0. The cue therefore only ever ADDS information, never subtracts it. When it fires you get a legitimate, enormous spike. When it doesn't, you have learned nothing and hope is fully intact. And because absence is uninformative, the no-cue path — the overwhelmingly common path — costs the player nothing emotionally. It is a free upside with no downside, which is exactly why it can be used liberally without souring the median experience.

**For RIPDEX.** Directly and immediately applicable, and it fits RIPDEX's fairness pitch better than it fits PTCGP's. RIPDEX's outcome is settled server-side before a single pixel animates (rip-page.ts's own header comment says exactly this), so a cue is not a prediction — it is early disclosure of an already-recorded fact. Implementation: server returns a boolean `tell` alongside the result, computed as `tier >= TIER_3 && hmacDerivedUniform < 0.5` from the SAME commit-reveal seed. Then it is independently recomputable like everything else, and /packs can publish the literal rule: 'A tell fires on 50% of pulls of Tier 3 or above, and on 0% of pulls below it. If no tell fires, you have learned nothing.' Fire it at the tear (rip-page.ts step s-tear) so it lands before the reel, giving the 5.8s spin a real, true reason to be tense. The palette constraint bites here: PTCGP shifts hue, RIPDEX cannot (one accent). Use luminance, scale, particle density and audio instead — a brighter violet bloom from the tear line, the ember field surging, and a distinct chord from the existing WebAudio blip() — reserving --gold strictly for the grail case where it is a VALUE statement.

**Honest or manipulative.** Honest, and provably so — which is rare. It dramatizes a real outcome and misrepresents nothing. It is strictly better than RIPDEX's current padNearMiss() (rip-page.ts:808), which seats a rare tile beside the winner on ~70% of non-rare spins: that is a fabricated adjacency, and while its comments correctly note it never CLAIMS a near miss and never adapts to the user, it is still set dressing that means nothing. The one-directional tell extracts more tension from information that is actually true. If you ship the tell, delete padNearMiss — you will not need it, and keeping both means the loud moment is sometimes a lie.


#### Variable pack length, announced at the tear — the six-card pack

**What it is.** Roughly 8.33% of packs (about 1 in 12) in recent sets contain SIX cards instead of five. The sixth card is a guaranteed Baby Pokémon or shiny; the other five slots keep their normal rates. This is signalled twice and both signals are truthful: orange light spilling from the pack's mouth at the moment of tearing means a sixth card is confirmed, and when the sixth card is flipped, a light bloom spreads across the background. Six-card packs only occur when one of those bonus card types is actually present.

**Why it works.** It makes the LENGTH of the ritual itself a variable-ratio reward, which is a category of surprise almost nothing else in the genre uses. The player counts cards subconsciously; reaching for a card that shouldn't exist is a genuine jolt. And because it is announced at the tear, the whole five-card reveal is played under a known bonus condition — the player is not waiting to find out IF, they are enjoying knowing. That converts what would be a late surprise into an early gift that colours everything after it, which is more generous and less cheap.

**For RIPDEX.** Requires multi-card packs to work as-is, so it is blocked behind the same structural change. But the underlying idea — the SHAPE of the ceremony is itself a reward, announced honestly and early — maps onto a one-card RIPDEX today: a Tier 4 or Grail pull could earn a longer, structurally different rip (an extra beat, a second plane, a slower deceleration) that is announced at the tear rather than discovered at the flip. tiers.ts already does the mild version of this with choreographyFor(): Grail gets suspenseMs 2200 / flipMs 1400 / fullTakeover, Tier 1 gets 220 / 450 / nothing. The gap is that RIPDEX's escalation happens entirely AFTER the reveal — the player learns the tier from the card, then the choreography confirms it. PTCGP's happens BEFORE. Moving even part of RIPDEX's tier choreography ahead of the reveal is the highest-leverage change available without touching pack economics.

**Honest or manipulative.** Honest. The signal is deterministic and correct — orange light means a sixth card is in there, full stop. There is no version where the light fires and the card is not present. Note this is a case where a deterministic tell is fine, because it announces a bonus rather than grading an outcome: nobody is disappointed by the absence of a bonus they never expected.


#### The tear is a real gesture, at the player's own speed, with foley recorded off real packs

**What it is.** After choosing a pack from a 3D carousel (you can swipe between identical sealed packs and flip them front-to-back), the pack fills the screen and a guide line appears near the top. You drag a finger across it and the pack tears open under your finger — the sound tracks the drag, not a fixed timeline. A later update added a second, discoverable variant: flip the pack to its back, swipe up, then pull apart with two fingers simultaneously, 'party-open' style like a bag of crisps. Creatures art director Satoru Nagaya on the audio: "Since we expect users to open packs every day, we paid particular attention to the sound they make when opening the pack... I searched for a pleasant sound while actually opening a number of physical packs. As a result of testing various locations, such as sliding your finger around on the pack or the feel when completely opened, I think I found a sound that evokes a sense of excitement."

**Why it works.** Three things. First, agency: the outcome is fixed but the PACE is yours, so the player owns the moment of maximum uncertainty instead of watching it. Second, the sound is bound to the gesture rather than to a clock, which is what makes it read as a material yielding rather than an animation playing. Third, the second opening method is not advertised — finding it is a small, free discovery that makes a daily ritual feel like it still has floor beneath it after a hundred repetitions. Note that the burst-sound cue is AUDIO-ONLY, which means the game is willing to put a first-class signal in a channel some players have muted; that is a strong statement about how much they trust sound.

**For RIPDEX.** RIPDEX already has the core of this and it is good: rip-page.ts's s-tear step has a real drag-to-tear on #tearWrap with a perforated .strip and a 'DRAG ACROSS TO TEAR' hint, touch-action:none, the works. Two upgrades. (1) Bind audio to the drag: rip-page.ts already ships a dependency-free WebAudio blip() (square wave, 1850Hz, ~45ms) for reel ticks, and the AudioContext is already created inside the user gesture chain so autoplay policy allows it. A filtered-noise burst whose amplitude and filter cutoff track drag distance is maybe twenty lines of the same API and no new dependency — a paper tear is broadband noise, which is the easiest thing WebAudio makes. (2) The tear currently gates a fixed 5.8s reel; consider letting tear velocity feed the reel's initial velocity, so a fast rip and a slow rip feel different without changing the landing. Also worth adding a second discoverable tear (drag down the side seam) purely as a returning-player reward.

**Honest or manipulative.** Honest. The pace is player-controlled and the outcome is already settled and recorded — nothing about the gesture influences or pretends to influence the draw. This is dramatization of a real event in the purest sense.


#### Rarity is expressed as a change of KIND, not a change of degree

**What it is.** From the CEDEC 2025 talk by Creatures' Satoru Nagaya and DeNA's Yuma Handa, Takaya Hirota and Masashi Yamamoto: each rarity tier adds a qualitatively different rendering technique rather than more of the previous one. ◇/◇◇ get NO hologram at all — deliberately, prioritising 'タイプのわかりやすさ' (type clarity) and illustration legibility. ◇◇◇ introduces two hologram types, one on the frame and one on the illustration with masking so the Pokémon stays readable. ◇◇◇◇ adds parallax shaders for background depth plus a genuine 3D Pokémon model (generated via Houdini) that breaks out of the card frame, aiming for '迫力やバトル感' (intensity and battle feel). ★★ adds camera-angle-dependent hologram masking — when the card faces you, the mask is strong so the hero art stays clean; tilt it and the holo blooms. Ultra Beast ★★ gets an animated marble background driven by cellular-noise shaders. Shinies get prism layers with OkLab colour interpolation, mirror-ball reflection backgrounds, trail sparkles (トレイルキラ) and squishy sparkles (プヨキラ). ★★★ 'immersive' cards get a short film. The whole card is a 3D model WITH THICKNESS — 'カードに厚みを付けることで、紙のカードのような手ざわり感に近づけることを目指した'.

**Why it works.** If rarity were 'more sparkle', a common would read as a failed rare — visually impoverished, an absence. By giving commons a different DESIGN GOAL (legibility, type clarity, clean art) rather than a lesser amount of the rare treatment, a common card is a finished object rather than a stripped one. That is a large part of why an all-common PTCGP pack does not feel like five failures. The masking detail is the tell that this team is serious: on ★★ the holo is masked DOWN when the card faces you, i.e. they suppress the expensive effect precisely when it would fight the art.

**For RIPDEX.** RIPDEX is already most of the way there and should notice it. rip-page.ts has per-rarity foil shaders keyed off data-foil — normal (soft-light sheen), holo (color-dodge spectral band + overlay stripe), reverse-holo (masked with an xor mask-composite so the window stays clear), full-art (blurred wide dodge + pointer-tracked radial), special-illustration (dual crossed gradients + repeating-conic + hot specular), gold (metal ramp + micro-stripe). The comment calls it 'Physics, not palette' and that is exactly right. Two things to fix. (1) The `normal` finish is currently a weak version of holo — a single soft-light band. Per PTCGP, give it a different JOB: crisper edge lighting, a slightly warmer paper grain, sharper art. Make a Tier 1 common look like a well-lit real card, not a card missing its foil. (2) HANDOFF notes each tile paints a blurred saturated copy of its own artwork behind it via --art; that per-card bridge colour is the strongest 'this common is still a beautiful object' asset in the codebase and it is not used on the rip page's reveal. Use it there.

**Honest or manipulative.** Honest and, more than that, generous. Nothing here misrepresents an outcome; it invests real craft in the outcomes that happen most often. This is the single most defensible way to spend money on a gacha's presentation.


#### The card stays a manipulable object after the reveal — and the tech exists to keep it perfect at any angle

**What it is.** Every revealed card can be picked up, tilted and turned, and the holo, parallax and sparkle respond continuously. Technically this is not a tilt on a flat sprite: the team decouples the card's POSE from its APPEARANCE via off-screen rendering — a dedicated capture space renders the card at constrained angles to a texture, which is then applied to the display model with projective UV correction. Their three stated goals were '自由にカードを動かせること' (free manipulation), '常に意図した見た目を維持すること' (always maintaining the intended look) and 'カードの姿勢に応じて自然に変化すること' (changing naturally with pose). The UV correction specifically stops artwork spilling past the card border when tilted. There is also a separate, undocumented delight: pinch-zooming the unsorted Pokédex triggers a cascade of card flips, one after another, which players describe as a 'dopamine fix'.

**Why it works.** It converts the reward from an event into an object. An event is over; an object is owned. The player who pulled nothing good still ends the session having handled five things. And the Pokédex flip cascade is the tell that this team understands the real loop: the reward for collecting is not the pull, it is the pleasure of touching the collection afterwards — so they put a hidden toy in the collection browser.

**For RIPDEX.** RIPDEX has the harder half of this already (design.ts's .card3d with planes at art 0 / rim 2 / gloss 18 / badges 34, plus [data-layer] counter-drift under [data-depth]) and HANDOFF is right that inter-plane parallax is the whole difference. Two RIPDEX-specific cautions from that same file apply directly: perspective dies at the first descendant with transform-style: flat (this silently flattened the collection binder into a 1.2% squash), and any filter or opacity < 1 in the chain collapses the space — which matters because several foil layers use filter: blur(). Verify by measuring projected sizes, not by reading CSS. The clearer opportunity: the rip page ends at #after with VIEW CARD / SHARE CARD / RIP ANOTHER buttons, i.e. it hands the player links instead of the object. Let them hold the card on the reveal screen — pointer-driven tilt with the foil's --px/--py/--ang already wired — before offering to move on. And RIPDEX has a 3x3 binder in wallet-pages.ts that is the natural home for a Pokédex-cascade-style hidden toy.

**Honest or manipulative.** Honest. Nothing is claimed. It is craft spent on possession rather than on anticipation, which is the healthier of the two places to spend it.


#### Pack Points: every single pack pays a guaranteed, non-random floor

**What it is.** Opening any booster pack awards 5 Pack Points, unconditionally, regardless of what you pulled. Points are bound to the set they were earned from. They are spent in an exchange where every card in the set has a published point price — so the player can deterministically buy the specific card they want, given enough packs. A bad pack is therefore never worth zero: it is worth 5 points toward a card the PLAYER chose.

**Why it works.** This is the actual answer to 'how does a best-in-class opener make an ordinary pull still feel worth doing', and it is not a presentation answer at all — it is an arithmetic one. It changes the pack from a lottery ticket into a lottery ticket plus a coupon. The randomness supplies the spikes; the coupon supplies the floor. And because the exchange is player-directed, the floor accrues toward a specific named desire, which means every dud pack advances a goal the player consciously holds. Presentation cannot manufacture this feeling; it can only decorate it. Any amount of choreography on top of a genuine expected zero eventually reads as a con, and players work that out fast.

**For RIPDEX.** This is the highest-leverage change for RIPDEX and it is an economics change, not a design one, so it needs the owner. RIPDEX's median rip is a Tier 1 card worth under a dollar against a $RIP cost — a true near-zero with nothing else attached. The direct analogue: every rip accrues N points to a per-pack-scoped balance, and /packs publishes a point price for every card in that pack's pool. The engine already supports this cleanly — the ledger in openings.ts is immutable and append-only, and a points balance is a pure fold over stored rips, so it needs no new mutable state and stays as verifiable as everything else. It also composes with the existing invariant that a stored rip keeps its frozen price. Second-order benefit: it gives a reason to keep ripping the SAME pack, which is the retention shape RIPDEX currently lacks. Alternative if a hard currency is unwanted: make the floor informational rather than economic — surface, on every reveal, what this rip advanced (set completion %, first-time-owned, achievement progress). collection.ts already computes set completion and achievements.ts has 11 achievements over the ledger; none of it appears on the rip page.

**Honest or manipulative.** Honest, and specifically it is the ANTI-manipulation move. Note carefully what it is not: it is not a pity system that secretly improves your odds, and it is not a loss-disguising consolation animation. It is a second, deterministic, published reward channel running alongside the random one. Players can compute it. It makes the product better rather than making the losses feel better, which is the distinction that matters.


#### Duplicates convert into something, so the second copy is not a zero either

**What it is.** Duplicate cards feed two sinks. Shinedust plus spare copies buys 'flair' — cosmetic effects applied to a card you own, four different flairs per card, with higher rarities costing more Shinedust but fewer copies. The system refuses to let you drop below a playset of two, so you can never destroy your own collection by accident. Duplicate rares can alternatively be exchanged for Special Shop Tickets. The card detail view shows a copy count in the bottom-left corner.

**Why it works.** In a collection game the second copy of a card is the most common outcome after the first copy, and untreated it is the most demoralising — you did the ritual and received something you already had. Converting dupes into a cosmetic that you apply to a card you already care about routes the disappointment straight back into attachment to the collection. The below-a-playset guard is a small thing that matters a lot: it means the sink can never be regretted, so players use it freely.

**For RIPDEX.** RIPDEX's collection.ts already tracks per-variant duplicates, so the data is there and unused. Because a card's identity in RIPDEX is (set, number, finish, printing) — the pipe-delimited variantId, e.g. base2|4|holofoil|1st-edition — duplicates are exact and unambiguous, which is a better foundation for this than most systems have. The RIPDEX-native version is probably NOT cosmetics (the one-accent design system has little room for player-applied sparkle without wrecking it, and --gold/--em are semantically reserved). More promising: duplicates as the input to the points floor above, or as a display concept in the binder — a stacked-card depth effect showing you own four of something, which the existing .card3d plane stack could render almost for free and which reads as wealth rather than waste.

**Honest or manipulative.** Honest. It is a real sink giving real value for a real surplus. The only way to get this wrong is to price the sink so that dupes feel deliberately farmed for — keep the conversion generous enough that it reads as salvage rather than as a designed tax.


#### Wonder Pick: your boring pack becomes someone else's content

**What it is.** After you open a pack, it is published for a limited window (about 3 hours) into a pool other players browse. Another player spends Wonder Stamina to pick ONE of your five cards — they are shuffled face down first, and the pick is random among them. You lose nothing; they get a copy. The stamina cost is set by the HIGHEST rarity in the pack regardless of which card the picker actually lands on, so a pack containing one great card is expensive to try even though you will probably get a common out of it. Stamina regenerates at 1 per 12 hours; Wonder Hourglasses buy more; expired picks can be revisited with a Rewind Watch.

**Why it works.** Two things worth stealing and one worth refusing. Worth stealing: it gives every opened pack a SECOND life as content, so even a pack that disappointed you is contributing to the world — and browsing other people's packs is a low-cost way to keep the collection loop turning between your own openings. Also worth stealing: the face-down shuffle makes the pick itself a miniature reveal with a known, visible option set, which is a fundamentally more honest tension than a hidden draw — you can literally see the five things you might get. Worth refusing: PocketGamer.biz describes it plainly as a 'fomo loop, where you are constantly checking for high-rarity cards', built on a 3-hour expiry and a paid rewind. That is time-pressure monetisation.

**For RIPDEX.** RIPDEX has the raw material — feed.ts emits live rip events with tier-driven prominence and /live lists every rip newest-first. Today that feed is passive: you watch other people's outcomes. The transferable half is making it participatory in a way that does not require fake scarcity: for instance, a rip on the live feed being inspectable — see the pool it drew from, the seed, the odds it beat, recompute it yourself. That is 'browsing other people's packs' repurposed as fairness demonstration, which is RIPDEX's actual differentiator, and it costs nothing to the person whose rip it is. The face-down-shuffle-among-visible-options idea is also a clean fit for a future mechanic where the option set is public and verifiable. What must NOT come across is the expiry timer and the paid rewind — HANDOFF's line about no fake urgency covers exactly this, and a 3-hour window on someone else's pack is manufactured scarcity even though the underlying cards are real.

**Honest or manipulative.** Split. The core mechanic is honest — the five candidate cards are visible before you pick, the pick is genuinely random among them, and the cost is stated up front (and notably the cost is set by the pack's ceiling, not by what you get, which is disclosed rather than hidden). The wrapper is manipulative: 3-hour expiry, stamina that regenerates at 1 per 12 hours, and a consumable that undoes the expiry are a textbook time-pressure funnel. Take the mechanic, leave the wrapper.


#### God Pack / Rare Pack: the rare event changes the pack's RULES, not one card in it

**What it is.** 0.05% of packs (1 in 2000) are Rare Packs, colloquially god packs. In a Rare Pack every one of the five slots draws from ★1-and-above only: ★ 40%, ★★ 50%, ★★★ 5%, Crown 5%. It is not 'one guaranteed great card' — the pack's entire generating distribution is replaced. There is no way to identify one before opening, and the community's 'bent corner' theory for spotting them has been tested and disproven — it is, in the words of one guide, a playground rumour.

**Why it works.** Replacing the distribution rather than upgrading a slot means the rare event is felt five times instead of once, and it recontextualises the whole ritual — the runway slots that are normally guaranteed commons are suddenly live. That is a much bigger emotional payload than a single gold card for the same probability spend. And the fact that they let the bent-corner rumour exist and be disproven rather than seeding a fake tell is quietly important: the community got to do science on the game and the game held up.

**For RIPDEX.** RIPDEX's grail is a real 1-in-3,700 event — HANDOFF records that 6,000 seeded rips produced exactly one grail, which is the published 0.0269% playing out rather than a placed hero pull. That is a genuinely strong asset and it is currently spent on a single-card takeover (tiers.ts choreographyFor(Grail): suspenseMs 2200, flipMs 1400, metadataDelayMs 1100, dimBackground, fullTakeover; plus the #grailFx bloom/halo/spark layer in rip-page.ts). With a one-card pack there is no way to make the rare event multiply across slots, which is another argument for multi-card packs. If packs go multi-card, the PTCGP move maps exactly: a rare-pack variant where every slot draws from a Tier-3-and-above sub-pool, published in the odds table like everything else. Also worth copying explicitly: refuse to add any pre-tear tell for it. The one-directional tell above should cap out below grail, so the grail is the one outcome the game never hints at — the takeover arriving with zero warning is worth more than any escalation could be.

**Honest or manipulative.** Honest. Published rate, no fake tells, and the developers let a community-invented tell be publicly falsified rather than quietly implementing it. RIPDEX is already in an even stronger position here since its grail rate is not just published but recomputable per-pull.


#### Immersive cards: the top rarity gets a different medium, not a louder version of the same one

**What it is.** ★★★ 'immersive' cards trigger a short cinematic that takes over the screen before the card's final artwork resolves. The camera dives through the illustration's layers — for the Mewtwo card it starts with the card rushing forward toward Mewtwo surrounded by 3D glass shards, then plunges through the broken window into the lab he escaped from, showing other Pokémon living in the background environment. Immersive cards are identifiable in the collection by a black swirling frame, and afterwards can be touched and held to re-enter the scene. Players hunt for ways to replay the animation because it is otherwise only seen on the pull.

**Why it works.** Escalation eventually runs out of road if every tier is the same effect turned up. Immersive cards step sideways into a different medium — from object to short film — which resets the ceiling. It also means the top-tier reward has content, not just intensity: there is something to LOOK at repeatedly rather than a brighter glow to be impressed by once. That players actively seek out replay methods is the proof it worked.

**For RIPDEX.** RIPDEX's grail takeover is currently intensity-based: a fixed radial bloom, a pulsing halo, a spark field, gold framing. It is well built but it is the same language as every other tier, louder. The PTCGP lesson is to make the grail beat CONTENT-bearing and specific to the card that landed. RIPDEX has the raw material for this and does not use it — the card's own artwork. HANDOFF describes the --art trick where each tile paints a blurred saturated copy of its own artwork behind it, so a Charizard pools amber and a Blastoise pools blue. A grail takeover built from the pulled card's own art (a slow push into the artwork with the .card3d planes separating, its own colour flooding the mesh) would be different every time and would be about THAT card rather than about grail-ness in general. Constraint to respect: the grail bloom currently uses --gold, and --gold is grail-tier VALUE only — art-derived colour is fine as long as gold stays attached to the number.

**Honest or manipulative.** Honest. It is presentation spend concentrated on the genuinely rarest outcome, which is where presentation spend belongs. Worth noting it also has a cost PTCGP accepted: the animation is unskippable on the pull, which players have complained about — see the pacing finding.


#### Bulk opening exists: the ritual is opt-in, and the reveal is not the only mode

**What it is.** Players can open packs one at a time and savour the full presentation, or open ten at once, in which case the opening presentations are batched up front and run together — Japanese guides warn players not to blink and miss the cues during a ten-pack. Separately, the most common complaint in the official forums is that the standard single-pack presentation cannot be skipped: 'The pack open animation is why I stopped playing. It feels like a barrier to doing stuff I want', and 'the time it takes to turn off and restart game is comparable to the time it takes to open a gift pack and collect the card.'

**Why it works.** The lesson here is a failure lesson as much as a success one. A great reveal watched for the first time is a great reveal; the same reveal watched for the four-hundredth time is a toll. PTCGP is best-in-class at the ceremony and STILL loses players to it, because they made the ceremony mandatory. Bulk opening is their partial fix and it is telling that the fix is 'batch the ceremony' rather than 'remove it' — the ritual is the product, but the player has to be the one who chooses to spend the time.

**For RIPDEX.** Sharp warning for RIPDEX. The current rip is five sequential steps — s-select, s-roll, s-tear, s-reel, s-card — and the reel alone is a hard 5.8 seconds (dur = 5.8 in spin(), REEL_LEN 64, WIN_AT 56) with a tear gesture and a flip on either side. That is comfortably 15-20 seconds of mandatory ceremony for a median outcome worth under a dollar. That ratio is the actual risk to 'the website is not exciting enough' — the fix for a boring outcome is very often to reach it FASTER, not to dress it more. Concretely: keep the full ceremony for a first rip and for Tier 3+, but let the deceleration curve or the reel length scale with tier the way tiers.ts already scales suspenseMs (220ms for Tier 1 vs 2200ms for a grail — the reel should honour that same 10x ratio and currently does not, it is flat at 5.8s for everything). Add an explicit multi-rip mode. And note rip-page.ts already handles prefers-reduced-motion by collapsing the reel to 0.45s, which proves the fast path works and is one config flag from being a user-facing option.

**Honest or manipulative.** Neutral mechanically, but there is an honesty dimension worth naming: a long unskippable animation on a low-value outcome starts to function as a way of making the player feel they received more than they did. Scaling ceremony to real outcome value — which tiers.ts already believes in and the reel does not implement — is both the better experience and the more honest one.


#### The choice ritual before the tear: a carousel of identical packs

**What it is.** Before opening, the player is shown a carousel of visually identical sealed packs and picks one. They can swipe between them and flip them front-to-back. The choice has no effect on the outcome. The Pratt design critique notes the swipe and flip affordances are not immediately discoverable, that a mis-tap locks you into a pack with no undo, and that because all packs look the same players cannot track which one they are on — it recommends a scrollbar for positional mapping.

**Why it works.** It is an illusion of control, and it is worth being precise about why this specific illusion is comparatively benign: the player is not told the choice matters, and the game does not seed fake tells to imply it does — it actively lets the bent-corner rumour be disproven. What the ritual actually buys is a moment of COMMITMENT before the uncertainty resolves. Choosing makes the outcome yours in a way that being handed one does not, even when you know the choice was arbitrary. That is the same reason people pick their own lottery numbers.

**For RIPDEX.** Applicable but the honesty framing has to change for RIPDEX. In a product whose entire pitch is verifiable fairness, presenting a choice among options that are provably identical is a bad look the moment a user thinks about it for ten seconds — and RIPDEX's users are crypto-native and will. The RIPDEX-native version of 'commitment before uncertainty' is the client seed. Let the player enter or reroll their own client seed before the rip, which is a REAL choice that genuinely and verifiably enters HMAC-SHA256(serverSeed, 'clientSeed:nonce:cursor'). That is the same psychological beat — I chose, therefore this outcome is mine — except the choice is materially true and doubles as fairness education. RIPDEX's s-select step currently has a pack, specs and a RIP PACK button; a seed field is the missing commitment beat. Related engine caveat from HANDOFF: RipEngine's nonce counter is in memory and a restart replays nonces, which needs a persisted per-clientSeed counter before anything makes the client seed player-visible.

**Honest or manipulative.** PTCGP's version is mildly manipulative but about as gently as this can be done — no fake tells, no claim of influence, and community theories were allowed to be falsified. For RIPDEX it would be a mistake regardless, because the product cannot afford a decorative choice. Replace it with the client seed, which is strictly better on both axes.


#### The composite answer to the boring pull — none of it is choreography

**What it is.** PTCGP's median pack is genuinely boring by design: three of five slots are 100% common by rule, and slot 4 is 90% two-diamond. It survives this via five things layered together. (1) A guaranteed floor — 5 Pack Points every time, spendable on a card the player picked. (2) Dex progress — every card registers, and the game has repeatedly overhauled registration in response to complaints, including a change so a card appearing in multiple packs registers in every applicable dex. (3) Dupes convert to Shinedust and flair. (4) The commons are well-made objects with their own design goal (legibility and type clarity), not stripped rares. (5) The whole thing is free — two packs a day on a 12-hour timer, so there is no loss frame to soothe in the first place. The presentation layer contributes exactly one thing to the boring case: it is SHORT, because slots 1-3 have nothing to be suspenseful about and are burned quickly.

**Why it works.** Because a boring outcome is an arithmetic problem, not a presentation problem. Every one of the five load-bearing mechanisms changes what the player ACTUALLY RECEIVED. None of them changes how the receipt is animated. This is the finding that most directly answers the question asked, and the answer is slightly deflationary: best-in-class openers do not make ordinary pulls feel good through choreography — they make ordinary pulls not be worth zero, and then get out of the way quickly.

**For RIPDEX.** Maps onto RIPDEX as a gap list. RIPDEX has (4) partially — real artwork, real scans, good foil shaders, the per-card --art bridge colour — and has the ingredients for (2) sitting unused in collection.ts (set completion, binder) and achievements.ts (11 achievements over the immutable ledger), none of which surfaces during a rip. It has nothing for (1), nothing for (3), and (5) is inverted: RIPDEX rips cost $RIP, so there IS a loss frame, which makes a floor MORE necessary than in PTCGP, not less. The concrete minimum: on every reveal, alongside name and reference value, show what this rip advanced — 'FIRST COPY' / '3rd copy', 'BASE SET 41/102 → 42/102', 'unlocked: [achievement]'. That is honest, it is computable from data that already exists, it costs no economics change, and it means a $0.40 Tier 1 card is never a pure zero. The larger fix is a real floor, which needs the owner. And the pacing corollary: make the Tier 1 path FAST. tiers.ts already says Tier 1 deserves 220ms of suspense; the 5.8s flat reel currently overrules it.

**Honest or manipulative.** Entirely honest — and worth stating plainly, because this is the finding that could most easily be perverted. The manipulative version of 'make bad pulls feel good' is louder animations, fake consolation, near-miss framing and streak-based secret pity. The honest version is to give the player something real that they did not have before, tell them exactly what it was, and not waste their time. RIPDEX's existing padNearMiss() (rip-page.ts:808, fired on ~70% of non-rare spins) is a mild instance of the first category; the surfacing of collection progress is the second, and it is available today for less work.


#### Contested: whether a pity system exists (report this as unresolved)

**What it is.** Sources disagree. GameWith's Japanese guide states a pity: after 12 consecutive packs yielding nothing above ◇◇◇, the next pack guarantees ◇◇◇◇ or higher. ONE Esports states flatly that 'Pokemon TCG Pocket currently doesn't feature a pity system to increase the odds of pulling rare cards', and that Pack Points serve that role instead. Both are recent. The likeliest explanation is a pity added in a later patch that English coverage has not caught up on, but I could not confirm it against a primary source.

**Why it works.** Raising it because the design question matters more than the fact. A pity system is a hidden, state-dependent modification of the published odds — and that is exactly the kind of mechanic that is fine in a gacha and structurally impossible in RIPDEX unless it is declared.

**For RIPDEX.** If RIPDEX ever wants a pity, it must be part of the PackConfig, part of the published odds table on /packs, and part of the recomputation — i.e. the verifier must be able to derive the same result from (seed, nonce, streak-state) and the streak state must be in the immutable ledger. That is buildable: openings.ts is append-only, so a streak is a fold over prior rips and is as verifiable as the draw. But it changes the odds table from a single distribution into a conditional one, and /packs would have to say so honestly ('after N consecutive Tier 1 pulls, the next rip draws from...'). This is genuinely more work and more explaining than a Pack Points floor, which achieves a similar emotional result with no change to the randomness at all. My recommendation is the floor, not the pity.

**Honest or manipulative.** A pity system is honest if and only if it is published and recomputable. An undisclosed one is a direct contradiction of RIPDEX's central claim — the odds table on /packs would be false — and would be trivially detectable by anyone recomputing a batch of pulls, which is precisely the audience this product invites. Do not build a silent one.


### Sources

- https://cgworld.jp/article/202508-cedec-ptcgp.html — CEDEC 2025 report: how PTCGP translated paper-card feel to digital (card layers, rarity rendering, off-screen render + projective UV)
- https://gamemakers.jp/article/2025_08_04_113058/ — CEDEC 2025 full session report by Creatures' Satoru Nagaya and DeNA's Yuma Handa / Takaya Hirota / Masashi Yamamoto: per-rarity rendering ladder, card thickness, holo/parallax/prism/trail-sparkle techniques
- https://gonintendo.com/contents/40485-pokemon-trading-card-game-pocket-dev-on-why-sound-design-is-key-to-a-satisfying — Nagaya on recording pack-opening foley from real packs
- https://gamewith.jp/pokemon-tcg-pocket/470711 — 確定演出 (guaranteed cue) ladder: burst sound, light from the cut, background colour shift; pull rates; contested 12-pack pity claim
- https://games.appmatch.jp/gamewiki/pokemontcgpocket/6479970832-69/ — complete guaranteed-cue guide including the explicit statement that cues do not always fire on rares and rares can arrive with no cue (the one-directional property)
- https://www.oneesports.gg/gaming/pokemon-tcg-pocket-pity-system-explained/ — full per-slot drop rate table for all five slots plus Rare Pack rates; states no pity system exists
- https://game8.co/games/Pokemon-TCG-Pocket/archives/477126 — Rare Pack (god pack) rate 0.05% and its internal distribution
- https://game8.jp/pokemon-tcg-pocket/708480 and https://gamewith.jp/pokemon-tcg-pocket/512090 — six-card packs: ~8.33% rate, guaranteed baby/shiny sixth card, orange light at the tear as the confirmed cue
- https://www.inside-games.jp/article/2026/04/28/180640.html — the April 2026 added back-of-pack 'party open' two-finger opening variant
- https://ixd.prattsi.org/2025/09/design-critique-pokemon-tcg-pocket-android-app/ — Norman-framework design critique: signifiers, gesture guide lines, pack-selection carousel affordance problems, no undo
- https://community.pokemon.com/en-us/discussion/18429/add-a-less-animation-heavy-way-to-open-packs-or-make-it-skippable — official forum thread on unskippable pack animations as a churn cause
- https://www.pokemon-zone.com/articles/pack-points/ and https://www.thegamer.com/pokemon-tcg-pocket-pack-points-exchange-explained-guide/ — Pack Points: 5 per pack unconditionally, set-bound, player-directed exchange
- https://www.thegamer.com/pokemon-tcg-pocket-shine-dust-flair-explained/ and https://game8.co/games/Pokemon-TCG-Pocket/archives/474555 — Shinedust and flair as the duplicate sink, with the below-a-playset guard
- https://www.gamesradar.com/games/pokemon/pokemon-tcg-pocket-wonder-pick/ and https://www.pocketgamer.biz/game-analysis-the-winning-formula-behind-pokmon-trading-card-game-pocket/ — Wonder Pick mechanics, stamina/expiry economics, and the 'fomo loop' characterisation
- https://gamerant.com/pokemon-tcg-pocket-how-get-all-immersive-cards/ and https://bulbapedia.bulbagarden.net/wiki/Immersive_card_(TCG_Pocket) — immersive card takeover animation and the black swirling frame identifier
- https://screenrant.com/pokemon-tcg-pocket-card-flipping-animation/ — the hidden Pokédex pinch-zoom cascade flip
- https://game8.co/games/Pokemon-TCG-Pocket/archives/483183 — bent-corner 'search' theory tested and disproven
- RIPDEX code read directly: /Users/holdengoodwin/code/ripdex/HANDOFF.md, /Users/holdengoodwin/code/ripdex/packages/pokemon-core/src/tiers.ts, /Users/holdengoodwin/code/ripdex/apps/web/src/rip-page.ts (1098 lines; padNearMiss at :808, called at :874; reel dur 5.8s, REEL_LEN 64, WIN_AT 56; WebAudio blip at :831), /Users/holdengoodwin/code/ripdex/apps/web/packs/charizard-chase.ts:17 and /Users/holdengoodwin/code/ripdex/apps/web/packs/generate.ts:163 (cardsPerPack: 1)


---

## Angle 3 — Gacha escalation and pre-reveal tells

### Summary

ANGLE 3 — Gacha escalation and pre-reveal tells, evaluated against RIPDEX's fairness constraint.

Three things fell out of the research that reframe the brief.

**1. The honest/dishonest line is sharper than expected, and the industry already draws it.** Every pre-reveal tell in the genre is one of two shapes. A *floor signal* narrows uncertainty upward and never overstates: FGO's gold ring means "guaranteed 4★ or 5★" — a true statement about a settled draw that still leaves a real question open. A *fake-out* displays a value other than the result's and then corrects downward: Dokkan Battle's "fake out summon animations," which the community has compilation videos of. The FGO/Genshin family is monotone-upward (purple can become gold; gold never becomes purple). RIPDEX can take the entire floor-signal family wholesale and must reject only the downgrade. That is a much larger honest surface than I expected going in.

**2. RIPDEX already ships the best honest tell in the genre — at exactly one tier.** `present()` in `apps/web/src/rip-page.ts:942` fires the whole grail takeover *before* the card flips: `#grailFx.on`, `sparks()`, and `card.grail` putting a gold rim on `.thick` and a gold bloom on the front face, then holds 2200ms with the card still face-down. A gold-rimmed card in a gold-blooming darkened room, 2.2 seconds before you can turn it, is textbook honest dramatization. It fires on 0.0269% of rips. The ladder has a top rung and a bottom rung and nothing between: `choreographyFor` returns two booleans (`dimBackground`, `fullTakeover`) for five tiers, so Tier 3 and Tier 4 get the identical flat radial dim.

**3. The real problem is not the tell — it is the distribution, and it changes what kind of tell is even buildable.** I computed the tier distribution from the committed pools and prices:

- `base-set-rip`: **92.24% Tier 1**, 6.20% T2, 1.34% T3, 0.191% T4, 0.0269% Grail. EV $3.01.
- `151-rip`: **98.66% Tier 1**, 0.81% T2, 0.40% T3, 0.121% T4, **0.0% Grail** (no pool variant clears $500; top is $366).

So roughly 95% of all rips are a sub-$5 card. Any tell with five visible states displays the bottom state almost every time — a punishment badge shown on nearly every rip. This rules out the genre's default answer (a rarity colour ramp) on product grounds, and RIPDEX's palette rules it out again independently: violet is the one accent and belongs to controls, `--gold` is grail *value* only, `--em` means "a provider confirmed this." There are no colours left and inventing four would turn a Linear-register site into a casino.

What that leaves is the useful finding. The channels that are unclaimed, quantitative, and have a genuine neutral off-state are **darkness, time, density, elevation, and sound**. All five scale continuously from zero, so a Tier 1 rip simply gets *nothing extra* rather than getting a badge that says it lost — Hearthstone's rule, where commons don't glow at all. And an escalation built out of "the room goes dark and quiet around one lit object" is a far better fit for the luxury-collectible register than a rainbow ramp would ever have been.

Also worth stating plainly: no gacha game documents its tells, which is why FGO has a live argument about whether rainbow really guarantees SSR and why "fake out" is a search term. RIPDEX can publish the mapping on `/packs` and let anyone verify it against the public ledger. That converts the tell from folklore into another auditable claim — and it is the move that makes the borrowed mechanic actually belong to this product instead of being imported from a genre it is trying to be better than.

One structural caveat that limits several findings: `cardsPerPack` is 1 in all three packs, so every multi-item gacha mechanic (batch tells, ordered reveals, best-card-last) is inapplicable today and becomes the strongest argument for multi-card packs. Findings 4 and 15 are the ones that hinge on it.


### Findings (18)


#### The floor signal — FGO's gold ring vs. rainbow ring

**What it is.** Fate/Grand Order's summon plays a ring of spheres several seconds before the servant card flips. Blue ring = nothing above 3★. A gold spark = guaranteed 4★ OR 5★. A rainbow spark = guaranteed 5★. The gold ring is deliberately ambiguous across two tiers: it says 'at least this good' without saying which. Two distinct signal strengths, one a floor and one exact, in the same channel.

**Why it works.** It narrows uncertainty instead of resolving it, which is the highest-tension state available — the player moves from 'one of five outcomes' to 'one of two good outcomes' and still has a real question left. The two-strength hierarchy also protects the rare signal: because gold is common enough to be legible, rainbow stays meaningful. Critically, the floor signal is a statement the animation can always keep.

**For RIPDEX.** Maps directly and is the single most transferable mechanic in this angle. RIPDEX has five tiers and one card, and the outcome is settled and recorded before the reveal begins, so 'this card is at least Tier 3' is a true, ledger-recomputable statement made at a moment when the player still doesn't know if it's T3, T4 or grail. The face-down card already has the planes to carry it: `.thick.a`/`.thick.b` are the visible edge bevels and `.pedestal` is the ground glow, both currently keyed only off `.card.grail`. A floor tell is a generalisation of code that already exists rather than a new subsystem. One caution the research supplies for free: FGO has a persistent community argument that 'rainbow sometimes gives SR', which shows an unreliable tell generates conspiracy rather than trust. For a product whose pitch is verifiable fairness the mapping must be published and hold over the whole ledger, not be folk knowledge.

**Honest or manipulative.** Honest. It only ever understates or exactly states the truth, never overstates. A floor tell that fires on a Tier 3 pull is not a near-miss — nobody was told a grail was coming. This is the shape of tell RIPDEX can take wholesale.


#### Duration as the tell — already implemented in RIPDEX, currently reading as lag

**What it is.** The length of the pre-reveal hold scales monotonically with the outcome. Honkai: Star Rail changes the 'hype' music length and character before the doors; Genshin holds the star's descent longer for a 5★. RIPDEX already does exactly this in `packages/pokemon-core/src/tiers.ts` — `choreographyFor` returns suspenseMs of 220 / 500 / 900 / 1400 / 2200 across Tier1 → Grail, plus flipMs 450→1400 and metadataDelayMs 300→1100.

**Why it works.** Time is the cheapest and most legible escalation axis there is; a held pause reads as significance without any semantic content. Because the mapping is monotone, players learn it without being taught, and the learning itself becomes a pleasure separate from the pull.

**For RIPDEX.** Already shipped, but currently doing harm rather than good, for two concrete reasons in `apps/web/src/rip-page.ts:942-975`. First, during `await wait(ch.suspenseMs)` literally nothing on screen changes — the card sits static — so a 2.2s grail hold is visually indistinguishable from a slow server. Second, the click handler is only attached *after* that await, so on a grail the user taps a card that says 'TAP TO REVEAL' for 2.2 seconds and gets no response at all; the biggest moment in the product currently reads as a broken button. The fix is two-part: attach the handler immediately and gate the flip until the hold elapses, and make the hold visibly escalate (see the riser finding) so the duration is perceived as ceremony.

**Honest or manipulative.** Honest — the duration is derived from the frozen tier by a pure function. But note that an unexpressed duration is not dramatization, it is latency. Honest escalation still has to be legible as escalation.


#### The tell fires only upward; its absence is neutral, not a verdict (Hearthstone)

**What it is.** In Hearthstone's pack open, five cards land face-down. Hovering a card above common quality shows a rarity-coloured glow — blue for rare, and so on. Commons show no glow at all. On flip, rares get an extra animation and a voice line ('rare', 'epic', 'legendary'); commons flip silently. The signal has an off state, and the off state is the default.

**Why it works.** Absence of signal reads as 'nothing special here', which is a far softer landing than an explicit grey/dim/loser treatment that reads as 'you failed'. And because the signal is scarce it stays valuable — 343 Industries' Christopher Bloom on exactly this: 'You can't do it all the time or you lose the specialness.'

**For RIPDEX.** Given the measured distribution this is the governing design rule for RIPDEX, not an optional refinement. With 92.24% of `base-set-rip` and 98.66% of `151-rip` landing in Tier 1, a five-state tell would display its lowest state on roughly 95% of all rips. `choreographyFor` half-anticipates this — `dimBackground:false` for T1 and T2 — but it achieves the neutral state by *withholding production value* rather than by giving low tiers something else to land on. The correct reading is: T1 and T2 are the off state, and escalation starts at T3. That also means only three tiers ever need distinct escalation states, which makes the whole ladder cheaper to build than it looks.

**Honest or manipulative.** Honest. Silence makes no claim. This is also the mechanic that answers the brief's 'without making low-tier outcomes feel like punishment' most directly.


#### Batch-level truthful tell — Blue Archive's letter, Genshin's splitting star

**What it is.** Blue Archive's 10-pull opens on a letter whose background and stripes are blue if no 3★ is present in the batch and purple if at least one is. It does not say which of the ten. Genshin's multi-wish sends a single star that splits into ten trails; a gold trail among them tells you a 5★ is in the batch before any individual card resolves.

**Why it works.** It front-loads the single most important bit — is there anything here at all — while preserving the second, more granular question of which one. One draw yields two staged resolutions of uncertainty instead of one, which is why 10-pulls feel structurally richer than ten singles.

**For RIPDEX.** Does not map today: `cardsPerPack` is 1 in `charizard-chase.ts` and in both generated packs, so there is no batch to describe. It maps immediately if RIPDEX ships a multi-rip, which is the obvious remedy for the 95%-Tier-1 problem because it converts 'one boring card' into 'a spread with a shape'. The honest batch tell would be 'this batch's best card is Tier N', stated before any card flips — true, settled, and recomputable. Structurally it is also the *safest* tell available, because an aggregate statement cannot be misread as a promise about the specific card currently on screen.

**Honest or manipulative.** Honest, and safer than a per-card tell. Blocked on a product decision (multi-card packs), not on a fairness question.


#### Understate-then-upgrade — FGO's silver card sparking gold, Genshin's purple→white→gold

**What it is.** FGO: a silver (3★-looking) card can spark and turn gold mid-flip, and becomes double-sided so the servant's class is visible on both faces as it turns. Genshin: the 5★ animation deliberately passes *through* the 4★ purple state, then whites out and resolves gold. The trajectory is strictly monotone upward — purple becomes gold; gold never becomes purple.

**Why it works.** The surprise is free, because nobody is ever disappointed by an upgrade. It also buys a second peak: the moment of promotion is its own beat, distinct from the reveal itself, so a single draw yields two spikes instead of one.

**For RIPDEX.** Usable, but the line here is fine and worth stating precisely. The honest version for RIPDEX is: the tell starts *neutral* — the default violet ground, no claim made — and promotes to the true tier at a defined moment. The card was never asserted to be Tier 1; the tell simply hadn't spoken yet. What is NOT usable is displaying a specific lower tier first and swapping — showing 'TIER 2' in the chip and then replacing it with 'TIER 4' — because that is a false statement about a settled fact even though it resolves pleasantly. Neutral→true is honest. False→true is a lie that happens to be nice, and on a product where the ledger is public it is a detectable one.

**Honest or manipulative.** Honest only in the neutral→true form. The FGO/Genshin implementations are borderline — they do briefly display a specific lower rarity — and RIPDEX should take the structure while staying on the neutral side of the line.


#### Different audio per rarity, committed at the top of the sequence (Arknights, HSR)

**What it is.** Arknights plays a different background track inside the recruitment bag depending on the operator's rarity, alongside a coloured light emitted from the bag before it opens. Honkai: Star Rail changes the 'hype' music before the doors open depending on 4★ vs 5★. In both, experienced players call the pull from the first bar, well before any visual resolves.

**Why it works.** Audio reaches the listener before an image is parsed, and it is the channel that carries magnitude most efficiently. It is also the most learnable tell: the pleasure of *recognising* the sting is a reward distinct from the pull itself, and it compounds across sessions in a way visual effects don't.

**For RIPDEX.** RIPDEX has no audio at all and zero dependencies, and this is the highest excitement-per-byte addition available because it touches neither the visual system nor the one-accent rule. A tier sting is buildable with bare WebAudio — an `AudioContext`, two or three `OscillatorNode`s and a `GainNode` envelope is roughly forty lines with no package. Autoplay policy is a non-issue here specifically because the rip *is* a user gesture, so the context can be resumed on the RIP PACK click. Must be mutable, and the mute state should persist. Scale it the same way as everything else: nothing at T1/T2, a short sting at T3, a longer one at T4, a sustained bed for grail.

**Honest or manipulative.** Honest — the sting is selected from the frozen tier, same as `choreographyFor`.


#### Pre-reveal takeover fired before the flip — RIPDEX's existing grail sequence

**What it is.** In `apps/web/src/rip-page.ts:953-957`, when `ch.fullTakeover` is true the page hides chrome, turns on `#grailFx` (a radial ground going #13122a → #0a0a14 → #050609, plus a pulsing bloom and halo), runs `sparks()` (74 rising motes, every sixth one `--gold`), and adds `.grail` to the card — which puts a gold rim on both `.thick` bevels and a gold glow on `.face.front`. All of that happens while the card is still face-down, then holds 2200ms.

**Why it works.** It is the canonical honest tell, executed well: the player learns the outcome's magnitude from the environment and the card's edge before seeing the card, so the flip becomes confirmation rather than information. It also escalates the *frame* rather than the object, which is the correct instinct (see the Blizzard finding).

**For RIPDEX.** Already built; the problem is that it exists at exactly one of five tiers, so 99.97% of rips see no pre-reveal escalation whatsoever. `choreographyFor` returns three durations and two booleans, and those two booleans have to cover four tiers of gradation — with the result that Tier 3 ($25-100) and Tier 4 ($100-500) get the *identical* flat radial dim. The refactor is small and lives in `tiers.ts`: return an ordinal intensity (0-4) alongside the existing fields, and let the page map it to continuous stops for ground darkness, chrome opacity, pedestal opacity/spread, rim colour, ember density and hold length. That is a config change plus CSS custom properties, not new choreography code.

**Honest or manipulative.** Honest. It is the best thing on the page and the model for everything else in this angle.


#### Publish the tell — the move no gacha game can make

**What it is.** Not a gacha mechanic; the gap where one should be. None of the games surveyed document their tells. The consequences are visible: FGO has a live community argument over whether rainbow sparks really guarantee SSR ('that's a myth' vs. 'rainbow is 100% SSR'), and 'Dokkan fake out summon animation' is a search term with compilation videos. Tell mappings survive as folklore, which means players cannot distinguish an honest floor signal from a fake-out except by accumulating anecdotes.

**Why it works.** A signal you know is binding is a signal you can afford to feel. Publishing does not deflate the tell — it is what lets the tell carry weight, because the alternative is a player who half-suspects the animation is lying and therefore discounts it.

**For RIPDEX.** `/packs` already renders the exact odds table from `oddsTable()`. A companion 'reveal choreography' table — per tier: the value band, the hold duration, what changes in the room — is fully derivable from `DEFAULT_TIER_CONFIG` plus `choreographyFor`, costs one table, and can be verified by anyone against the public ledger at `/live`, since every rip's tier is recomputable from `(serverSeed, clientSeed, nonce)`. This is the finding that makes gacha escalation *fit* this product rather than being borrowed from a genre it's trying to be better than: the tell becomes another auditable claim rather than a piece of theatre imported from a casino.

**Honest or manipulative.** This is the honesty mechanism itself. It is also the thing that makes taking the rest of these mechanics defensible.


#### The downgrade fake-out (Dokkan Battle) — the forbidden shape, and self-defeating here

**What it is.** The summon plays rainbow or otherwise high-rarity effects and then resolves to a lower rarity. The community calls these 'fake out summon animations' and there are compilation videos of them. The community also states the underlying truth plainly: the animation is a function of the result, not the other way around — which means a fake-out is a deliberate decision to render a value other than the result's.

**Why it works.** It manufactures a near-miss. The gambling literature is unambiguous about the effect: near-misses recruit win-related brain circuitry including the ventral striatum and rostral anterior cingulate, invigorate further play, and operate by fostering an illusion of control; slot manufacturers incorporate them specifically to extend time-on-device.

**For RIPDEX.** Forbidden by the brief, and independently self-defeating here in a way it isn't for Dokkan. Every RIPDEX pull is recomputable from `(serverSeed, clientSeed, nonce)` against a published price snapshot, and the full ledger is public at `/live`. Any user could dump the ledger, replay the reveal, and demonstrate that the tell contradicted the draw. The fairness pitch and the fake-out cannot coexist in the same product — not as an ethical stance but as a technical fact.

**Honest or manipulative.** Manipulative, and uniquely damaging here: it is the one mechanic that would falsify the product's central claim rather than merely sitting uneasily beside it.


#### The 'almost' beat — and the one-line trap already sitting in the roll step

**What it is.** The reel variant of the same idea: decelerating past the jackpot and settling one slot short, or parading candidate outcomes and visibly discarding the good one. RIPDEX's roll step already contains the *honest* version of this pattern — `.deck i` deals seven abstract silhouettes (a rounded rect with a `::before` art block and a `::after` name bar) toward the camera past a frosted `.plate`, so the wait reads as a decision being made without ever naming a candidate.

**Why it works.** Same near-miss mechanism; the abstract version gets the pacing benefit with none of the claim.

**For RIPDEX.** Flagging this because the codebase is roughly two attributes from doing the forbidden thing by accident. If anyone ever swaps those seven abstract `.deck i` silhouettes for real card art from `pack.pool` — which is an obvious-looking 'make the roll more exciting' change and would look great — the roll step silently becomes a near-miss generator: the $897 Charizard will visibly deal past and get discarded on rips where the draw never had it, over and over. The silhouettes must stay abstract, and that constraint deserves a comment in the CSS next to `@keyframes deal` saying why, because the reason is not visible from the code.

**Honest or manipulative.** Manipulative if implemented with real pool art. The current abstract implementation is honest and should be defended explicitly rather than left to be 'improved'.


#### Pity and soft-pity as cross-session escalation

**What it is.** Universal in the genre. Arknights: base 2% for 6★, and after 50 pulls without one the rate rises 2 points per pull — 4% at 51, 6% at 52, reaching 100% at pull 99; plus a guaranteed 5★-or-better within the first 10 pulls of a banner, a 150-pull limited guarantee, and a 300-pull spark. Genshin and HSR run soft pity plus a 50/50. FGO runs a spark. The escalation is across sessions: a visibly climbing counter makes the next pull feel worth more than the last.

**Why it works.** It is the strongest retention mechanic in the genre precisely because it converts a memoryless process into one with momentum, so a losing streak becomes evidence of accumulating value rather than of bad luck.

**For RIPDEX.** Incompatible with RIPDEX as built, and I'd argue with the pitch. `openPack` is a pure function of `(packSnapshot, priceSnapshot, serverSeed, clientSeed, nonce)` and holds no ledger handle — the same structural refusal that keeps prices from being set after the draw. Pity would require the draw to depend on the wallet's history, which means the published odds table stops describing any individual pull and 'independently recomputable' becomes 'recomputable if you also replay my history'. Worth stating explicitly so nobody proposes it later as the obvious gacha borrow.

**Honest or manipulative.** Not inherently dishonest — Arknights publishes its exact escalation curve. But its purpose is to induce the next spend through accumulated sunk position rather than through the cards being worth having, which the brief rules out. Excluded on product grounds, not fairness grounds; the distinction matters if the owner ever asks why.


#### Banner timers and rate-up urgency — plus the truthful version RIPDEX already owns

**What it is.** The genre's core urgency device: a two-week banner with a rate-up and a visible countdown, after which the featured character leaves. Every game surveyed runs it.

**Why it works.** Deadline pressure, straightforwardly.

**For RIPDEX.** Excluded by the brief, but there is a wrinkle worth surfacing because it's a real asset being left on the floor. RIPDEX's scarcity claims don't have to be invented — they're already true. Prices are real and move; the pool is pinned to a *frozen* snapshot with a stated `ttlMs` of 24 hours; `base-set-rip` currently has an EV of $3.01 and `151-rip` $1.13 computed from that snapshot. 'This pack's expected value was recomputed from the 2026-09-09 price snapshot' is a dated, checkable, genuinely time-bounded fact, and the snapshot genuinely expires. Surfacing that is honest and does some of the same work. A countdown invented to create pressure is not.

**Honest or manipulative.** Fake countdowns are manipulative. The frozen-snapshot recency version is truthful and is arguably underused — it's the fairness machinery producing urgency as a byproduct rather than urgency being bolted on.


#### The riser — escalate the medium, never the claim

**What it is.** The EDM build: a rising pitch or filter sweep, increasing percussive density, a low-pass gradually opening, all peaking and then dissipating into the drop. The defining property is that a riser makes no assertion about what the drop contains. It only says 'something is arriving, now'. Tension accumulates purely from the trajectory and releases on resolution.

**Why it works.** Tension-and-release produces a physical response with zero semantic content, which means it cannot lie. The energy comes from the shape of the approach, not from a prediction about the destination.

**For RIPDEX.** This is the answer to the 95%-Tier-1 problem and the most important craft finding here. A riser is honest at *every* tier because it predicts nothing — so it can run on every single rip, including the 92% that end in a $0.25 common, without ever misrepresenting anything. RIPDEX already has riser components sitting idle: `.plate .scan` sweeps a violet line down the plate on a 2.2s loop and `.plate::after` shimmers at 1.6s, but both run at fixed rate and fixed amplitude and neither accelerates or resolves. Driving `animation-duration` from `suspenseMs` and amplitude from a `--intensity` custom property gives one riser that plays five ways with no branching logic — which also keeps it inside the existing 'motion is opt-in via data attributes' pattern rather than adding a JS animation loop.

**Honest or manipulative.** Honest by construction. A content-free escalation is the only kind that can safely run on the common case, which is exactly where RIPDEX needs escalation most.


#### Escalate the frame, not the object — and Blizzard's correction

**What it is.** Blizzard's Michael Heiberg on Overwatch loot boxes: 'When you start opening a loot box, we want to build anticipation. We do this in a lot of ways — animations, camera work, spinning plates, and sounds.' The correction is the more useful half: they pulled back from their original colourful light show because it *killed* players' sense of anticipation.

**Why it works.** More light everywhere flattens the image and destroys the sense that one thing is special. Contrast reads as importance; brightness does not. Escalation is the environment closing in on the object, not effects piling onto it.

**For RIPDEX.** Direct, and it argues against the obvious instinct. `#grailFx` already does the right thing — it *darkens the room* rather than lighting it up, and drives chrome to zero opacity so the card is the only lit object. The intensity ladder should be built from that same subtractive logic: how dark the ground goes, how far chrome fades, how wide the pedestal spreads, how dense the embers get. Two implementation constraints. First, `#grailFx` is `position:fixed` at `z-index:1` and structurally separate from `.holder`, which is why it can dim the room without touching the card's 3D — any new dim layer must stay out of the `.scene` → `.holder` → `.card` chain, because an `opacity < 1` or a `filter` anywhere in that chain forces `transform-style: flat` and collapses the card's `.thick` bevels. Second, `.step > div:not(.embers)` is already load-bearing for the ember field's positioning; new fixed layers should follow the `#grailFx` pattern of living outside `#stage` entirely.

**Honest or manipulative.** Honest. Also a warning against the specific failure mode of 'make it more exciting' — piling on light is the change most likely to be proposed and it is the one Blizzard shipped, measured, and reverted.


#### Order the sequence by ceiling so the last beat is the only one that can be big (TCG Pocket)

**What it is.** Pokémon TCG Pocket guarantees cards 1-3 of every five-card pack are single-diamond commons; every rare lives in slot 4 or 5, and slot 5 carries the better odds for the highest rarities. It preserves the physical pack's rare-at-the-back layout deliberately. Hearthstone and physical packs work the same way by convention.

**Why it works.** The sequence is ordered by *ceiling*, so every card you turn raises the maximum possible remaining outcome instead of lowering it. Compare random order, where the best card can land first and the remaining flips are pure decay — the same five cards, the same expected value, a completely different curve.

**For RIPDEX.** Inapplicable today and that is the finding: with `cardsPerPack: 1` there is no ordering to exploit, so ~95% of rips are structurally a single anticlimactic beat and no amount of animation will fix that. This is the strongest argument in the whole angle for multi-card packs. A five-card pack revealed in ascending order of frozen value is honest — the values were locked before the draw, and sorting settled facts for presentation asserts nothing about probability — gives a genuine escalation curve, and lets the common cards do useful work as rising action instead of being the entire show. Note the two adjacent moves that would NOT be honest: implying slots carry different odds when the pool is flat, or advertising a 'guaranteed rare slot' that isn't structurally guaranteed in `drawPack`. This is a product change rather than an animation change, and probably the highest-leverage item here.

**Honest or manipulative.** Honest. Sorting a settled result for presentation is not a claim about likelihood — and unlike a fake-out, it survives ledger replay: the pulled set is identical, only the order of display differs.


#### The common outcome needs its own payoff, not a shrunken version of the big one

**What it is.** The design rule, stated most clearly in Alexandre Macmillan's analysis of gacha value distribution: the lowest-value outcome is by definition always below the mean, so it must be independently validated as worth what was paid — 'if the worst outcome feels like a ripoff, your gacha won't work, no matter how generous the expected value.' The genre's standard answers are duplicate conversion, currency, and progress, all of which give the common pull a second, non-random reason to exist.

**Why it works.** The majority experience *is* the product. A Tier 1 outcome dressed as a failed Tier 4 attempt trains the player that they usually lose, which is both demoralising and, over enough rips, simply an accurate description of the presentation rather than the outcome.

**For RIPDEX.** Sharp here, and the fix is already in the repo and not wired into the reveal at all. `collection.ts` exposes `setCompletion()` and `duplicateSummary()`; `achievements.ts` runs 11 achievements over the ledger including FULL_SET, KANTO_COLLECTOR, HOLO_HOARDER and FIRST_EDITION. A Tier 1 reveal that reads 'NEW — Base Set 24/102' or 'completes your holo row' or 'HOLO HOARDER unlocked' is a real, earned, non-fabricated payoff for the 92-98% case, and it is the one payoff that *improves* the more someone rips. That is precisely the engine of repeat play the brief asks for — the cards being genuinely worth having — rather than psychological pressure. It also needs no new colour: 'new' can be violet, since it's a state, not a value.

**Honest or manipulative.** Honest, and it's the constructive half of the near-miss prohibition. Ruling out fake tension obliges you to find real payoff for the common case, and here it already exists in the ledger.


#### Give the escalation a skip, and never let the skip spoil the tell

**What it is.** Genshin, HSR and FGO all let players skip to a results screen. The community discourse is specific about *when*: players discuss skipping 10-pulls 'before seeing the wishes' colour' precisely so the reveal isn't spoiled. The skip exists because a six-second ceremony played ninety times is torture.

**Why it works.** Ceremony is only precious if it's escapable. Forced ceremony converts anticipation into friction the moment a player is doing volume, and the resentment attaches to the ceremony itself.

**For RIPDEX.** RIPDEX's `againBtn` calls `reset()` and re-runs the entire sequence including the drag-to-tear gesture, every time. On a pack where 92% of outcomes are sub-$5, that is a lot of manual ceremony for a $0.25 card — and unlike a gacha animation, a *drag* cannot be skipped by not watching it. An `auto` parameter has appeared on `present()` in the working copy, which suggests this is already being addressed; the design rule the Genshin discourse supplies is the part worth carrying over: a skip must jump *past* the tell to the result, never render the tell faster, because a compressed tell is a spoiled tell.

**Honest or manipulative.** Ergonomics rather than ethics — but it protects all the honest escalation work above from being resented into the ground by repeat users.


#### One channel, one question — and which channels RIPDEX actually has left

**What it is.** Across every game surveyed each signal channel answers exactly one question. FGO: ring colour = rarity floor. Arknights: bag light = rarity, bag audio = rarity (deliberately redundant, same question). HSR: ticket colour = rarity, door colour = rarity. Hearthstone: glow = rarity, voice line = rarity. Nobody uses colour for rarity and value and newness simultaneously.

**Why it works.** A channel carrying two meanings carries neither. Redundancy across channels for one question is good — it makes the tell robust to a muted device or a glance away — but overloading one channel across questions destroys legibility.

**For RIPDEX.** This is the constraint-fit finding, and it decides whether any of the above is buildable here. RIPDEX's palette is effectively full before it starts: `--accent` violet is the single accent and belongs to every control, `--gold` is grail *value* only and is explicitly never decorative, `--em` green means 'a pricing provider confirmed this'. So the tell cannot be a five-colour rarity ramp — there are no colours left, and inventing four would break the one rule that makes the site read as Linear rather than as a casino. The channels that ARE unclaimed: **darkness** (how far the room is extinguished), **time** (hold length, already in `choreographyFor`), **density** (embers and sparks per second), **elevation** (pedestal spread, card lift, `.grounded::after` contact-shadow blur), and **sound**. All five are quantitative, all five start at zero, and all five stack into a single ordinal intensity — which means one `--intensity` custom property can drive the entire ladder. That is a better fit for the luxury-collectible register than a rainbow ramp would ever have been: the escalation reads as a room going dark and quiet around one lit object, which is how an auction house lights a lot, not how a slot machine celebrates.

**Honest or manipulative.** Neither — it's the feasibility constraint. But it happens to point at the same answer as the honesty constraint does, which is the useful coincidence in this whole angle: the channels that scale continuously from a genuine zero are both the ones RIPDEX has available and the ones that don't punish the 95% case.


### Sources

- https://fategrandorder.fandom.com/wiki/Summoning — FGO summon ring: blue ring, gold spark = guaranteed 4★ or 5★, rainbow spark = guaranteed 5★; the silver-card-sparks-gold upgrade and double-sided card
- https://www.gamepress.gg/grandorder/q-a/rainbow-spark-effect — 'Rainbow sparks are the only animations which are 100% indications of SSRs, while gold sparks can result in both SRs and SSRs'; also the community dispute over whether rainbow truly guarantees
- https://gamefaqs.gamespot.com/boards/180151-fate-grand-order/76884415 — player-level discussion of which FGO summon animations guarantee gold servants
- https://gamewith.net/arknights/article/show/14989 — Arknights headhunting: light emitted from the bag before opening as a rarity indicator, different background audio per rarity; rates 6★ 2% / 5★ 8% / 4★ 50% / 3★ 40%
- https://gachawiki.com/arknights/wiki/headhunting — Arknights pity: base 2%, +2 points per pull after 50, 100% at pull 99; 5★-or-better guaranteed in first 10; 150-pull limited guarantee, 300-pull spark
- https://www.ginx.tv/en/4-star-5-star-warp-animation-differences — Honkai: Star Rail 4★ vs 5★ warp differences (rainbow ticket as an early tell before the golden door; hype music differs by rarity)
- https://honkai-star-rail.fandom.com/f/p/4400000000000049073 — HSR community discussion of warp animation tells and how easily they are missed
- https://genshin-impact.fandom.com/wiki/Wish — Genshin wish system and animation
- https://genshin-impact.fandom.com/f/p/4400000000000312675 — 'Do summoning fakeouts exist in this game?': the Genshin 5★ animation passes through the purple 4★ state before whitening and resolving gold; the transition is monotone upward, never gold→purple
- https://www.hoyolab.com/article/187166 — Genshin players discussing skipping 10-pulls 'before seeing the wishes' colour' to avoid spoiling the reveal
- https://bluearchive.fandom.com/wiki/Gacha — Blue Archive batch tell: blue background/stripes = no 3★ in the pull, purple = a 3★ is present
- https://dbz-dokkanbattle.fandom.com/wiki/Summon_Screens — Dokkan Battle summon screens; 'the summon animations don't affect the results in any way — it's the result of the summon that affects the animation'
- https://www.youtube.com/watch?v=i2erUw9skAQ — 'Back to Back Fake Out Summon Animations!' — documentation that Dokkan's fake-outs (high-rarity effects resolving to lower rarity) are a recognised category
- https://hearthstone.wiki.gg/wiki/Card_pack — Hearthstone pack open: face-down cards above common quality glow when hovered; commons do not glow at all; rares get an extra reveal animation and a voice line ('rare'/'epic'/'legendary')
- https://www.wargamer.com/pokemon-tcg-pocket/rarity — Pokémon TCG Pocket: cards 1-3 are guaranteed single-diamond commons, all rares appear in slots 4 and 5, slot 5 carries the better odds
- https://game8.co/games/Pokemon-TCG-Pocket/archives/477126 — TCG Pocket rare packs and pull rates; god pack odds
- https://www.gamedeveloper.com/business/what-makes-a-great-in-game-loot-box-devs-weigh-in — Blizzard's Michael Heiberg on building anticipation via 'animations, camera work, spinning plates, and sounds', and pulling back from the colourful light show because it killed anticipation; 343's Christopher Bloom: 'You can't do it all the time or you lose the specialness'
- https://alexandremacmillan.com/2025/10/13/every-gacha-pull-gives-out-the-same-value-players-just-dont-see-it/ — identical EV across wildly different distributions; the worst outcome is always below the mean and must be independently validated; 'if the worst outcome feels like a ripoff, your gacha won't work'
- https://www.sciencedirect.com/science/article/pii/S0896627309000373 — Clark et al., 'Gambling Near-Misses Enhance Motivation to Gamble and Recruit Win-Related Brain Circuitry' (ventral striatum, rostral ACC)
- https://link.springer.com/article/10.1007/s10899-019-09891-8 — 'The Near-Miss Effect in Slot Machines: A Review and Experimental Analysis Over Half a Century Later'
- https://pmc.ncbi.nlm.nih.gov/articles/PMC10867214/ — near-miss effect and the illusion of control; manufacturers incorporate near-misses to extend length of play
- https://theghostproduction.com/producer-resources/how-to-build-drops/ and https://schulz.audio/blog/the-art-of-creating-tension-and-release-in-music-production/ — riser/build/drop craft: tension accumulates from trajectory (rising pitch, opening filter, increasing percussive density) and releases on resolution, with no semantic claim about the payload
- Repo, read directly: /Users/holdengoodwin/code/ripdex/packages/pokemon-core/src/tiers.ts (choreographyFor: suspenseMs 220/500/900/1400/2200; dimBackground and fullTakeover as the only two gradation bits)
- Repo: /Users/holdengoodwin/code/ripdex/apps/web/src/rip-page.ts:942-975 (present() fires the grail takeover BEFORE the flip; the click handler is attached only after `await wait(ch.suspenseMs)`, so a grail's card is unresponsive for 2.2s while showing TAP TO REVEAL)
- Repo: /Users/holdengoodwin/code/ripdex/apps/web/packs/generated/*.json + packages/pokemon-core/data/catalog/prices.json — computed tier distribution: base-set-rip 92.24% T1 / 6.20% T2 / 1.34% T3 / 0.191% T4 / 0.0269% Grail, EV $3.01; 151-rip 98.66% T1 / 0.81% T2 / 0.40% T3 / 0.121% T4 / 0% Grail (top pull $366.05), EV $1.13; cardsPerPack is 1 in all three packs


---

## Angle 4 — Audit of what RIPDEX already has

### Summary

Audit of the existing RIPDEX rip experience, read directly from code at commit f9e7a22. Covers the beat-by-beat timeline with real timings, where the dead air is, whether the per-tier choreography actually differentiates, an inventory of real data the client already holds but never dramatizes, and the single-vs-multi-card story. IMPORTANT CONTEXT: while I was reading, a parallel session began writing a case-opening reel into apps/web/server.ts and apps/web/src/rip-page.ts (uncommitted, +219 lines, currently half-wired — spin() exists but nothing calls it and present() does not yet accept the argument spin() passes it). Everything below describes the committed baseline unless a finding says otherwise.


### Findings (14)


#### The full beat sequence, with every timing pulled from the code

**What it is.** T=0 is the click on RIP PACK (rip-page.ts:670). Beat 0 — select screen: 3D pack on [data-depth] pointer parallax, floaty 8.4s bob, three specs (CONTAINS 1 CARD / PRICE 250,000 $RIP / TOP PULL $897). Beat 1 — T+0: show('s-roll'); .step crossfade is 450ms opacity / 600ms transform (rip-page.ts:147-149); label reads 'PACK LOCKED'. Beat 2 — T+750: hardcoded await wait(750), then the label flips to 'ROLLING CARD…' and ONLY THEN does fetch('/api/rip') fire. Beat 3 — fetch returns (JsonOpeningLedger.record is pure in-memory Map writes, so server time is negligible). Beat 4 — full-resolution art preload, awaited with no timeout and no progress UI; I measured the hires PNGs at 541–845 KB (base1/4_hires.png = 844,907 bytes). Beat 5 — await wait(420). Beat 6 — startTear(); show('s-tear'), 450ms crossfade. USER GATE #1: drag right across 62% of card width, p = (clientX-startX)/(w*0.62), unbounded in time. Beat 7 — finishTear(): strip flies out over 550ms, code waits 430ms, calls present(). Beat 8 — present(): show('s-card') 450ms crossfade, FX applied immediately, then await wait(ch.suspenseMs). Beat 9 — USER GATE #2: click the card; the listener is attached only AFTER the suspense wait. Beat 10 — flip over ch.flipMs; .foil fades in over 800ms; .pedestal over 900ms. Beat 11 — await wait(flipMs + metadataDelayMs), then fill(): meta fades 700ms, then setTimeout(260) and the button row fades 600ms. Choreography constants (tiers.ts:73-86) suspense/flip/metaDelay: Tier1 220/450/300, Tier2 500/600/450, Tier3 900/750/600, Tier4 1400/1000/800, Grail 2200/1400/1100. Scripted total excluding both user gates: ~2.83s for Tier 1, ~6.56s for a Grail, plus network and image download.

**Why it works.** The structure is sound and the ordering is the honest one: the outcome is drawn, priced and written to the ledger before a single frame of reveal runs, and the file's header comment says exactly that. The two user gates (tear, tap) are good — they convert waiting into acting, which is why physical pack-opening feels different from a loading screen. The tear itself is well-built: a real perforated clip-path strip, drag-proportional rotation and opacity, and a flick-off on completion.

**For RIPDEX.** This is the baseline any proposal has to improve on. The bones are right; the problem is that roughly 1.2s of the 2.8s Tier-1 path is fixed padding around a fetch that takes milliseconds, and the one deliberate tension beat (suspenseMs) is the emptiest frame in the whole sequence.

**Honest or manipulative.** Honest in structure. One smell: the roller's own comment claims the dealt silhouettes read as 'a decision being made rather than a progress bar being filled' — but for the first 750ms no request has even been sent, and after the fetch resolves the decision is already made and recorded. It is a loading animation costumed as deliberation. Not a near-miss and not detectable as a lie, but it is the closest thing in the current build to dressing up nothing as something.


#### Dead air #1 — the 750ms 'PACK LOCKED' hold happens before any work is requested

**What it is.** rip-page.ts: show('s-roll'); set label to PACK LOCKED; await wait(750); set label to ROLLING CARD…; THEN fetch. The 750ms is sequential padding, not a cover for latency. During it the deck deals 7 generic silhouettes (2.6s loop, -0.371s stagger), a 2.2s scan line sweeps, and a 1.05s indeterminate bar slides.

**Why it works.** It doesn't. There is zero information gain and zero tension: nothing on screen refers to this pack, this user, or this rip. The same frames would play for any pack.

**For RIPDEX.** The fix is free and improves both feel and latency: fire the fetch immediately, then spend that window on something true. The response already contains the commitment (serverSeedHash), the client seed and the nonce — 'SEED 9f3c…a12 · NONCE 47' typing in during the lock is real, specific, and is exactly the product's differentiator.

**Honest or manipulative.** Currently neither honest nor dishonest — it is filler. Replacing filler with the actual commitment data is strictly more honest than what is there now, which is the hardcoded string 'SEED COMMITTED · OUTCOME SETTLED SERVER-SIDE' sitting under a live seed hash the page is holding and not showing.


#### Dead air #2 — the unbounded, unlabelled hires-image preload under a stale label

**What it is.** await new Promise(done => { const im = new Image(); im.onload = im.onerror = done; im.src = result.imageLarge; }) — no timeout, no progress, no UI change. The label still reads 'ROLLING CARD…' for the whole duration even though the roll finished and the rip is already in the ledger. Measured payloads: 541,821 B (sv3pt5/199_hires.png), 842,708 B, 844,907 B. On this desktop connection that is 70–130ms; on a 1.5 Mbps mobile link it is 3–4.5 seconds.

**Why it works.** The preload decision is correct — stalling the flip on a download would be far worse. The failure is that the wait is invisible and mislabelled, so on mobile the most common experience is several seconds of a looping generic animation asserting something that has already happened.

**For RIPDEX.** Two honest fixes: (a) start the preload against imageSmall/blurred placeholder and stream up, or (b) put the wait to work — this is precisely the window in which to show the pool, the odds, or the commitment, all of which are already available. The in-flight reel work happens to be a good use of this window, but note it currently runs AFTER the preload, not during it.

**Honest or manipulative.** Mildly dishonest as written: 'ROLLING CARD…' persists after the card is rolled. Nobody is harmed, but on a product whose pitch is 'the outcome was settled before the animation started', a label that says the opposite is a self-inflicted wound.


#### Dead air #3 — suspenseMs is the one intentional tension beat and nothing happens during it

**What it is.** present() applies the FX and then awaits ch.suspenseMs: 220ms (T1) to 2200ms (Grail). For Tier 1 and Tier 2 nothing is applied at all, and for Tier 1 the 220ms is fully swallowed by the 450ms step crossfade. For Tier 3/4, fx.style.background gets a static radial vignette with a 1s opacity transition and then holds. The card back (.face.back) has no animation of any kind — no float, no glow ramp, no shake. Only the Grail case has ambient motion (bloomPulse 6.5s, haloPulse 5.2s, 74 rising sparks). Nothing in any tier ESCALATES across the hold.

**Why it works.** A hold only builds tension if something is accumulating. Here the hold is a freeze-frame. The choreography interface literally names the field 'suspenseMs' and then spends it on stillness.

**For RIPDEX.** Highest-leverage single change in the file: this beat is already tier-scaled and already sized correctly (220ms vs 2200ms is a 10x range). It needs a ramp — anything monotonic that grows over exactly suspenseMs. Every ingredient for an honest ramp is already on the client: probability, tier, referenceValue, and the pack's own composition.

**Honest or manipulative.** Filling this beat is honest by construction as long as the ramp is a function of the real outcome and starts from what actually happened. It becomes manipulative only if the ramp implies the outcome is still resolving, which it is not.


#### Dead air #4 — the two arbitrary pads and the RIP ANOTHER flash

**What it is.** await wait(420) after the preload, before the tear screen. await wait(430) after the strip flick (which itself runs 550ms, so present() is called while the strip is still in flight — fine). And reset() → show('s-select') → setTimeout(rip, 420), so 'RIP ANOTHER' flashes the select screen for 420ms before jumping to the roll.

**Why it works.** The 430ms hand-off is defensible overlap. The 420ms pads are not — they are round numbers with nothing behind them, and the RIP ANOTHER one shows the user a screen they are not meant to look at.

**For RIPDEX.** Cheap cleanup. The repeat-rip path is the one users hit most; it should go tear → tear, not tear → select flash → roll.

**Honest or manipulative.** Neutral. Pure polish.


#### Tier choreography: five tiers, three visual states, and 92% of pulls land in the emptiest one

**What it is.** choreographyFor() varies four things: suspenseMs, flipMs, metadataDelayMs, and two booleans (dimBackground, fullTakeover). What that produces on screen: Tier 1 and Tier 2 are VISUALLY IDENTICAL — same background, same card, same everything; they differ only by 280ms of suspense, 150ms of flip and 150ms of metadata delay. Tier 3 and Tier 4 are visually identical to each other except one text colour on the value (--em green vs #e0b0ff mauve) — both get the same static vignette. Only Grail is a genuinely different event: #chrome hidden, gold radial takeover, bloom + halo + 74 sparks, .card.grail gold rim and gold thick edges (visible while still face-down), gold pedestal instead of violet, a GRAIL PULL tag on flip, and a gold value with a 34px glow. Measured pool reality from the committed data: BASE SET RIP is 92.244% Tier 1 / 6.202% T2 / 1.336% T3 / 0.191% T4 / 0.027% Grail. 151 RIP is 98.664% Tier 1 and contains NO grail outcome at all (0%). CHARIZARD CHASE is 89% / 9% / 1.7% / 0.26% / 0.04%.

**Why it works.** The Grail case is genuinely strong and the escalation is honest — the gold field comes up BEFORE the flip, so the takeover is a truthful tell about a settled outcome rather than a fake tease. That is exactly the right instinct.

**For RIPDEX.** But the Grail is a 1-in-3,717 event. The experience users actually have, 9 times out of 10, is the 220/450/300 path with no FX, no differentiation, and no acknowledgement that a $0.25 Ivysaur and a $4.90 card are different pulls. There is no gradient inside Tier 1, and the T1/T2 and T3/T4 boundaries are invisible. A $4.99 and a $5.01 pull cross a tier line and get nothing distinguishable. If a proposal only makes the Grail better it will improve 0.03% of sessions.

**Honest or manipulative.** Honest today. The risk in fixing it is dressing up common pulls to feel rarer than they are — the answer is to differentiate on things that are actually true and actually vary (exact odds, rank in pool, value against the pack's EV), not on escalating spectacle for its own sake.


#### UNUSED DATA #1 — the entire provable-fairness payload reaches the client and is thrown away

**What it is.** RipEngine.rip() returns verification: { serverSeedHash, clientSeed, nonce, priceSnapshotId, packConfigSnapshotId } (rip-engine.ts:203-209). server.ts JSON-serializes the whole RipOutcome to the browser. rip-page.ts references result.verification exactly zero times. A grep for serverSeedHash/clientSeed/nonce across apps/web/src returns hits only in rip-engine.ts and one prose sentence on the homepage. The roll screen displays the hardcoded literal 'SEED COMMITTED · OUTCOME SETTLED SERVER-SIDE' while holding the actual hash in a variable. The openingId is shown as a truncated dead <span> ('RIP 55DAC0'), not a link — and there is no /verify route anywhere in server.ts to link it to.

**Why it works.** Nothing about this works — it is the product's single differentiating claim, delivered to the client, at the exact moment the user cares most, and discarded.

**For RIPDEX.** This is the highest-value unused data in the codebase. The commitment hash can be shown before the rip (it is fixed per engine boot, on RipEngine.serverSeedHash); the clientSeed is the user's own; the nonce is literally 'which rip of yours this is'; the two snapshot ids are the frozen artifacts that make the pull auditable. All five are already there. A 'PROVE IT' affordance on the reveal costs one route and no new computation.

**Honest or manipulative.** Maximally honest — this is the opposite of manufactured tension. It is dramatizing the one thing that is verifiably, cryptographically true.


#### UNUSED DATA #2 — raw probability is on the client but only the percentage string is shown

**What it is.** RipOutcome carries both probability (raw float) and oddsLabel (pre-formatted, e.g. '0.0269%'). fill() renders only a grey chip reading '0.0269% ODDS', styled identically to the variant chip and the openingId chip. Meanwhile render.ts:508 on the /packs page already computes Math.round(1 / r.probability) and prints a '1 IN' column. Real numbers: the Base Set grail is 1 in 3,717; 151 RIP's top card is 1 in 4,854; CHARIZARD CHASE weights sum to exactly 10,000 so its pool is literally odds-per-10,000 (the base1 Charizard at weight 4 is 1 in 2,500).

**Why it works.** '0.0269%' is a number people cannot feel. '1 in 3,717' is a number people feel instantly. The conversion already exists elsewhere in the codebase and is one division away on a value the client is already holding.

**For RIPDEX.** Free upgrade, and it scales the drama automatically and truthfully: a 1-in-6 common gets a small number, a 1-in-3,717 grail gets a huge one, and nobody had to invent anything. A count-up on the denominator would let the number itself be the escalation the suspense beat is missing.

**Honest or manipulative.** Completely honest. It is the published odds table, restated in the unit humans use.


#### UNUSED DATA #3 — the pack's own composition and the pull's rank within it

**What it is.** Never computed at reveal time, though every input is present. Per-pack facts derivable from pack.pool + the catalog index the server already holds: pool size (24 / 28 / 8 outcomes), rank of the pulled card by value, total weight, expected value per rip ($3.01 Base Set, $1.13 for 151, $3.02 Charizard Chase — render.ts already computes this as `ev` for /packs), and probability mass per tier. The server even computes `topValue` in server.ts for the /rip route, renders it once as 'TOP PULL $897' on the select screen, and never passes it into the reveal. So a $78.03 pull — which is the #4 card of 24 in BASE SET RIP — is presented as a bare dollar figure with no position, no ceiling, and no floor.

**Why it works.** Rank is the cheapest available drama and it is entirely factual. '#4 of 24' or 'top 0.2% of this pack by value' or 'beat the pack average by 26x' are all true statements about a settled outcome, and they differentiate pulls that the current tier bands flatten together.

**For RIPDEX.** This is the fix for the tier-flattening problem in the previous finding. Rank and EV-relative value vary continuously, so they give a $0.25 pull and a $4.90 pull different things to say without inventing a rarity that does not exist. Requires threading pool data into ripPage() — which is exactly what the in-flight reel work has started doing.

**Honest or manipulative.** Honest. The pool and its weights are already fully published on /packs; showing a pull in its real position discloses nothing new and misrepresents nothing.


#### UNUSED DATA #4 — price provenance, on a page that shows a dollar number with no source

**What it is.** The frozen PriceQuote carries basis, source ('pokemontcg.io'), sourceUrl (a real per-card prices.pokemontcg.io URL), sourceUpdatedAt (e.g. 2026-09-08T00:00:00.000Z) and observedOn, plus low/mid/high alongside market. RipEngine flattens all of that away and forwards only referenceValue + currency. The reveal prints '$78.03' under the caption 'REFERENCE VALUE' and stops. Separately: --em is documented in HANDOFF.md and design.ts:61 as meaning 'a pricing provider confirmed this' and nothing else — and it is spent as the Tier 3 value colour in both design.ts:294 and rip-page.ts:463, while Tier 4 uses #e0b0ff, a raw hex that exists nowhere in the token set.

**Why it works.** A number with a source is a claim; a number without one is a vibe. This product's whole posture is 'we froze this before we rolled' — and the reveal is the one screen that says nothing about where the price came from or when.

**For RIPDEX.** Threading quote.source / sourceUpdatedAt through RipOutcome is a few lines and lets --em finally do the job it was defined for: mark the value as provider-confirmed, at the exact moment the value appears. That also resolves the token drift, since --em would stop being a Tier 3 decoration.

**Honest or manipulative.** Honest, and it repairs an existing invariant violation rather than adding one.


#### UNUSED DATA #5 — the ledger, the collection and the achievements are all built and none of them touch the reveal

**What it is.** Already implemented and already used elsewhere, never consulted at reveal: ledger.countByVariant(variantId) — how many times this exact variant has ever been pulled (card-stats.ts renders this as RIPDEX DATA on card pages); aggregateWalletStats() — rips, totalReferenceValue, bestPull, firstRipAt (wallet-pages.ts renders it); evaluateAchievements() over 11 DEFAULT_ACHIEVEMENTS; setCompletion() and duplicateSummary() from collection.ts; prominenceFor(tier) in feed.ts, which already classifies a pull normal/notable/major. The reveal ends with three buttons — VIEW CARD, SHARE CARD, RIP ANOTHER — and no statement connecting the pull to the user's own history.

**Why it works.** 'You are the 3rd wallet ever to pull this', 'your best pull yet', 'that completes 12 of 102 Base Set holos', 'achievement unlocked' are all true, all already computable, and all of them make a $2 common meaningful in a way spectacle cannot. Personal-history framing is the standard answer to the 92%-are-commons problem, and it does not require the card to be valuable.

**For RIPDEX.** Needs the rip response to carry a few ledger reads — cheap, since JsonOpeningLedger is fully in-memory (record() is Map writes with a dirty flag). This is the most direct honest answer to 'the website is not exciting enough' for the common case.

**Honest or manipulative.** Honest, with one caveat: 'first ever pull' style claims must be computed from the ledger at rip time and must not be inflated by counting the 6,200 seeded rips as anything other than what they are. The seeded rips are real openPack runs, so the counts are legitimate.


#### cardsPerPack: the core fully supports N, the web layer silently drops everything after card 0

**What it is.** Every shipped pack is cardsPerPack: 1 — charizard-chase.ts:17, generate.ts:163, and both generated JSONs. The CORE handles N properly: drawPack() loops cardsPerPack times advancing the HMAC cursor (odds.ts:188), allowDuplicatesWithinPack filters the remaining pool, validatePackConfig rejects N > pool size when duplicates are off, openPack returns cards[], and fromOpenResult stores every card with a slot index whose comment reads 'draw order, which is also reveal order'. Tests already cover it (openings.test.ts uses cardsPerPack: 3 and asserts stored.cards.length === 3; feed.test.ts uses 2). The WEB layer does not: rip-engine.ts:172 is `const pulled = result.cards[0]` and RipOutcome is a flat single-card object. Cards 1..N-1 are written to the ledger — so they are credited to the collection, the feed and achievements — and never returned to the browser. choreographyFor() is called on card 0's tier, so a grail drawn into slot 2 would get a Tier 1 reveal. The DOM has exactly one #card, one #cardImg, one #holder, one #meta; present() and fill() read the singular `result`. There is no next-card affordance, no 'n of N' counter and no summary screen. Copy is hardcoded singular in three places: rip-page.ts:601 '${pack.cardsPerPack} CARD', render.ts:497 'card per pack', home.ts:485 '${p.cardsPerPack} card'.

**Why it works.** The single-card rip is the right MVP and the tear→flip intimacy genuinely depends on there being one object. But the gap is a live trap: shipping a 5-card pack today would give users five cards in their binder and show them one, with no error thrown anywhere.

**For RIPDEX.** Any multi-card proposal has to change rip-engine.ts (return the full cards[] array), decide the choreography rule for a mixed-tier pack (highest tier last is the obvious and honest answer, since slot order is already recorded and reveal order is already documented as draw order), and add a summary beat. Worth saying plainly: a multi-card pack makes the tear better (one tear, several cards) but makes the flip weaker (the single-object intimacy is the best thing the reveal currently has).

**Honest or manipulative.** The reordering question is the one to watch. Revealing a pack's cards worst-to-best is a presentation choice over an already-settled, already-recorded set — defensible, and standard. But the ledger records slot order as draw order, so if the UI reorders, it must not claim the reordered sequence IS the draw order.


#### Craft bugs found in the reveal that undercut the payoff

**What it is.** (1) Taps are dropped during suspense: present() sets flipHint.style.display='' (showing 'TAP TO REVEAL') BEFORE await wait(ch.suspenseMs), and only attaches the click listener after it — so on a Grail the prompt sits on screen unresponsive for 2200ms. (2) The interactive tilt is damped by the flip: card.style.transitionDuration = ch.flipMs + 'ms' applies to .card's transform, and the holder's pointermove writes --tilt into that same transform — so after a Grail flip, every mouse move lags 1400ms. The 'hold it and turn it in the light' moment, which is the single most tactile thing in the product, is mush. (3) No audio anywhere in the committed tree: grep for audio/mp3/WebAudio/vibrate across apps/web/src and packages/pokemon-core/src returns nothing, and no navigator.vibrate on the tear. (4) Nothing on the site links to /rip/:packId — both 'RIP A PACK' CTAs (home.ts:392) and every pack card (home.ts:480) point at /packs, and packsPage has no rip button. The entire rip experience is reachable only by typing the URL. (5) Token drift, already noted: --em spent on Tier 3, #e0b0ff off-palette for Tier 4.

**Why it works.** Each of these is small and each is load-bearing. (2) in particular: the foil shaders in this file are genuinely good — seven per-rarity treatments driven by real pointer angle — and the transitionDuration assignment throttles the very interaction they exist for.

**For RIPDEX.** All five are contained fixes. (2) is the cheapest big win: move the tilt onto a separate transform layer or reset transitionDuration after the flip settles. (4) should be checked with the owner — it may just be an unfinished wire-up, but it means nobody clicking through the site ever reaches the thing the site is about.

**Honest or manipulative.** All neutral craft issues. (5) is a real invariant violation against HANDOFF.md §4 and should be called out as such rather than inherited.


#### In-flight work by a parallel session — a case-opening reel, currently half-wired

**What it is.** Uncommitted in the working tree while I was reading: server.ts now builds a ReelEntry[] from the pack's real pool (variantId, name, imageSmall art, tier, referenceValue, share = weight/totalWeight) and passes it as a 4th argument to ripPage(). rip-page.ts gained ~198 lines: an #s-reel step, 64 tiles with the winner fixed at index 56, STRIDE 144px, a 5.8s cubic-bezier(.08,.72,.10,1) deceleration, filler sampled by real pool weight via pickWeighted(), a per-tile marker tick driven by DOMMatrixReadOnly on the live computed transform, and a dependency-free WebAudio square-wave blip (1850 Hz, 45ms) created inside the user gesture chain. Its comment explicitly states no near-miss padding. As of my last read it is NOT wired: nothing calls spin(), rip() still goes straight to startTear(), and spin() calls present(false)/present(true) while present() still takes no parameter. There is also a small jitter of ±34px on the landing offset so the winner does not stop dead-centre every time.

**Why it works.** Populating the reel from the real pool at real weights is the right call and is the thing that keeps a reel honest — the strip is a view of what can actually drop, at the frequency it actually drops. The ±34px jitter is cosmetic and does not touch the outcome.

**For RIPDEX.** The parent agent should know this exists before recommending a reel, and should know the reel is landing in the same window I flagged as dead air (post-fetch, pre-tear) — which is the right place for it. Two things to check when it is finished: it currently runs after the hires preload rather than during it (so it does not actually cover the download), and it introduces the first audio in the codebase, which the rest of the reveal still lacks.

**Honest or manipulative.** Honest as designed — the winner is the card the server already drew, filler is weight-accurate, and nothing is staged to almost-land. The one thing to keep watching is the landing offset: jitter within the winning tile is fine, but any change that lets the strip visibly overshoot past a better card and settle back would be a manufactured near-miss and must not ship.


### Sources

- /Users/holdengoodwin/code/ripdex/apps/web/src/rip-page.ts
- /Users/holdengoodwin/code/ripdex/packages/pokemon-core/src/tiers.ts
- /Users/holdengoodwin/code/ripdex/apps/web/src/design.ts
- /Users/holdengoodwin/code/ripdex/apps/web/src/rip-engine.ts
- /Users/holdengoodwin/code/ripdex/packages/pokemon-core/src/snapshot.ts
- /Users/holdengoodwin/code/ripdex/packages/pokemon-core/src/odds.ts
- /Users/holdengoodwin/code/ripdex/packages/pokemon-core/src/openings.ts
- /Users/holdengoodwin/code/ripdex/packages/pokemon-core/src/query.ts
- /Users/holdengoodwin/code/ripdex/packages/pokemon-core/src/feed.ts
- /Users/holdengoodwin/code/ripdex/packages/pokemon-core/src/variant.ts
- /Users/holdengoodwin/code/ripdex/apps/web/server.ts
- /Users/holdengoodwin/code/ripdex/apps/web/src/render.ts
- /Users/holdengoodwin/code/ripdex/apps/web/src/home.ts
- /Users/holdengoodwin/code/ripdex/apps/web/src/card-stats.ts
- /Users/holdengoodwin/code/ripdex/apps/web/packs/charizard-chase.ts
- /Users/holdengoodwin/code/ripdex/apps/web/packs/generated/base-set-rip.json
- /Users/holdengoodwin/code/ripdex/apps/web/packs/generated/151-rip.json
- /Users/holdengoodwin/code/ripdex/apps/web/packs/index.ts
- /Users/holdengoodwin/code/ripdex/packages/pokemon-core/data/catalog/prices.json
- /Users/holdengoodwin/code/ripdex/HANDOFF.md


---

## The phases that did not run

Synthesis and three critics (fairness, feasibility, completeness) never executed —
the run died on a session limit with 4 of 9 agents complete. Workflow resume is
**session-local**, so the original run cannot be resumed from a different machine or
a later session; the research above is the durable artifact.

If you re-run the synthesis, note that the original script carried a hard
"no manufactured near-misses" constraint that the owner has since **explicitly
overridden** — `padNearMiss()` in `rip-page.ts` is deliberate and requested. Drop
that constraint before re-running or the critics will spend their budget objecting
to a decision that has already been made. See HANDOFF.md §7 for the shipped numbers.
