# s482-hold-body — progress

Lane: the Q6 body hold — ruling:user-voice-scrml.md-S482-hold-until-body-ends (~:22476):
> Q6 (b) — "the runtime holds effect and request runs triggered during the body, running them after
> the body in trigger order." Rec (PERMANENT): "makes §7.6's 'they run after the mount' true as written".
> Owner: "yes, the runtime holds them"

Also ⭐⭐ model (c) (ruling:user-voice-scrml.md-S482-runorder-model-c, ~:22539) and the run-order study
(~/.cache/scrml/review/s482-runorder-study/study.md §2 R5 "Anything they trigger during the body is held to
Settle (Q6)", §6 "closed by Q6 under either option", §7 item 5).

Bootstrap-only (compiler/self-host-v2/ incl. its runtime) + SPEC + gaps. compiler/src/ frozen. Base:
origin/main 8511bd90c (#2096 model (c), #2103). Probes: ~/.cache/scrml/review/s482-hold-body/ (p/ probes,
h/run.sh + h/batch.sh Chromium runner, base/ = origin/main tree).

COORDINATION: lane s482-seed-timing (separate PR) edits §7.6 / §6.15 / §66 seed timing. This lane edits only
the effect / request timing sentences.

## What "the body" is (item 1 — derivation)

- The ruling's words: "effect and request runs triggered during the body … after the body in trigger
  order". The study's model: *Body* (W3) = "the `<program>` body once, top to bottom"; *Settle* (W8–W9) =
  "held effects and requests in trigger order, then `<onMount>`"; *Live* (W10) = "each event, timer,
  response or push is its own turn". R5: "Event handlers, effects, requests, `<onMount>` and runtime `^{}`
  re-runs are not judged by R2. Anything they trigger during the body is held to Settle (Q6)."
- Built: the boot's one call of the program's render runs inside `rt.runBody(…)`. Every construct mounted
  as part of that render (an `if=` true at mount, an `<each>` row, slot content, a `<*x/>` shared
  instance, nested elements) is inside it, so its runs are held too.
- A construct mounted LATER (an `if=` turning true on a click): its mount is a Live turn, not the body.
  It needs no hold of its own and gets none: its mount is a render effect in the runtime's `queue`, and a
  flush takes `effectQueue` (effects and requests) only once `queue` is empty — so whatever its mount
  triggers already runs after its mount completes, on base and head alike (probe l1-later-mount: `[]` at
  the mount, the request's `R` after; base = head). So "does a later mount count as a body?" — it already
  behaves as one for effect / request runs (hold until its mount completes), by the existing flush order;
  no new rule is needed and none is written. Not genuinely undecided → no owner question.
- Dedupe: an effect or request triggered twice during the body runs ONCE, at its FIRST trigger's position
  (`effectQueue` is an insertion-ordered Set). §6.7.4 "runs once per flush, after the writing batch
  completes … however many of its dependencies that batch changed" — the held set is one flush.
  Probe t3: writes `@c, @a, @b, @c` → `cab` (base `cabc`).
- Pending cells (§13.9.2 / §13.9.4 "most recently started wins"): a held run is DATED at its trigger
  (Request.heldStart), so a body write of the pending cell after the request's place still supersedes
  its load, as today; a `reset(@x)` in the body is held too, dated at the reset (`reset(@x); @x = v;`
  keeps `v`, RULED S478 item 2).
- Not held (outside the ruling's "effect and request runs"): a runtime `^{}` block's re-run (render queue,
  MetaEffect) — unchanged.

## Steps

- [x] 1. runtime `runBody` + `bodyHold` (drainQueues skips effectQueue while held); Request dates a held run
      at its trigger; print.scrml boot wraps the render in `rt.runBody`; reachOf's runsNowView drops an
      `<effect>`'s / `<request>`'s body (deps / target / signal cells kept)
      Chromium (head): r1-effect-fire `0 5` (base `1 1`; `out` is a plain let shown at its place — the
      effect now runs after the body, so the display shows 0 and a click shows `out` = 5); r1-request
      `6 5` (base `2 1`).
- [x] 2. pins: slice-m1/hold-body.runtime.test.js (runtime: hold, trigger order + dedupe, request/effect mix,
      release after the body, render effects not held, trap path, disposed scope, pending-cell dating);
      slice-m4/hold-body-s482.test.js (shipping path, happy-dom: boot shape, 3-effect trigger order, request+effect
      both orders, `<each>` row, nested `if=` construct, component instance seed after a held request (an effect /
      request in a component's renders is E-BOOTSTRAP-UNSUPPORTED), later mount); handler-reach "E" now `0 5`/5 and
      `6 5`; compiler/tests/browser/hold-body-chromium-s482.browser.test.js (the same in Chromium, 6 tests).
- [x] 3. deleted (proved by probes, below): analyze.scrml constructReadDiags + constructRequestWrites,
      requestWritesOf, requestCodeBlocks, regionRequestBlocks, BodyW, constructStart, chainStartAt, blankTextNode,
      unionIds, mergeBodyW, regionUses, the region scan (ViewW, RegionScan, regionScan, scan*), placeViews,
      ViewAcc, viewsWrites, blocksWrites, requestBlocks, ReadCx, readScanOpaqueIn, initReadWritten (~615 lines).
      Probes (Chromium head): q01 / t08 / t09 / t10 / r06 refused → `1`; each twin (request after the
      initializer) `1` on both trees — order-independent, as the gap's capable alternative said. r03 compiles.
      h31 / h06 stay refused by g-boot-file-scope-init-residue-s479 (E-BOOTSTRAP-UNSUPPORTED). No E-SCOPE-001
      refusal exists only because effects / requests ran mid-body (bodyNodeReach never judged `.Effect` /
      `.Request` bodies); none deleted.
      NOTE on "the correct source-order value": the reviews' "source order gives 5" for q01 etc. assumed the
      request's load ran where it stood; Q6 ruled it runs after the body, so the ruled value is 1 (the
      initializer runs just before the construct, before the held load). Likewise r1-effect-fire's `out`
      display shows 0, not the gap report's assumed 5: `out` is a plain `let` shown at its place, and the effect
      writes it after the body (a click shows 5). `k` is 5 in both — the binding the gap was about.
- [x] 4. #2088 F/U: §7.6 E-SCOPE-001 sentence fixed to the built truth; effect-deps-mount-s482.test.js pins a01
      (`when @z changes`) and a11 (each row) — refused at the writing lib seed (E-VALUE-WRITES-STATE, model (c)),
      and their non-writing twins compile with k = 1.
- [x] 5. SPEC: §7.6 R3 ⚑ INTERIM struck (smallest edit — the paragraph lane s482-seed-timing also edits), R5
      "Built (S482)" (body, later mount, trigger order, dedupe, pending-cell dating, not-held ^{}; who pays;
      direction), E-SCOPE-001 sentence, the S481 provenance's INTERIM list clause struck; §6.7.4 "Held during the
      body"; §6.7.7 Mount behavior note; §34 E-FILE-SCOPE-INIT-IN-CONSTRUCT row. known-gaps: the three gaps
      resolved (resolved-by=s482-hold-body), the residue-s479 coupling note marked moot.
