// =============================================================================
// scrml bootstrap runtime — slice M1 (dpa-051 §5, §6; SPEC §66).
//
// This is TARGET code: the JavaScript that programs compiled by the bootstrap
// printer (compiler/self-host-v2/print.scrml) run against. It is not compiler
// code (dpa-051 §8.5). It replaces impl#1's flat `_scrml_state["<chunk>$name"]`
// keyspace with:
//
//   - INSTANCE RECORDS: { id, decl, fields: [Signal], handles: [Cell], kids,
//     scope }. A field is an array slot in a record the code already holds
//     (§5.1). The shared instance of a declaration is id 0, created lazily
//     (§66.6.4). Records are created at CONSTRUCTION, before any render (L12 (b)).
//   - A SCOPE TREE: root → instance → <each> row → conditional arm. Every
//     effect and listener is constructed WITH a scope and disposed with it
//     (§5.6). An unscoped effect cannot be constructed.
//   - IMMUTABLE VALUES (§6.1, R3): every edit makes a new value, so a snapshot
//     is free (§66.10). Nothing enforces it at runtime: Core never emits an
//     in-place mutation (every write is a classified `Write`), so the dev-mode
//     deep-freeze was DROPPED (S437 PA decision — it cost 50–80× on large
//     sequences, slice-m1/progress.md). The identity/value line stays: instance
//     records, scopes and `as=` handles are IDENTITIES that hold values (§45.1),
//     never copied and never compared as values.
//   - KEYED <each> RECONCILIATION in which a row OWNS a scope, so an instance
//     created in a row moves with the row and is disposed with it (§5.3).
//
// Reused leaf (audited scope-clean): `lis` — the longest-increasing-subsequence
// helper from impl#1's runtime-template.js (`_scrml_lis`). Nothing else of the
// impl#1 runtime is imported; its reconcile is keyed by DOM expandos and has no
// scope axis.
// =============================================================================

// ---------------------------------------------------------------------------
// Stats — live effect / listener counts, for tests and devtools.
// ---------------------------------------------------------------------------
export const stats = { effects: 0, deriveds: 0, listeners: 0, instances: 0, depEffects: 0, requests: 0 };

// ---------------------------------------------------------------------------
// Scopes.
//
// Teardown order (SPEC §6.7.2): depth-first — every child scope is torn down
// before its parent begins; then, for the scope itself, step 1 unregisters its
// `<effect>`s, and the remaining cleanups (listeners, render effects, DOM,
// records) run last-in-first-out. (Steps 2–4 — <timer>/<poll>, cleanup(),
// animationFrame — have no bootstrap form yet; they join the LIFO list after
// step 1 when they land.)
// ---------------------------------------------------------------------------
export class Scope {
  constructor(parent) {
    this.parent = parent;
    this.children = new Set();
    this.depEffects = [];
    this.cleanups = [];
    this.disposed = false;
    if (parent) parent.children.add(this);
  }
  /** Register a cleanup to run when this scope is disposed. */
  own(cleanup) {
    if (this.disposed) { cleanup(); return; }
    this.cleanups.push(cleanup);
  }
  /** Register an `<effect>`'s unregistration — teardown step 1 (§6.7.2). */
  ownEffect(unregister) {
    if (this.disposed) { unregister(); return; }
    this.depEffects.push(unregister);
  }
  child() { return new Scope(this); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    batch(() => {
      for (const c of [...this.children].reverse()) c.dispose();
      for (const unregister of this.depEffects) unregister();
      for (let i = this.cleanups.length - 1; i >= 0; i--) this.cleanups[i]();
    });
    this.children.clear();
    this.depEffects = [];
    this.cleanups = [];
    if (this.parent) this.parent.children.delete(this);
  }
}

/** The program-lifetime scope. Shared instances live here. */
export const root = new Scope(null);

function requireScope(scope, what) {
  if (!(scope instanceof Scope) || scope.disposed) {
    throw new Error(`${what} requires a live owning scope (dpa-051 §5.6: every effect has an owner)`);
  }
}

// ---------------------------------------------------------------------------
// Signals: Cell (writable), Derived (computed, read-only), Effect.
// Push-invalidate / pull-recompute: a write marks dependents stale and queues
// effects; effects run once per flush and pull derived values lazily, so a
// derived value is recomputed at most once per change and never glitches.
// ---------------------------------------------------------------------------
let tracking = null;
let batchDepth = 0;
// Construction (L12 (b)): the depth of nested factory runs, and the seeds owed
// until the outermost one ends.
let constructing = 0;
let owed = [];
const SEEDING = Symbol("seeding");
const queue = new Set();
// `<effect>` bodies (§6.7.4) wait until the render / structure effects of the
// same flush have settled: an `if=` region or `<each>` row the same batch
// unmounts unregisters its effects (teardown step 1) BEFORE they could run.
const effectQueue = new Set();

function track(source) {
  if (tracking) {
    tracking.sources.add(source);
    source.observers.add(tracking);
  }
}

function invalidate(source) {
  for (const o of [...source.observers]) o.markStale();
}

export function untrack(fn) {
  const saved = tracking;
  tracking = null;
  try { return fn(); } finally { tracking = saved; }
}

export function batch(fn) {
  batchDepth++;
  try { return fn(); } finally {
    batchDepth--;
    if (batchDepth === 0) flush();
  }
}

// Render / structure effects first, then `<effect>` bodies. An effect body
// cannot write a reactive cell (§6.7.4 — a compile error, directly or through
// a called function), so running one queues nothing: there is no cascade to
// order or bound, and this is a plain loop.
//
// One flush at a time (s449 fix round, MEDIUM-1): a render effect that writes
// while it runs — `<each>`'s reconcile sets a surviving row's item cell before
// it disposes the removed rows — used to start a NESTED flush from that write's
// batch, which drained the effect queue mid-run, so an `<effect>` in a row the
// same batch was removing still ran. A flush started while one is running now
// returns at once; the running loop picks up everything queued.
let flushing = false;
// s482 r1 — which flush is running (a runtime `^{}` block counts its runs per flush, MetaEffect.run)
let flushSeq = 0;

function flush() {
  if (flushing) return;
  flushing = true;
  flushSeq++;
  try { drainQueues(); } finally { flushing = false; restoreTries.clear(); }
}

// s474 r1 (review of #1727, F1) — ONE EFFECT'S THROW NEVER STRANDS THE REST.
// An effect that throws (a runtime trap, a template whose structure the parser
// changed) used to unwind out of this loop, and every effect still queued
// behind it waited for some later write. A gate closing in the same write
// never closed, so a gated secret stayed mounted after logout. That is fail-open,
// whatever the throw was. Each run is now contained: the queue is drained to
// empty, then the FIRST error is rethrown (the write still fails loudly, as
// before); any later one is reported, never swallowed.
function drainQueues() {
  let first = null;
  let failed = false;
  for (;;) {
    let e = null;
    if (queue.size > 0) {
      [e] = queue;
      queue.delete(e);
    } else if (heldToRestore.size > 0) {
      // s480 — the render effects of this flush have settled: held elements whose every
      // attribute reads again go back now (`restoreHeld`), before the `<effect>` bodies run
      try { restoreHeld(); } catch (err) { if (!failed) { failed = true; first = err; } else reportLater(err); }
      continue;
    } else if (effectQueue.size > 0) {
      [e] = effectQueue;
      effectQueue.delete(e);
    } else {
      break;
    }
    if (e.disposed) continue;
    try {
      e.run();
    } catch (err) {
      if (!failed) { failed = true; first = err; } else reportLater(err);
    }
  }
  if (failed) throw first;
}

function reportLater(err) {
  if (typeof globalThis.reportError === "function") globalThis.reportError(err);
  else queueMicrotask(() => { throw err; });
}

export class Cell {
  constructor(value) {
    this.value = value;
    this.observers = new Set();
    // A seed still owed (an initializer queued during construction, see
    // `construct`), SEEDING while it runs, or null once the value is settled.
    this.pending = null;
    // s475 r3 (N2): a PENDING cell's supersede record (§13.9.2; set by its Request) — null otherwise
    this.pend = null;
    // s478: a `debounced=` / `throttled=` cell's timing record (§6.13; `timed`) — null otherwise
    this.timing = null;
    // s482 — a seed HELD for its place in the program body's run (`hold`, §7.6 rule (b) S482):
    // construction leaves it owed; `seed` runs it at its place, a read or a write earlier runs it then.
    this.held = false;
    // s478 (s478-boot-channel-ops): a §38 channel cell's op sink (`channel`) — called with the
    // §38.4.2 op of each committed write (`syncOp`, or null: a whole-value write) — null otherwise
    this.sync = null;
  }
  get() { track(this); if (this.pending !== null) this.settle(); return this.value; }
  /** The current value without subscribing (used by writes). */
  peek() { if (this.pending !== null) this.settle(); return this.value; }
  set(v) {
    if (resetGuard !== null && runningReset !== null && !resetGuard.cells.has(this)) { resetGuard.deferred.add(runningReset); return; }
    if (this.timing !== null) { timedWrite(this, v); return; }
    this.write(v);
  }
  /** The write past any timing rule (a timed cell's commit). */
  write(v) {
    if (this.pend !== null) {                       // s475 r3/r4: a pending cell's write (pendWrite)
      const w = pendWrite(this, v);
      if (w === PEND_STALE) return;
      // s478 follow-up (§13.9.4 rule 4, RULED S478): the reload a winning `not` starts AT THE WRITE
      // (as a reset's does), not at the batch's end — so a later write in the same continuation wins
      if (w === PEND_RELOAD) { const req = this.pend.req; batch(() => { this.land(v); req.resetRun(); }); return; }
    }
    this.land(v);
  }
  /** The write itself, once it is let through. */
  land(v) {
    // s482: a held seed written before its place runs first — every seed runs, once (§7.6 S482)
    if (this.held && this.pending !== null && this.pending !== SEEDING) this.settle();
    this.pending = null;
    if (Object.is(v, this.value)) return;
    const prev = this.value;
    this.value = v;
    if (this.sync !== null) this.sync(syncOp !== null && syncOp.target === this ? syncOp : null, prev);
    // Every observer is marked first, then the `reset-on=` resets this write
    // triggered are applied — all of them, in rank order — still inside this
    // batch, so its flush sees the trigger and the resets as one change.
    batch(() => { invalidate(this); drainResets(); });
  }
  /** Run an owed seed now (on first demand, or when construction ends). */
  settle() {
    const init = this.pending;
    // s482 r1 (#2053 review INFO): a seed runs at its place in the body's run, or on an earlier read
    if (init === SEEDING) throw new Error("a cell's initializer reads itself, directly or through another cell's initializer, while it is being computed — at its place in the program body's run, or on a read before that place (a seeding cycle)");
    this.held = false;
    this.pending = SEEDING;
    try { this.value = untrack(init); } finally { if (this.pending === SEEDING) this.pending = null; }
  }
}

// ---------------------------------------------------------------------------
// s478 — `debounced=DURATION` / `throttled=DURATION` (SPEC §6.13). The compiler
// emits `timed(inst$.scope, <cell>, "debounce" | "throttle", ms)` for a timed
// program cell; every LOCAL write (`Cell.set`) then passes through the rule, and
// the value COMMITS through `Cell.write` — the ordinary write path, so
// subscribers, derived values, the DOM and validity see the committed value
// (§6.13.6 "the timing rule is a wrapper around the same write path"). The
// commit never re-enters the wrapper (it calls `write`, not `set`).
//   debounce (§6.13.1) — "Each new write within the window restarts the timer;
//     the cell's value updates exactly once, after the window of silence":
//     the latest requested value commits `ms` after the most recent request.
//   throttle (§6.13.2) — "The first write in any window emits immediately;
//     subsequent writes within DURATION of the last emit are suppressed but the
//     most recent suppressed value is held. At the end of the window a single
//     trailing write emits with the held value." `last` starts at 0, so the
//     first write ever is a leading emit.
// The compiler refuses every composition whose rule this does not build
// (analyze timingPass: a server-origin writer, `persist=`, a reset) — so no
// write here is server-origin, and no reset reaches a pending timer. The one
// write that bypasses the wrapper is an engine's `<onIdle>` watchdog fire
// (`idleFire`, below). Reads see the committed value (§6.13.4). The timer is owned by
// `scope`.
// S479 — an ENGINE cell (a `rule=` graph field) passes its edge table (`table`).
// §6.13.5: "A `debounced=` / `throttled=` engine cell transitions at commit … `rule=`
// (§51.0.F) is judged at the commit, against the variant the cell holds then … A held
// write that a later write in the same window supersedes never commits, so it is never
// judged. A committed write that violates `rule=` is the runtime
// `E-ENGINE-INVALID-TRANSITION`: the cell keeps its prior value … the violation is a
// trap (§19.17) of the unit the commit runs in — the event handler for a commit that
// lands at once (a throttle's leading write), the timer for a trailing commit, where it
// is reported to the logging surface." So `transition` skips its write-time check on
// such a cell (timedEdgeJudged) and `commit` runs `checkEdge` first: a leading commit
// throws into the handler, a trailing one is reported (never thrown into a timer frame).
// ---------------------------------------------------------------------------
export function timed(scope, c, kind, ms, table = null) {
  requireScope(scope, "a timed cell");
  if (kind !== "debounce" && kind !== "throttle") throw new Error(`timed: unknown timing rule ${JSON.stringify(kind)} (§6.13)`);
  const t = { kind, ms, table, timer: null, held: undefined, last: 0, disposed: false };
  c.timing = t;
  scope.own(() => {
    t.disposed = true;
    if (t.timer !== null) clearTimeout(t.timer);
    t.timer = null;
  });
  return c;
}

/** Is `c` a timed engine cell, whose `rule=` edge is judged at commit (§6.13.5)? */
function timedEdgeJudged(c) {
  return c.timing !== null && c.timing.table !== null;
}

/**
 * The commit gate (§6.13.5): on an engine cell, the `rule=` edge from the variant the cell
 * holds NOW is judged before a held value commits — a violation leaves the cell at its prior
 * value and throws (E-ENGINE-INVALID-TRANSITION). A non-engine cell always passes.
 */
function admitTimed(c, t, v) {
  if (t.table !== null) checkEdge(c, t.table, v);
}

/**
 * A trailing commit's gate runs in a timer: a refused edge is reported, never thrown into the
 * timer frame (§19.17), and returns false. Only the REFUSAL is caught here — once the edge is
 * admitted, the write itself (and any effect it runs) is the caller's, exactly as before.
 */
function admitFromTimer(c, t, v) {
  try {
    admitTimed(c, t, v);
    return true;
  } catch (err) {
    reportLater(err);
    return false;
  }
}

/**
 * S479 — an `<onIdle>` watchdog fire on a timed engine cell (§51.0.R; ruling user-voice-scrml.md
 * S479 "⭐ RULED — three open S479 questions" item 2): "The watchdog firing applies immediately.
 * It's already a timed transition, and delaying it again would stack the window on top of
 * `after=`. It cancels any write still waiting, since that write was requested against a state
 * that just changed." So the fire is judged against `rule=` NOW (a refused fire throws — the
 * caller reports it — and, never having happened, cancels nothing), and a fire that changes the
 * cell drops the held write and its pending timer before it writes past the wrapper
 * (`Cell.write`, never `set`). A fire that changes nothing (the engine already holds `to=`, a
 * §51.0.F.1 no-op) is no transition, so a held write stays. The fire is not an emit of the
 * timing rule: a throttle's window (`last`) is left as it was.
 */
function idleFire(c, table, to) {
  checkEdge(c, table, to);
  const t = c.timing;
  const cur = c.peek();
  if (!(cur === to || JSON.stringify(cur) === JSON.stringify(to))) {
    if (t.timer !== null) clearTimeout(t.timer);
    t.timer = null;
    t.held = undefined;
  }
  asOp(c, "transition", to, () => c.write(to));
}

function timedWrite(c, v) {
  const t = c.timing;
  if (t.disposed) return;
  if (t.kind === "debounce") {
    if (t.timer !== null) clearTimeout(t.timer);
    t.held = v;
    t.timer = setTimeout(() => {
      t.timer = null;
      const h = t.held;
      t.held = undefined;
      if (!t.disposed && admitFromTimer(c, t, h)) c.write(h);
    }, t.ms);
    return;
  }
  const now = Date.now();
  if (t.timer === null && now - t.last >= t.ms) {
    admitTimed(c, t, v);                            // a refused edge throws into the handler, opening no window
    t.last = now;                                   // leading emit: the window opens BEFORE the write, so an
    c.write(v);                                     // effect that throws during it cannot keep the window shut
    return;
  }
  t.held = v;                                       // suppressed: the latest is held
  if (t.timer === null) {
    t.timer = setTimeout(() => {
      t.timer = null;
      const h = t.held;
      t.held = undefined;
      // the trailing emit opens the next window — if its edge is admitted (before the write,
      // so an effect that throws during the write still leaves the window open)
      if (!t.disposed && admitFromTimer(c, t, h)) {
        t.last = Date.now();
        c.write(h);
      }
    }, Math.max(0, t.ms - (now - t.last)));
  }
}

function unsubscribe(comp) {
  for (const s of comp.sources) s.observers.delete(comp);
  comp.sources.clear();
}

export class Derived {
  constructor(scope, fn) {
    requireScope(scope, "a derived value");
    this.fn = fn;
    this.value = undefined;
    this.stale = true;
    this.disposed = false;
    this.sources = new Set();
    this.observers = new Set();
    stats.deriveds++;
    scope.own(() => { this.disposed = true; unsubscribe(this); stats.deriveds--; });
  }
  get() {
    track(this);
    if (this.stale && !this.disposed) this.recompute();
    return this.value;
  }
  peek() { return untrack(() => this.get()); }
  recompute() {
    unsubscribe(this);
    const saved = tracking;
    tracking = this;
    try { this.value = this.fn(); } finally { tracking = saved; }
    this.stale = false;
  }
  markStale() {
    if (this.stale) return;
    this.stale = true;
    invalidate(this);
  }
}

class Effect {
  constructor(scope, fn, blank = null) {
    this.fn = fn;
    // s480 — a HOLE's effect (`hole`, below) carries the way its hole renders nothing; null otherwise
    this.blank = blank;
    this.disposed = false;
    this.sources = new Set();
    stats.effects++;
    scope.own(() => {
      this.disposed = true;
      queue.delete(this);
      unsubscribe(this);
      stats.effects--;
    });
    this.run();
  }
  run() {
    unsubscribe(this);
    const saved = tracking;
    tracking = this;
    try {
      this.fn();
    } catch (err) {
      if (this.blank === null) throw err;
      tracking = saved;
      // The hole renders nothing — whatever the throw was (fail closed: an `if=` whose test
      // threw shows no arm, a `show=` element is hidden, never the last value it showed).
      untrack(this.blank);
      if (!isTrap(err)) throw err;
      reportLater(err);                              // a trap: reported once, and it ends here
    } finally { tracking = saved; }
  }
  markStale() {
    queue.add(this);
    if (batchDepth === 0) flush();
  }
}

/** A tracked side effect, owned by `scope`. Re-tracks on every run. */
export function effect(scope, fn) {
  requireScope(scope, "an effect");
  return new Effect(scope, fn);
}

// ---------------------------------------------------------------------------
// s480 — THE TRAP UNIT IS THE EFFECT, NOT THE MOUNT (SPEC §19.17; ruling
// user-voice-scrml.md S479 "⭐ RULED — the rest of S478 hand-off §3.B" item 20:
// "the trap unit is the effect, not the mount — the failing hole renders
// nothing, the trap is reported once, the rest of the mount proceeds").
// A view hole's effect is registered through `hole(scope, fn, blank)`: when a
// run of `fn` throws, `blank()` makes the hole render nothing (no text, no arm,
// no rows, a `show=` element hidden), on the first run (the mount) and on every
// later one. A TRAP (§19.17) then ends there: it is reported once (§19.17 "Every
// trap SHALL be reported … It SHALL NOT be swallowed silently"), and the mount —
// every other hole, and the insertion of the view — proceeds. Any other throw (a
// bootstrap defect, a template the HTML parser restructured) is still rethrown
// after the blank, as before. A data-bound ATTRIBUTE's hole is its ELEMENT
// (`rt.attr` and a `class:` toggle, `rt.classOn`; `elementHole` below; ruling user-voice-scrml.md S480 "⭐ RULED —
// what a trap renders when "nothing" is not safe" item 1): an absent attribute
// is not safe for every name (an `<iframe>`'s `sandbox`), so the element that
// carries it is replaced by a placeholder. NOT a hole here (unchanged — the
// throw goes on to the nearest enclosing hole, which blanks, or, at the top
// level, ends the mount): a body-top statement (`rt.run` — a top-level logic
// block, its own unit in §19.17, and a guard the page must not render past),
// and an `<effect>` body.
// ---------------------------------------------------------------------------

/** A trap (§19.17): the runtime's `ScrmlTrap`, or a host file's error carrying the same name and a code (stdlib/math/host.js). */
function isTrap(err) {
  return err instanceof ScrmlTrap || (err !== null && typeof err === "object" && err.name === "ScrmlTrap" && typeof err.code === "string");
}

/** A view hole's tracked effect (§19.17, s480): a throw blanks the hole; a trap is reported and ends there. */
function hole(scope, fn, blank) {
  requireScope(scope, "a view hole");
  return new Effect(scope, fn, blank);
}

// ---------------------------------------------------------------------------
// `<effect deps=[…]>${ body }</>` (SPEC §6.7.4) and the suspendable task layer.
//
// A DepEffect subscribes to EXACTLY its dependency cells (it is an observer of
// each — the set every write fans out to) and never tracks its body: reading
// an unlisted cell in the body is valid and is not a trigger. It does NOT run
// when it is registered (S447 2b: not on mount, not on remount). A change
// queues it; it runs once per flush, after the writing batch completes and its
// render / structure effects have settled — however many of its dependencies
// that batch changed. Change detection is `Cell.set`'s reference identity.
// A derived value is recomputed on read (lazy pull), so a derived value the
// body reads already reflects the change — the §6.7.4 "derived flush before
// effect bodies" rule holds by construction.
//
// The body may not write any reactive cell (E-EFFECT-WRITES-STATE, decided at
// compile time from a transitive write summary). Nothing here guards against a
// write: the compile-time rule is the guarantee, and a runtime bound would mean
// the rule had a hole.
//
// Each run gets a TASK — the handle a suspension (`suspend`, Core
// Stmt.Suspend, the CPS split of §19.9.8) resumes through. THE NEWEST RUN
// WINS (S446 (b), carried onto <effect> by §6.7.4): a run that starts while an
// earlier run of the same effect is suspended cancels that run's task, so its
// continuation never resumes and the value it was waiting for is discarded.
// Unregistering the effect (its scope's teardown, step 1) cancels its tasks
// the same way. Transport (§6.7.7.1): the task layer never aborts an in-flight
// call — it discards the result. Abort is permitted only for a READ call
// ("MAY"), never required, and never permitted otherwise; discarding everywhere
// is the conforming choice that needs no classification at run time.
// ---------------------------------------------------------------------------
class Task {
  constructor(owner, abortable = false) {
    this.owner = owner;
    this.cancelled = false;
    this.pending = 0;
    // s475 (S5a, §6.7.7.1 rules 2 / 3): a READ request's run — its in-flight
    // server calls register their transport abort here, and cancel() fires it.
    // Every other task (a WRITE request's, an effect's, a handler's) only
    // discards: `onAbort` is a no-op for it, so its transport completes.
    this.aborts = abortable ? new Set() : null;
  }
  cancel() {
    this.cancelled = true;
    const as = this.aborts;
    if (as === null || as.size === 0) return;
    this.aborts = new Set();
    for (const a of as) {
      try { a(); } catch (e) { reportHostError(e); }
    }
  }
  /** Register `abort` to run when this task is cancelled; returns the un-registration. */
  onAbort(abort) {
    if (this.aborts === null) return () => {};
    if (this.cancelled) { abort(); return () => {}; }
    this.aborts.add(abort);
    return () => { if (this.aborts !== null) this.aborts.delete(abort); };
  }
}

class DepEffect {
  constructor(scope, deps, body) {
    this.deps = deps;
    this.body = body;
    this.disposed = false;
    this.tasks = new Set();
    for (const d of deps) d.observers.add(this);
    stats.depEffects++;
    scope.ownEffect(() => this.unregister());
  }
  markStale() {
    if (this.disposed) return;
    effectQueue.add(this);
    if (batchDepth === 0) flush();
  }
  run() {
    // The newest run wins: an earlier run still suspended never resumes.
    for (const t of this.tasks) t.cancel();
    this.tasks.clear();
    const task = new Task(this);
    this.tasks.add(task);
    try {
      untrack(() => this.body(task));
    } finally {
      this.settled(task);
    }
  }
  /** A task with no suspension pending is finished. */
  settled(task) {
    if (task.pending === 0) this.tasks.delete(task);
  }
  unregister() {
    if (this.disposed) return;
    this.disposed = true;
    effectQueue.delete(this);
    for (const d of this.deps) d.observers.delete(this);
    for (const t of this.tasks) t.cancel();
    this.tasks.clear();
    stats.depEffects--;
  }
}

/**
 * Register `<effect deps=[…]>${ body }</>` in `scope` (§6.7.4). `deps` are the
 * dependency CELLS; `body(task)` is the effect. It never runs at registration;
 * it is unregistered when `scope` is disposed (teardown step 1).
 */
export function effectOn(scope, deps, body) {
  requireScope(scope, "an <effect>");
  if (deps.length === 0) throw new Error("an <effect> needs at least one dependency (§6.7.4, E-EFFECT-NO-DEPS)");
  for (const d of deps) {
    if (!(d instanceof Cell)) throw new Error("an <effect> dependency must be a mutable cell (§6.7.4, E-LIFECYCLE-007)");
  }
  new DepEffect(scope, deps, body);
}

// ---------------------------------------------------------------------------
// s475 — THE REQUEST MACHINE: `<request>` (SPEC §6.7.7) and a pending cell
// (§13.9.2: "a plain cell initialized to `not`, plus a `<request>`" — "No new
// runtime representation"). Core View.Request; print.scrml requestJs.
//
// A run (mount, a dependency change, `refetch()`):
//   1. starts a new TASK and cancels every earlier one — the newest run wins
//      (EC-2 / EC-4: "only the most recently initiated fetch's result is
//      applied"; the task IS the per-instance sequence number);
//   2. for a request WITH its state (r1, F3: all four signals or none), sets
//      the signals (§6.7.7 "Mount behavior"): loading true, error `not`,
//      stale = (data is not `not`) — computed from `data` only (§6.7.7 step 4;
//      the target may hold an optimistic or initial value); `data` and the
//      TARGET keep their values ("On re-execution, `<#id>.data` is NOT
//      cleared"; §13.9.4 keep-stale);
//   3. evaluates the load: `body(task)` returns `{ on, then }` — `on` the
//      waiting value, `then(v)` the continuation that writes the target.
// When the load settles on a LIVE task (not superseded, not torn down —
// EC-3's mounted guard): a request with its state takes a Failure itself —
// error is set and the target is untouched (§6.7.7 "Settled state (failure)":
// "data retains previous value"); otherwise `then(v)` runs (a pending cell has
// no state: its body's own Attempt handles a failure, §13.9.5) and `data`
// takes the target's new value. loading / stale go false in the same batch.
//
// r1 (F4) — A HOST ERROR (a scrml bug, never a scrml failure: `then` throws,
// the load rejects, a Let initializer throws) ends the run: it is reported
// through the one host-error reporter, loading / stale go false, and `error`
// is NOT set (it holds scrml failures only). A synchronous throw from the body
// is caught here, so it never escapes into the write that triggered the run.
//
// r1 (F1) — a request never re-triggers itself: requestOn refuses a target or
// signal among the deps, a signal that is the target and two signals on one
// cell (check.scrml C-R1 refuses the same, plus any body write besides the
// target's, statically — the runtime cannot see a write through a function).
//
// s475 (S5a) — ABORT READS, DISCARD WRITES (§6.7.7.1). A superseded (EC-2 /
// EC-4) or torn-down (EC-3) run is always discarded — its task is cancelled,
// so its continuation never runs and it sets no signal. For a READ request
// (`opts.read`, the compiler's class — print.scrml requestJs) the run's task
// is ABORTABLE: cancelling it aborts the in-flight `call`'s fetch (rules 2 /
// 3: "a READ request's superseded transport SHALL be aborted"). A WRITE
// request (the default — "Unclassifiable = write") is discard-only: "its
// transport SHALL NOT be aborted — it runs to completion". Rule 4: the abort
// is transport-only — the server may have committed — and "An aborted fetch
// SHALL NOT set `<#id>.error`": the aborted call settles on a cancelled task,
// which drops it like any discarded result (never a failure settle, never a
// host error).
// ---------------------------------------------------------------------------
const REQUEST_SIGNALS = ["loading", "data", "error", "stale"];

// s475 r3 (N2) — SUPERSEDE ACROSS A PENDING CELL'S WRITES AND LOADS (PA reading, recorded in the
// coverage row / gap text: "the MOST RECENTLY STARTED write or load of a pending cell wins. Starting
// a new one supersedes any older one in flight: the older one's result is discarded, and for
// READ-class loads it is aborted, the same way a request's own reload already supersedes").
// START STAMPS, compared when a write LANDS (r3 — r2's claim-at-call-start aborted a load even
// when no write followed, and missed writes it could not see statically):
//  - one global monotonic counter (`pendSeq`). A run of a pending cell's own load takes a fresh
//    stamp (Request.run → `p.load`). Every `suspend` takes a fresh stamp when it is CALLED (the
//    wait's start) and its continuation runs with that stamp AMBIENT (`curStamp`, restored on
//    exit and on throw) — so a write from any code the continuation runs synchronously (a Join
//    body, a helper function, a loop, a nested arm) carries it. A write outside any continuation
//    (a handler's synchronous part — no wait) takes a fresh stamp: it starts as it lands ("now").
//  - a write of value `v` with stamp `s` landing on a pending cell:
//      · a load started after it (`p.load > s`) or a newer write already landed (`p.wrote > s`):
//        DISCARDED — this write only; the rest of its continuation runs;
//      · otherwise it WINS (`p.wrote = s`: an older write still in flight is discarded when it
//        lands) and supersedes an in-flight load started before `s`: its task is cancelled — its
//        result discarded, a READ's transport aborted (Task.onAbort). This holds for EVERY winning
//        write, a no-op (`Object.is(v, current)`) included (r4 F-A): the no-op only skips the
//        notify, as for every cell — it is still the newest start, so an older load must not land
//        over it (red r3: the reload's "b" overwrote a newer `@who = "a"`).
//      · a winning write of `not` RE-RUNS the load (r4 D, PA reading ⚑): §13.9.2 "A reset of a
//        pending cell … is the request's re-run — never … back to `not`", and §13.9.5 "`not` …
//        returns the cell to its pre-state" — a pending cell's pre-state is `not` WITH its load
//        running. The older load is superseded, then `markStale` queues a fresh run, which the
//        write's batch flushes once the write has landed: its own newer stamp (`p.load > s`).
//        No loop: the load's own settle takes the `settling` bypass below, so a load that fails to
//        `not` lands `not` and never re-triggers itself (red r3: `not` with nothing in flight —
//        loading forever).
//  - nothing is superseded before a write actually lands (a wait whose continuation then writes
//    nothing — an untaken `if`, a failure arm that skips the write, an early exit — leaves the
//    load alone).
//  - the load's own settle never reloads: a write that would beat it cancelled its task, so a load
//    whose continuation runs is the newest start (`settling` lets its write through, after the same
//    `pendOlder` test as a write — a backstop, since stamps only rise).
//  - s478 r2: a `reset(@x)` starts its run when the reset executes — a fresh stamp, never skipped
//    (Request.resetRun); a write later in the reset's own continuation is dated at the reset.
//  - s478 follow-up: a winning write of `not` restarts the load the same way, AT THE WRITE (rule 4,
//    RULED S478). And a reset / `not`-restart issued INSIDE an awaited waiting call lifts the caller's
//    continuation that resumes after that call: its writes of THAT cell are dated no earlier than the
//    restart (ruling 2 in program order across the call — `const r = inner(); @who = "z";` keeps "z"
//    when `inner` resets after a wait). The lift is per continuation (`curLift`) and per cell; it is
//    carried by the call's frame (`curFrame`, one per waiting call, `waitFrames`), so only the awaiting
//    caller adopts it — an unrelated concurrent continuation keeps the stamp rule 2 gives it.
// Only a pending cell carries the record (a `<request>` with state keeps §6.7.7's own rules: an
// author write does not supersede its fetch).
let pendSeq = 0;
let curStamp = 0;                 // the running continuation's start stamp; 0 = none (a synchronous write)
// s478 follow-up — the running continuation's per-cell LIFTS: Map<pend record, restart stamp> | null.
// A restart (reset / winning `not`) in this continuation, or inside a waiting call this continuation
// resumed from, dates this continuation's later writes of that cell at the restart (a tie it wins).
// Only ever non-null inside `withStamp` (restored on exit), so a handler's synchronous part has none.
let curLift = null;
// s478 follow-up — the running waiting call's FRAME ({ parent, restarts: Map | null }) | null: the
// restarts issued anywhere inside the call (its body, its continuations, the calls it awaits), which
// its caller's resuming continuation adopts as its lifts (suspend → withStamp).
let curFrame = null;
const waitFrames = new WeakMap();  // a waiting call's Promise → its frame (rt.waiting)

// s478 follow-up — a pending cell's load was restarted with stamp `s` (Request.resetRun): lift the
// rest of this continuation, and record it in every enclosing waiting call's frame (its caller's
// resume adopts it). `s` is fresh, so a later restart of the same cell always overwrites.
function pendRestarted(p, s) {
  if (curStamp !== 0) {
    const m = new Map(curLift ?? []);   // copy: an adopted map is a frame's own record
    m.set(p, s);
    curLift = m;
  }
  for (let f = curFrame; f !== null; f = f.parent) {
    if (f.restarts === null) f.restarts = new Map();
    f.restarts.set(p, s);
  }
}

const PEND_STALE = 0;              // discarded: a newer load started, or a newer write landed
const PEND_LAND = 1;               // lands (Cell.land: a no-op still notifies nothing)
const PEND_RELOAD = 2;             // lands `not`, then the cell's load re-runs (r4 D)

// THE one supersede test (s475 r3; s478 reuses it for a load's own settle): a start
// dated `s` is the OLDER start under §13.9.4 rule 1 when a load started after it or a write started
// after it has already landed. Ties are not older (the later-running of the two wins, see below).
// Stamps only rise: `p.load` / `p.wrote` are only ever set from a start that passed this test.
function pendOlder(p, s) {
  return p.load > s || p.wrote > s;
}

function pendWrite(cell, v) {
  const p = cell.pend;
  // the load's own settle never reloads; s478 r1 (F2): it lands only while its start is still the
  // newest — a run whose start a landed write has passed is superseded (never lands over it)
  if (p.settling) return pendOlder(p, p.load) ? PEND_STALE : PEND_LAND;
  let s = curStamp !== 0 ? curStamp : ++pendSeq;
  // s478 r2 (§13.9.4 rule 3 ⚑): a write later in the SAME continuation as a reset is the later start
  // — dated no earlier than the reset's run (a tie, which the write wins below). Writes from other
  // continuations keep their wait's stamp (rule 2). s478 follow-up: the same for a `not`-restart
  // (rule 4), and for a restart inside a waiting call this continuation resumed from (curLift).
  if (curLift !== null) {
    const l = curLift.get(p);
    if (l !== undefined && l > s) s = l;
  }
  if (pendOlder(p, s)) return PEND_STALE;             // a newer load started, or a newer write landed
  p.wrote = s;                                        // older writes still in flight now lose
  // r4 F-A: every winning write, a no-op included. s478: `<=` — a tie is a reset's run and a write
  // after it in the SAME continuation (dated at the reset, above); the write runs after it there, so
  // it is the later start and wins (`reset(@x); @x = v;`, RULED S478 item 2).
  if (p.load <= s) p.req.supersede();
  return v === null || v === undefined ? PEND_RELOAD : PEND_LAND;
}

class Request {
  constructor(scope, target, deps, body, state, read) {
    this.target = target;
    this.deps = deps;
    this.body = body;
    this.state = state;                 // { loading, data, error, stale } | null
    this.read = read;                   // §6.7.7.1: READ — a superseded / torn-down run's transport is aborted
    this.disposed = false;
    this.tasks = new Set();
    for (const d of deps) d.observers.add(this);
    // s475 r3 (N2): a pending cell (no state) — its writes and loads supersede one another by start stamp
    if (state === null) target.pend = { load: 0, wrote: 0, req: this, settling: false };
    stats.requests++;
    scope.ownEffect(() => this.unregister());
  }
  markStale() {
    if (this.disposed) return;
    effectQueue.add(this);
    if (batchDepth === 0) flush();
  }
  /** s475 r3 (N2): a write of the pending cell that started after this run landed — the run is superseded. */
  supersede() {
    for (const t of this.tasks) t.cancel();
    this.tasks.clear();
  }
  /**
   * s478 (RULED S478 item 2; SPEC §13.9.4 rule 3) — `reset(@x)` of a pending cell: the run it
   * triggers STARTS WHEN THE RESET EXECUTES ("the reset's load starts at the reset, so the later
   * write wins (most recently started)"). So it runs now (not at the end of the batch, as a
   * dependency change's run does) with a FRESH stamp: it is always the most recent start, and
   * supersedes every earlier load and write under the S475 rules (`run` cancels the older run's
   * task — a READ's transport is aborted, a WRITE's call completes and is discarded; a write
   * started earlier that lands later is discarded by `pendOlder`). It is never skipped: a reset
   * after a save (`save(2); reset(@who)`) or a retry after a failed load always reloads.
   * Ruling 2 inside a continuation: the restart lifts the rest of that continuation
   * (pendRestarted → `curLift`), so an author write later in it is dated at the reset (pendWrite)
   * — the `<=` tie there lets it supersede the reset's load (`reset(@who); @who = "z";` keeps
   * "z"); and it is recorded in the enclosing waiting calls' frames, so the caller's continuation
   * that resumes after awaiting such a call is lifted the same way. A dependency change in the
   * same batch still re-runs the load at the batch's end, the newest start (rule 3). Stamps only
   * rise: `++pendSeq` exceeds every stamp already issued. s478 follow-up: a winning write of `not`
   * restarts the load through here too (rule 4, RULED S478: the reload starts AT THE WRITE).
   */
  resetRun() {
    if (this.disposed) return;
    const s = ++pendSeq;
    pendRestarted(this.target.pend, s);
    this.run(s);
  }
  run(start = 0) {
    if (this.disposed) return;
    for (const t of this.tasks) t.cancel();
    this.tasks.clear();
    const task = new Task(this, this.read);
    this.tasks.add(task);
    const p = this.target.pend;
    // N2: this load's start stamp — a reset's (resetRun), else now (a mount / dependency-change run
    // starts when it runs: the end of the batch that triggered it, §13.9.4 rule 3)
    if (p !== null && p.req === this) p.load = start > 0 ? start : ++pendSeq;
    const st = this.state;
    try {
      if (st) {
        batch(() => {
          st.loading.set(true);
          st.error.set(null);
          st.stale.set(st.data.peek() != null);
        });
      }
      let load;
      // s478 follow-up: a load's body belongs to no author continuation or waiting call
      const prevFrame = curFrame, prevLift = curLift;
      curFrame = null;
      curLift = null;
      try {
        load = untrack(() => this.body(task));
      } catch (e) {
        // F4 (A5): a Let initializer threw — a host error; the run is over
        task.cancel();
        reportHostError(e);
        this.idle();
        return;
      } finally {
        curFrame = prevFrame;
        curLift = prevLift;
      }
      suspend(task, load.on, (v) => this.settle(v, load.then), () => this.idle());
    } finally {
      this.settled(task);
    }
  }
  settle(v, then) {
    const st = this.state;
    try {
      if (st && failed(v)) {
        st.error.set(v.error);
      } else {
        const p = this.target.pend;
        if (p !== null && p.req === this) {
          p.settling = true;
          try { then(v); } finally { p.settling = false; }
        } else {
          then(v);
        }
        if (st) st.data.set(this.target.peek());
      }
    } finally {
      // F4 (A3): a throwing `then` (reported by suspend) still ends the run
      if (st) {
        st.loading.set(false);
        st.stale.set(false);
      }
    }
  }
  /** A live run ended in a host error: loading / stale go false; error is untouched. */
  idle() {
    const st = this.state;
    if (!st || this.disposed) return;
    batch(() => {
      st.loading.set(false);
      st.stale.set(false);
    });
  }
  settled(task) {
    if (task.pending === 0) this.tasks.delete(task);
  }
  unregister() {
    if (this.disposed) return;
    this.disposed = true;
    effectQueue.delete(this);
    for (const d of this.deps) d.observers.delete(this);
    if (this.target.pend !== null && this.target.pend.req === this) this.target.pend = null;
    const inFlight = this.tasks.size > 0;
    for (const t of this.tasks) t.cancel();
    this.tasks.clear();
    stats.requests--;
    // s475 r1 (F3): the signals are program cells and outlive the request. A run cancelled
    // here never settles, so loading / stale would stay true — §6.7.7 "`<#id>.stale` SHALL be
    // `true` iff `<#id>.data` is not `not` and a fetch is in flight": none is. `data` and
    // `error` keep the last settle's (a torn-down request's resolution is discarded, EC-3).
    const st = this.state;
    if (st && (inFlight || st.loading.peek() || st.stale.peek())) {
      batch(() => {
        st.loading.set(false);
        st.stale.set(false);
      });
    }
  }
}

/**
 * Register a request in `scope` (§6.7.7 / §13.9.2). `target` is the cell the
 * load writes; `deps` the cells whose change re-runs it (may be empty: load
 * once, on mount); `body(task)` returns `{ on, then }`. `opts.mount` (default
 * true) runs it on mount — false for a provably-writing request (§6.7.7.3),
 * which then needs a dependency; `opts.state` is the full signal set
 * `{ loading, data, error, stale }` or absent (a pending cell); `opts.read`
 * (default false — WRITE, discard-only) the §6.7.7.1 READ class: a superseded
 * or torn-down run's server call is aborted, not only discarded; `opts.slot`
 * the request's program-level slot (rt.requestSlot()) that `<#id>.refetch()`
 * (rt.refetch) reaches it through. Returns `{ refetch }` (§6.7.7
 * `<#id>.refetch()`: a new run, superseding an in-flight one — EC-4; a READ
 * run's transport is aborted then, a WRITE run's discarded).
 */
export function requestOn(scope, target, deps, body, opts = {}) {
  requireScope(scope, "a <request>");
  if (!(target instanceof Cell)) throw new Error("a <request> target must be a mutable cell (§6.7.7: the body's one `@var = expr`)");
  for (const d of deps) {
    if (!(d instanceof Cell)) throw new Error("a <request> dependency must be a mutable cell (§6.7.7, E-LIFECYCLE-022)");
  }
  if (deps.includes(target)) throw new Error("a <request> target cannot be one of its dependencies — its settle would re-run it forever");
  if (opts.mount === false && deps.length === 0) throw new Error("a <request> with `mount: false` and no dependencies can never run (§6.7.7.3)");
  const st = opts.state ?? null;
  if (st !== null) {
    const seen = new Set();
    for (const k of REQUEST_SIGNALS) {
      const c = st[k];
      if (!(c instanceof Cell)) throw new Error(`a <request>'s \`${k}\` signal must be a mutable cell (all four signals, or none)`);
      if (c === target) throw new Error(`a <request>'s \`${k}\` signal cannot be its target`);
      if (deps.includes(c)) throw new Error(`a <request>'s \`${k}\` signal cannot be one of its dependencies — every run writes it`);
      if (seen.has(c)) throw new Error(`a <request>'s \`${k}\` signal shares its cell with another signal`);
      seen.add(c);
    }
  }
  const r = new Request(scope, target, deps, body, st, opts.read === true);
  // s475 (slice S3b): the program-level slot `<#id>.refetch()` reaches the request through —
  // filled while the request is mounted, cleared when its scope is torn down
  const slot = opts.slot ?? null;
  if (slot !== null) {
    if (!slot || typeof slot !== "object" || !Object.prototype.hasOwnProperty.call(slot, "request")) throw new Error("a <request>'s `slot` must come from rt.requestSlot()");
    slot.request = r;
    scope.ownEffect(() => {
      if (slot.request === r) slot.request = null;
    });
  }
  if (opts.mount !== false) r.markStale();
  return { refetch: () => r.markStale() };
}

/**
 * s475 (slice S3b) — a request's program-level slot (print.scrml requestSlotStmts):
 * `requestOn(…, { slot })` puts the mounted request in it and its teardown takes
 * it out, so `<#id>.refetch()` written anywhere in the program reaches it.
 */
export function requestSlot() {
  return { request: null };
}

/**
 * s475 (slice S3b) — `<#id>.refetch()` (SPEC §6.7.7 Properties `() -> void`:
 * "Imperatively re-execute the fetch body"): a new run of the mounted request,
 * superseding an in-flight one (EC-4 — the newest run wins, as on a dependency
 * change). While the request is not mounted (its `if=` arm is torn down) there
 * is nothing to re-execute and the call does nothing: a torn-down request's
 * results are discarded (EC-3), so a run started then could never be applied.
 */
export function refetch(slot) {
  const r = slot ? slot.request : null;
  if (!r) return;
  // s478: a pending cell's hidden request is reached only by `reset(@x)` (§13.9.2: it has no
  // `refetch()`), and the run a reset triggers starts at the reset (§13.9.4 rule 3, RULED S478)
  const p = r.target.pend;
  if (p !== null && p.req === r) r.resetRun();
  else r.markStale();
}

/**
 * Suspend `task` on `value` (Core Stmt.Suspend — the CPS split, §19.9.8):
 * when it settles, run the continuation `k(v)` — unless the task was cancelled
 * meanwhile (a newer effect run started, or its owner was torn down), in which
 * case nothing runs and the value is dropped (§19.9.10 / §6.7.7.1: "an abort
 * sets no error, and the call's continuation does not run").
 *
 * s454 (U1b, design §2.4):
 *  - the continuation runs as ONE `batch` (untracked): a handler's continuation
 *    writes (`@version = r; @status = "saved"`) and its writes flush once — the
 *    U1 design's assumption, which did not hold before (an effect body cannot
 *    write, so it was harmless there);
 *  - a HOST exception thrown in a continuation (a scrml bug, never a scrml
 *    failure — a failure is a value, `rt.call` never rejects) and a rejection of
 *    `value` on a live task go to ONE reporter (`reportHostError`), never to an
 *    unhandled rejection — the bootstrap twin of impl#1's handler-rejection
 *    logging fix (#1283 / #1296).
 */
export function suspend(task, value, k, onLiveReject) {
  task.pending++;
  // s475 r3 (N2): this wait's start stamp — ambient while its continuation runs (pendWrite)
  const stamp = ++pendSeq;
  // s478 follow-up: the waiting call this wait belongs to (its continuation stays in it), and the
  // frame of the waiting call being awaited, if `value` is one — its restarts lift the continuation
  const frame = curFrame;
  const callee = waitFrames.get(value);
  Promise.resolve(value).then(
    (v) => {
      task.pending--;
      if (task.cancelled) return;
      try {
        const lift = callee !== undefined ? callee.restarts : null;
        batch(() => untrack(() => withStamp(stamp, frame, lift, k, v)));
      } catch (e) {
        reportHostError(e);
        abandonWaiting(task);
      } finally {
        task.owner.settled(task);
      }
    },
    (e) => {
      task.pending--;
      if (!task.cancelled) {
        if (e !== REPORTED) reportHostError(e);
        // s475 r1 (F4): the owner's own end-of-run on a live host rejection (a request's signals)
        if (onLiveReject) {
          try { onLiveReject(e); } catch (e2) { reportHostError(e2); }
        }
      }
      task.owner.settled(task);
    },
  );
}

/**
 * s454 (U1b) — a WAITING function's result (Core Fn.waits, §13.2 async colour;
 * design §2.3 "a return continuation"): `executor(ret$)` runs the body now;
 * every exit — from the body or from any continuation — calls `ret$(value)`
 * (a `fail` resolves with its Failure, never a rejection). A host error thrown
 * by the synchronous part rejects, and the caller's `suspend` reports it.
 */
export function waiting(task, executor) {
  // s478 follow-up: this call's frame — the body (and every continuation of it) runs inside it
  const frame = { parent: curFrame, restarts: null };
  const prevFrame = curFrame;
  curFrame = frame;
  let pr;
  try {
    pr = waitingPromise(task, executor);
  } finally {
    curFrame = prevFrame;
  }
  waitFrames.set(pr, frame);
  return pr;
}

function waitingPromise(task, executor) {
  return new Promise((resolve, reject) => {
    // s454 fix round F2: registered on the task, so a host error in one of this body's
    // continuations (reported by `suspend`) abandons the Promise — its caller's continuation
    // does not run as if it succeeded, and the caller's suspension is settled (no leaked task).
    const w = { reject };
    if (task) {
      if (!task.waiting) task.waiting = new Set();
      task.waiting.add(w);
    }
    const done = () => { if (task && task.waiting) task.waiting.delete(w); };
    try {
      executor((v) => { done(); resolve(v); });
    } catch (e) {
      done();
      reject(e);
    }
  });
}

// s475 r3 (N2): run a continuation with its wait's start stamp ambient (restored on exit and on throw).
// s478 follow-up: also its waiting call's frame and its lifts (the awaited call's restarts, or none).
function withStamp(stamp, frame, lift, k, v) {
  const prev = curStamp, prevFrame = curFrame, prevLift = curLift;
  curStamp = stamp;
  curFrame = frame;
  curLift = lift;
  try { return k(v); } finally { curStamp = prev; curFrame = prevFrame; curLift = prevLift; }
}

// The rejection a waiting function's Promise is abandoned with after its host error was REPORTED
// (the caller's suspend settles its task and does not report it a second time).
const REPORTED = Symbol("scrml: host error already reported");

function abandonWaiting(task) {
  if (!task || !task.waiting) return;
  const ws = [...task.waiting];
  task.waiting.clear();
  for (const w of ws) w.reject(REPORTED);
}

// s454 (U1b) — THE ONE REPORTER of host errors that surface asynchronously (a
// throw in a continuation, a rejected suspension value). Default: the console.
// `setHostErrorReporter` (tests, devtools) replaces it and returns the old one.
let hostErrorReporter = (e) => {
  try { console.error("scrml: a host error in a continuation —", e); } catch { /* nothing to do */ }
};
export function setHostErrorReporter(fn) {
  const prev = hostErrorReporter;
  hostErrorReporter = fn;
  return prev;
}
export function reportHostError(e) {
  try { hostErrorReporter(e); } catch { /* a throwing reporter must not escape */ }
}

// ---------------------------------------------------------------------------
// `reset-on=[@a, @b]` on a cell (SPEC §6.8.4).
//
// A ResetOn observes its trigger cells. When one changes, the reset is
// applied AT ONCE — right after the write has marked every observer, inside
// the writing cell's own batch, before that batch flushes — so every render
// effect and every `<effect>` that the trigger and the reset both reach is
// queued once and runs once, after both, seeing the reset value (rule 4: "The
// triggering write and the resets it causes are ONE change for every
// dependent"). A handler that reads the reset cell after writing the trigger
// sees the reset value too.
//
// A chain (`a` resets on `b`, `b` resets on `c`) is applied in RANK order —
// the cell's depth in the static reset-on graph, computed by the compiler —
// so every reset in one drain runs after the resets it depends on, and each
// cell is reset at most once per drain. The graph is acyclic (E-RESET-ON-CYCLE,
// a compile-time error), so a drain ends by construction: there is no counter
// or bound here, and one would mean the compile-time rule had a hole.
// ---------------------------------------------------------------------------
const pendingResets = new Set();
let drainingResets = false;
// #1941 fix r1 (MED-2) — §38.4.2 "A `reset-on=` reset of a cell that is NOT a channel cell is made
// when, and only when, the value the client SHOWS of a trigger changes across the received unit": while a channel applies a
// received unit, `resetGuard` holds that channel's cells; a reset that would write any other cell
// is not made then (`Cell.set`), but deferred to the unit's end (`channel` — unit). `runningReset`
// is the reset `drainResets` is running (a drain never nests, so its writes are that reset's own).
let resetGuard = null;
let runningReset = null;

class ResetOn {
  constructor(scope, triggers, reset, rank) {
    this.triggers = triggers;
    this.reset = reset;
    this.rank = rank;
    this.disposed = false;
    for (const t of triggers) t.observers.add(this);
    scope.own(() => {
      this.disposed = true;
      pendingResets.delete(this);
      for (const t of this.triggers) t.observers.delete(this);
    });
  }
  markStale() {
    if (!this.disposed) pendingResets.add(this);
  }
}

// Apply the pending resets, lowest rank first (Cell.set calls it once every
// observer of the write is marked). A reset's own write queues the resets
// downstream of it (higher ranks) into the same loop.
function drainResets() {
  if (drainingResets || pendingResets.size === 0) return;
  drainingResets = true;
  try {
    while (pendingResets.size > 0) {
      let next = null;
      for (const r of pendingResets) if (next === null || r.rank < next.rank) next = r;
      pendingResets.delete(next);
      if (!next.disposed) {
        runningReset = next;
        try { batch(() => untrack(next.reset)); } finally { runningReset = null; }
      }
    }
  } finally {
    drainingResets = false;
  }
}

/**
 * Register a cell's `reset-on=` rule in `scope` (§6.8.4): when a `triggers`
 * cell changes, `reset()` writes the cell's reset value, in rank order within
 * the triggering write's flush.
 */
export function resetOn(scope, triggers, reset, rank) {
  requireScope(scope, "a reset-on= rule");
  if (triggers.length === 0) throw new Error("reset-on= needs at least one cell (§6.8.4, E-RESET-ON-INVALID-ENTRY)");
  for (const t of triggers) {
    if (!(t instanceof Cell)) throw new Error("a reset-on= entry must be a mutable cell (§6.8.4, E-RESET-ON-INVALID-ENTRY)");
  }
  new ResetOn(scope, triggers, reset, rank);
}

/** A writable cell holding `v`. */
export function cell(v) { return new Cell(v); }

/**
 * A `let` / seeded field: evaluated ONCE, untracked, then independent (§66.9).
 * Outside construction it is evaluated immediately. During construction it is
 * OWED: evaluated on first demand or when the outermost construction ends —
 * so a seed may read any record of the construction tree, whatever the order
 * the factories allocated them in (L12 (b)).
 */
export function seeded(init) {
  if (constructing === 0) return new Cell(untrack(init));
  const c = new Cell(undefined);
  c.pending = init;
  owed.push(c);
  return c;
}

/** A locked field: recomputes from its initializer (derived when it reads cells, §66.9). */
export function derived(scope, init) { return new Derived(scope, init); }

// ---------------------------------------------------------------------------
// Declarations and instances (§5.1, §5.2).
// ---------------------------------------------------------------------------
let nextDeclId = 0;
const registry = new Map();
export const devtools = {
  instances: registry,
  /** The devtools/SSR key `d<decl>.i<id>.f<field>` — never used for access. */
  key: (inst, field) => `d${inst.decl.id}.i${inst.id}.f${field}`,
};

/**
 * A declaration descriptor: its name and field names (for snapshots and
 * devtools). `opts.checks[i]` lists field i's validators (§55.1, built with
 * `check.*`); `opts.topLevel` says the fields are top-level values (the
 * program's cells), each with its own `submitted` (§55.5.1 rule 6) — a user
 * declaration's fields share their instance's (§55.7).
 */
export function declare(name, fields, opts = {}) {
  return {
    id: nextDeclId++, name, fields: Object.freeze(fields), nextId: 1, shared: null,
    checks: opts.checks ?? [], topLevel: opts.topLevel === true,
  };
}

/** An instance record (§5.1): an identity holding one signal per field. */
export class Instance {
  constructor(id, decl, scope) {
    this.id = id;
    this.decl = decl;
    this.fields = [];
    this.handles = [];
    // The instances its `renders` mounts UNCONDITIONALLY, created with this
    // record (L12 (b)) — in document order; render_<decl> mounts them.
    this.kids = [];
    // The construction initializer of a field a `reset` re-runs (D15): the
    // use-site value's thunk, else the declared default's.
    this.inits = [];
    this.scope = scope;
    // The validity surface (§55), created on first use: one record per field
    // (`validity`), the compound (`compound`) and the compound's `submitted`.
    this.validity = [];
    this.compound = null;
    this.submittedCell = null;
  }
}

/**
 * Run a factory body (L12 (b)): records are allocated and their fields,
 * handles and unconditional child instances created before any initializer is
 * evaluated; the seeds owed by the whole construction tree are settled when
 * the OUTERMOST construction ends, before any render, handler or user call.
 */
export function construct(inst, body) {
  constructing++;
  try { body(); } finally { constructing--; }
  if (constructing === 0) {
    const due = owed;
    owed = [];
    // s482: a held seed is computed at its place in the program body's run (`seed`), not here
    for (const c of due) if (c.pending !== null && !c.held) c.settle();
  }
  return inst;
}

/**
 * s482 — §7.6 rule (b) S482 (ruling:user-voice-scrml.md-S481-run-order-followups item 1): "each seed
 * is computed at its place in the sequence; records are still created at construction, so component
 * identity (L12) is unchanged; a read of a seed before its place computes it early, on demand."
 * `hold(x)` — called by the program's factory, inside its construction — marks the seeds still owed
 * in `x` (a field's cell, or an instance record and the records it mounts) as HELD: the end of the
 * construction leaves them owed. `seed` / `seedAll` run them at their place; a read (`get` / `peek`)
 * or a write before it runs them then.
 */
export function hold(x) {
  if (x instanceof Cell) {
    if (x.pending !== null && x.pending !== SEEDING) x.held = true;
    return;
  }
  if (x instanceof Instance) {
    for (const f of x.fields) hold(f);
    for (const k of x.kids) hold(k);
  }
}

/** s482 — a held seed's place: run it now, unless it already ran (a read or a write ran it early). */
export function seed(c) {
  if (c instanceof Cell && c.pending !== null && c.pending !== SEEDING) c.settle();
}

/** s482 — an instance's place: every seed it holds, and those of the records it mounts, in field order. */
export function seedAll(inst) {
  for (const f of inst.fields) seed(f);
  for (const k of inst.kids) seedAll(k);
}

/** Allocate an instance record owned by `parentScope`. The factory seeds its fields. */
export function instance(decl, parentScope, id) {
  requireScope(parentScope, "an instance");
  const scope = parentScope.child();
  const inst = new Instance(id ?? decl.nextId++, decl, scope);
  const k = `d${decl.id}.i${inst.id}`;
  registry.set(k, inst);
  stats.instances++;
  scope.own(() => { registry.delete(k); stats.instances--; });
  return inst;
}

/**
 * The declaration's shared instance: id 0, created on first reference
 * (§66.6.4). It is registered BEFORE its factory runs, so a function the
 * construction calls (a seed's initializer) reaches this record, not a second one.
 */
export function shared(decl, factory) {
  if (decl.shared === null) {
    const inst = instance(decl, root, 0);
    decl.shared = inst;
    factory(inst);
  }
  return decl.shared;
}

/** `@x` of a declaration: a struct snapshot of its fields — a new value (§66.7.1, §66.10). */
export function snapshot(inst) {
  const out = {};
  inst.decl.fields.forEach((name, i) => { out[name] = inst.fields[i].get(); });
  return out;
}

/** Field `i`'s construction initializer, evaluated again, untracked (a `reset`, L4 / D15). */
export function initial(inst, i) { return untrack(inst.inits[i]); }

/** An `as=` handle cell: holds an Instance identity or `not` (null), never a value. */
export function handle() { return new Cell(null); }

/** Point an `as=` handle at `inst` while it lives; clear it to `not` (null) on dispose (§5.2 (5)). */
export function bindHandle(handle, inst) {
  handle.set(inst);
  inst.scope.own(() => { if (handle.peek() === inst) handle.set(null); });
}

/** An attribute declared with no default, reached with no use-site value (⚑ O33 — not ruled). */
export function noDefault(what) {
  throw new Error(`${what} has no default and no use-site value (SPEC §66.3 O33 is OPEN)`);
}

/**
 * s451 — `defer` (SPEC §19.16.2): run a block's deferred bodies at its exit, called from the
 * `finally` the printer wraps the block in. Last registered runs first (LIFO). A host error in
 * one does not stop the others; after all have run, the FIRST such error is rethrown — replacing
 * an error already in flight, as a host `finally` does.
 */
export function runDefers(stack) {
  let failed = false;
  let first;
  for (let i = stack.length - 1; i >= 0; i--) {
    try {
      stack[i]();
    } catch (e) {
      if (!failed) { failed = true; first = e; }
    }
  }
  if (failed) throw first;
}

/**
 * s471 — a loop that WAITS (SPEC §49.12.7: "A server call in a loop body of a function is
 * awaited once per iteration"; Core: a Loop whose body holds a Suspend, after the Join of its
 * exit). The printer makes each iteration ONE call of `iterate`, whose parameters are that
 * iteration's own bindings — so a continuation that resumes after a wait sees its iteration's
 * values, never a later one (§49.3.7). Every path through an iteration ends by returning
 * `next(…)` (the next iteration: `continue`, or falling off the body), the loop's exit
 * continuation (`break`, or a head that is done), or a suspension whose continuation does one
 * of those later.
 *
 * `next` never recurses: an iteration that completes WITHOUT waiting hands its successor back
 * to the loop below, which runs it after the current iteration returns — so a loop of any
 * length runs in constant stack whether its iterations wait or not. An iteration resumed by a
 * continuation (after a wait) starts the loop again from there.
 */
export function cycle(iterate) {
  let driving = false;
  let queued = null;
  const next = (...state) => {
    queued = state;
    if (driving) return;
    driving = true;
    try {
      while (queued !== null) {
        const s = queued;
        queued = null;
        iterate(...s);
      }
    } finally {
      driving = false;
    }
  };
  return next;
}

// ---------------------------------------------------------------------------
// s451 (Ue) — the error model (SPEC §19). "There is NO try/catch. There are
// NO exceptions. Errors are values" (§19.1): a `!` function that fails RETURNS
// a failure — `fail` and `?` print as `return rt.failure(<error value>)` — and the
// caller's Attempt asks `rt.failed(result)` before it uses the result. A
// failure is an instance of this module-private class, so no value a scrml
// program can build (scrml has no classes and no `new`) is ever mistaken for
// one, whatever its shape; `error` is the ordinary enum value of the
// function's error type (a nullary variant's tag, or `{ tag, …fields }`).
// A host error (§19.6.8) is never a failure, and a failure never throws.
// ---------------------------------------------------------------------------
class Failure {
  constructor(error) {
    this.error = error;
    Object.freeze(this);
  }
}

/** A failure carrying the error value `error` — what `fail E.V(…)` returns. */
export function failure(error) {
  return new Failure(error);
}

/** Is `result` (a failable call's result) a failure? */
export function failed(result) {
  return result instanceof Failure;
}

/**
 * s474 — the fall-through of a handled failure that no arm names (print.scrml errArmsJs).
 * Unreachable: the compiler proves every handling form's arms total over the error enum
 * (analyze E-TYPE-020 / E-TYPE-080 / E-MATCH-ELSE-ABSORBS-ERROR; check.scrml C-E2), and a
 * `match`'s `else` covers the success value only. If a failure ever reaches it, the program
 * FAILS CLOSED here: it throws (never a `!` error, so no scrml arm can take it), and never
 * runs another arm's body or the `else`. Ruling: user-voice-scrml.md S474 "`else` on a
 * failable match" (PERMANENT, security). Only the variant's tag and the enum name are in
 * the message (no payload). On the server, the request fails as an internal error.
 * s475 (g-boot-unmatched-failure-tag-uncapped-s474): the tag is echoed only when it is an
 * identifier of at most 64 characters (a variant name); any other string — a raw string
 * error, a forged `variant` — is "?", so a defect never copies an arbitrary value into the
 * server log or the browser console. INTERIM: this stays a plain-Error defect assertion,
 * not a §19.17 trap code, until §19.16.3 rule 3 ("a failure outside the declared enum")
 * gets a normative run-time code.
 */
const UNMATCHED_TAG = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
export function unmatchedFailure(error, enumName) {
  const raw = typeof error === "string" ? error : (error !== null && typeof error === "object" && typeof error.variant === "string" ? error.variant : "?");
  const tag = UNMATCHED_TAG.test(raw) ? raw : "?";
  throw new Error("internal: a failure (" + enumName + "." + tag + ") reached no arm of its handler. The compiler proves the arms total, so this is a compiler defect; please report it. Failing closed: no arm ran.");
}

// ---------------------------------------------------------------------------
// The validity surface (SPEC §55.5–§55.8, §55.12, §55.13).
//
// A field's surface is a RECORD created on first use (a read, a bind, a
// gate): `errors` is a Derived over the field's value — recomputed when the
// value changes, never on read (§55.2 "reactive recompute") — and `touched`
// is a Cell only the runtime writes (first `bind:` change or first focus-out,
// §55.7; a gate's touch, §55.17.3 step 1; cleared by a reset, §55.13).
// `submitted` belongs to a top-level value itself (§55.5.1 rule 6) or, for a
// field of a user declaration, to its instance — the compound (§55.7). No
// program can write any of them: Core has no write capability for a surface
// (E-SYNTHESIZED-WRITE is a compile-time error), and these setters are not
// reachable from compiled code except through the gate, a bind and a reset.
//
// The validators (§55.1) a field carries arrive as `check.*` descriptors,
// in declaration order. An error is a ValidationError tag (§55.9) in the
// bootstrap's enum layout: a nullary variant is its tag string ("Required"),
// a variant with fields is `{ tag, ...fields }`.
// ---------------------------------------------------------------------------

const absent = (v) => v === null || v === undefined;

function lengthHolds(len, op, n) {
  switch (op) {
    case ">=": return len >= n;
    case ">": return len > n;
    case "<=": return len <= n;
    case "<": return len < n;
    case "==": return len === n;
    default: throw new Error(`length(${op} ${n}): unknown comparison`);
  }
}

/**
 * The validators the bootstrap evaluates (§55.1). Each `test(value)` returns
 * the ValidationError tag of a failure, or null. `req` short-circuits
 * (§55.12): when it fails, the field reports `.Required` alone. A value that
 * is absent (`not`) fails only `req`; the other predicates are about a
 * length / a number / a string the absent value does not have (agent
 * reading — §55.12 states the short-circuit only for `req` / `is some`).
 */
export const check = {
  req: () => ({ shortCircuit: true, test: (v) => (absent(v) || v === "" ? "Required" : null) }),
  length: (op, n) => ({
    test: (v) => (absent(v) || lengthHolds(typeof v === "string" ? strLength(v) : v.length, op, n) ? null : { tag: "LengthFailed", predicate: `(${op}${n})` }),
  }),
  min: (n) => ({ test: (v) => (absent(v) || v >= n ? null : { tag: "MinFailed", threshold: n }) }),
  max: (n) => ({ test: (v) => (absent(v) || v <= n ? null : { tag: "MaxFailed", threshold: n }) }),
  pattern: (source) => {
    const re = new RegExp(source);
    return { test: (v) => (absent(v) || re.test(v) ? null : { tag: "PatternMismatch", re: source }) };
  },
};

/** Every failing validator's error, in declaration order; `req` short-circuits (§55.12). */
function runChecks(checks, v) {
  const out = [];
  for (const c of checks) {
    const err = c.test(v);
    if (err === null) continue;
    if (c.shortCircuit) return [err];
    out.push(err);
  }
  return out;
}

// §55.10 Level 3 — the shipped English defaults (impl#1's wording, the same
// catalogue `scrml:data` ships). Levels 1 / 2 are not in the bootstrap (a
// Level-1 message is refused at compile time).
function messageFor(err, field) {
  const tag = typeof err === "string" ? err : err.tag;
  switch (tag) {
    case "Required": return `${field} is required.`;
    case "LengthFailed": return `${field} length must satisfy ${err.predicate.slice(1, -1)}.`;
    case "PatternMismatch": return `${field} doesn't match the expected format.`;
    case "MinFailed": return `${field} must be at least ${err.threshold}.`;
    case "MaxFailed": return `${field} must be at most ${err.threshold}.`;
    default: return `${field} is invalid.`;
  }
}

/** The compound's `submitted` (§55.7): one per instance of a user declaration. */
function compoundSubmitted(inst) {
  if (inst.submittedCell === null) inst.submittedCell = new Cell(false);
  return inst.submittedCell;
}

/**
 * Field `i`'s validity record (§55.6; §55.5.1 for a top-level value).
 * `validated` — the field carries validators (only those gate a form,
 * §55.17.3); a field with none reads trivially valid (Edge B).
 */
export function validity(inst, i) {
  const have = inst.validity[i];
  if (have) return have;
  const checks = inst.decl.checks[i] ?? [];
  const value = inst.fields[i];
  const name = inst.decl.fields[i];
  const errors = checks.length === 0 ? null : new Derived(inst.scope, () => runChecks(checks, value.get()));
  const touched = new Cell(false);
  const submitted = inst.decl.topLevel ? new Cell(false) : compoundSubmitted(inst);
  const rec = {
    name,
    validated: checks.length > 0,
    errors: () => (errors === null ? [] : errors.get()),
    isValid: () => (errors === null ? true : errors.get().length === 0),
    touched: () => touched.get(),
    submitted: () => submitted.get(),
    messages: () => rec.errors().map((e) => messageFor(e, name)),
    touch() { touched.set(true); },
    submit() { submitted.set(true); },
    // §55.13: `reset(@x)` reverts `touched`; a top-level value's `submitted` too.
    reset() {
      batch(() => {
        touched.set(false);
        if (inst.decl.topLevel) submitted.set(false);
      });
    },
  };
  inst.validity[i] = rec;
  return rec;
}

/**
 * The compound surface of an instance of a user declaration (§55.5): valid
 * when every field is; `errors` / `touched` map field names to the per-field
 * values; `submitted` is the instance's own.
 */
export function compound(inst) {
  if (inst.compound !== null) return inst.compound;
  const recs = () => inst.decl.fields.map((_, i) => validity(inst, i));
  const submitted = compoundSubmitted(inst);
  inst.compound = {
    isValid: () => recs().every((r) => r.isValid()),
    errors: () => Object.fromEntries(recs().map((r) => [r.name, r.errors()])),
    touched: () => Object.fromEntries(recs().map((r) => [r.name, r.touched()])),
    submitted: () => submitted.get(),
    messages: () => recs().flatMap((r) => r.messages()),
  };
  return inst.compound;
}

/**
 * `<errors of=…/>` (§55.8): one `<p class="scrml-error">` per message — the
 * first only unless `all` — and NO DOM when there are none (not a hidden
 * element). Replaces the marker comment; re-renders when the errors change.
 */
export function errors(scope, marker, messages, all) {
  const end = document.createComment("/errors");
  marker.parentNode.insertBefore(end, marker.nextSibling);
  let shown = [];
  hole(scope, () => {
    const ms = messages();
    const want = all ? ms : ms.slice(0, 1);
    untrack(() => {
      for (const p of shown) p.remove();
      shown = want.map((m) => {
        const p = document.createElement("p");
        p.className = "scrml-error";
        p.textContent = m;
        end.parentNode.insertBefore(p, end);
        return p;
      });
    });
  }, () => {
    for (const p of shown) p.remove();
    shown = [];
  });
  scope.own(() => { for (const p of shown) p.remove(); end.remove(); });
}

/**
 * Field `i`'s validity record through an `as=` handle the gate reads at submit
 * (s472): an absent handle (`not`) names no instance — there is no value to
 * gate — so this gives null, which the gate skips.
 */
export function validityIf(inst, i) {
  return inst === null || inst === undefined ? null : validity(inst, i);
}

// The validity record a bound control writes to (set by `bind`): the gate
// finds a form's bound validated values through its live controls.
const boundSurface = new WeakMap();

// s472 — the fields a mounted markup list names statically (a View.Reach: a
// declaration's renders, a use's slot filler, an `<each>` row), keyed by the
// list's marker comment. A gated form gates the ones whose marker is inside it
// — how it reaches the values bound in an UNMOUNTED region of an instance a
// use, a slot filler or a row creates (§55.17.3 step 1, the composed subtree).
const reachedFields = new WeakMap();

/** Register `named()` — a markup list's statically bound surfaced fields — at its marker while it is mounted. */
export function reach(scope, marker, named) {
  requireScope(scope, "a gate reach");
  reachedFields.set(marker, named);
  scope.own(() => { if (reachedFields.get(marker) === named) reachedFields.delete(marker); });
}

/**
 * The form's surface listener (§55.7) and, when a bound value carries
 * validators, the compiler submit gate (§55.17.3). Registered BEFORE any
 * author `submit` listener of the form, so it runs first and synchronously.
 *
 * The bound values are the union of `named()` — the records of the fields the
 * form's composed subtree names statically, mounted or not (§55.17.3: the
 * values bound "inside the form (the §55.17.2 rule 1 composed subtree)") —,
 * the records every mounted Reach marker inside the form registered (s472:
 * the static names of a use's renders, a use-site slot filler, an `<each>`
 * row — the instances the form's own code cannot name), and the records of
 * the form's own live controls (`form.elements`, its HTML form owner). A null entry (an absent `as=`
 * handle) names no instance and is skipped.
 *
 * On each submit:
 *   1. touch — `touched` on every bound VALIDATED value;
 *   2. submitted — `submitted` on every bound value (a field's compound);
 *   3. block if invalid — cancel the submission (no native navigation / POST)
 *      and stop the event, so no author handler runs;
 *   4. otherwise the event proceeds to the author's handler.
 * A submitter carrying `formnovalidate` (§55.17.4) bypasses steps 1 and 3;
 * step 2 still runs. `SubmitEvent.submitter` is null for `requestSubmit()`
 * with no argument — that submit is gated.
 */
export function gate(scope, form, named) {
  requireScope(scope, "a submit gate");
  const h = (e) => batch(() => {
    const recs = new Set();
    const add = (rs) => { for (const r of rs) if (r !== null) recs.add(r); };
    add(named());
    // s480 r4 (review of #2017, N1): an element held out by a trapped attribute (§19.17) is still
    // inside the form — §55.17.2 rule 1's "contains" is the COMPOSED markup, not the live tree. Its
    // placeholder stands in its place, so the walk goes on into the held element's own subtree
    // (and into any element held inside that one): an invalid instance in it still blocks.
    const walk = (root) => {
      const marks = form.ownerDocument.createTreeWalker(root, 0x80 /* NodeFilter.SHOW_COMMENT */);
      for (let c = marks.nextNode(); c !== null; c = marks.nextNode()) {
        const reached = reachedFields.get(c);
        if (reached) add(reached());
        const held = holeMate.get(c);
        if (held !== undefined && held.nodeType === 1) walk(held);
      }
    };
    walk(form);
    // s472: the form's OWN controls, as HTML associates them (`form.elements`
    // — its form owner): a control outside it carrying `form="<its id>"` is
    // included, a control inside it that names another form is not (RULED
    // S472, §55.17.3 "The HTML form owner").
    for (const el of form.elements) {
      const rec = boundSurface.get(el);
      if (rec) recs.add(rec);
    }
    const bypass = e.submitter != null && e.submitter.hasAttribute("formnovalidate");
    for (const r of recs) r.submit();
    if (bypass) return;
    let valid = true;
    for (const r of recs) {
      if (!r.validated) continue;
      r.touch();
      if (!r.isValid()) valid = false;
    }
    if (!valid) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  });
  form.addEventListener("submit", h);
  stats.listeners++;
  scope.own(() => { form.removeEventListener("submit", h); stats.listeners--; });
}

// ---------------------------------------------------------------------------
// Writes (§6.2). Every write is one signal set of a NEW value.
// ---------------------------------------------------------------------------

/** A `rule=` graph edge table, shared by every instance of the declaration (§5.4). */
export function edges(table) { return table; }

/**
 * The runtime edge check alone (§6.3): throws unless `to` is reachable from the
 * current state in one edge. A self-write passes (§51.0.F.1). Writes nothing —
 * an all-or-nothing spread edit (RULED S440) checks every edge before any write.
 */
export function checkEdge(target, table, to) {
  // s469 (g-bootstrap-rule-transition-into-payload-variant-s469): the graph is
  // over VARIANTS — a payload value `{ variant, data }` is judged by its tag
  // (the edge table's keys and entries are tags), never by object identity.
  const cur = target.peek();
  const from = variantTag(cur);
  const toTag = variantTag(to);
  const allowed = table[from];
  if (from === toTag) {
    // §51.0.F.1: a self-write is a NO-OP — the value is unchanged. A same-variant write that
    // CHANGES the payload is not a no-op, so it needs a self-edge in the graph (fail closed).
    if (cur === to || JSON.stringify(cur) === JSON.stringify(to)) return;
    if (allowed && allowed.includes(toTag)) return;
    throw new Error(`E-ENGINE-INVALID-TRANSITION: .${from} → .${toTag} changes the payload of .${from} and .${from} has no self-edge in this field's rule= graph`);
  }
  if (!allowed || !allowed.includes(toTag)) {
    throw new Error(`E-ENGINE-INVALID-TRANSITION: .${from} → .${toTag} is not an edge of this field's rule= graph`);
  }
}

/** An enum value's variant tag: a unit variant is its tag; a payload variant is `{ variant, data }`. */
function variantTag(v) {
  return v !== null && typeof v === "object" && typeof v.variant === "string" ? v.variant : v;
}

/**
 * A graph write with a runtime edge check (§6.3). A self-write is a no-op (§51.0.F.1).
 * On a timed engine cell the check runs when the held write commits, not here (§6.13.5).
 */
export function transition(target, table, to) {
  if (!timedEdgeJudged(target)) checkEdge(target, table, to);
  asOp(target, "transition", to, () => target.set(to));
}

// ---------------------------------------------------------------------------
// s478 — `<onIdle after=DURATION to=.Variant/>` (SPEC §51.0.R), the engine-wide
// event-timeout watchdog of a graph field. The compiler emits
// `idleWatch(inst$.scope, <cell>, <edges>, ms, "<to tag>")` with the record.
//   1. "Armed at module-init alongside the engine variant cell … the timer arms
//      with the full duration remaining" — armed here, at construction.
//   2. "Reset on every successful transition (clear + re-arm)" — the watchdog
//      observes the cell: every COMMITTED change re-arms it. A self-write is a
//      no-op that changes nothing (§51.0.F.1), so it does not reset.
//   3. "rule=-honoring fire … The destination variant's `rule=` validation
//      applies … If the current state's `rule=` does not permit `to=.Variant`,
//      `E-ENGINE-INVALID-TRANSITION` fires at runtime" — the fire is the
//      ordinary graph write (`transition`: the edge check, then `set`); a
//      refused edge is reported (never thrown into a timer frame) and the
//      watchdog stays disarmed until the next transition.
// A watchdog-induced write is a write like any other: it notifies, so it
// re-arms the watchdog (its own transition) as rule 2 says. Owned by `scope`.
// S479 — on a `debounced=` / `throttled=` engine the fire bypasses the timing
// rule and cancels a held write (`idleFire`; §51.0.R, ruling S479 item 2).
// ---------------------------------------------------------------------------
export function idleWatch(scope, c, table, ms, to) {
  requireScope(scope, "an idle watchdog");
  const w = {
    timer: null,
    disposed: false,
    arm() {
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.fire(), ms);
    },
    fire() {
      this.timer = null;
      if (this.disposed) return;
      try {
        batch(() => (c.timing !== null ? idleFire(c, table, to) : transition(c, table, to)));
      } catch (err) {
        reportLater(err);
      }
    },
    markStale() {
      if (!this.disposed) this.arm();
    },
  };
  c.observers.add(w);
  scope.own(() => {
    w.disposed = true;
    c.observers.delete(w);
    if (w.timer !== null) clearTimeout(w.timer);
    w.timer = null;
  });
  w.arm();
  return w;
}

// s478 (s478-boot-channel-ops) — SPEC §38.4.2: a write to a channel cell is sent as the EDIT it
// made. The edit helpers below name their op around their one `set` (`syncOp`, read by
// `Cell.land` for that target only); every other write reaches a channel cell's sink as null —
// a whole-value write. A cell outside a channel (`sync` null) pays one property read.
let syncOp = null;
function asOp(target, k, val, write) {
  if (!target.sync) { write(); return; }
  const prev = syncOp;
  syncOp = { target, k, val };
  try { write(); } finally { syncOp = prev; }
}
/** An end-append edit: a new array one longer (O(n) copy — dpa-051 §6.1). */
export function append(target, element) { asOp(target, "append", element, () => target.set([...target.peek(), element])); }
/** A front-prepend edit. */
export function prepend(target, element) { asOp(target, "prepend", element, () => target.set([element, ...target.peek()])); }
/** A removal of `n` elements at the end (`pop()`, n = 1): a new, shorter array. An empty sequence stays empty. */
export function removeEnd(target, n) {
  const xs = target.peek();
  asOp(target, "pop", Math.min(n, xs.length), () => target.set(xs.slice(0, Math.max(0, xs.length - n))));
}
/** A removal of `n` elements at the front (`shift()`, n = 1). */
export function removeFront(target, n) {
  const xs = target.peek();
  asOp(target, "shift", Math.min(Math.max(0, n), xs.length), () => target.set(xs.slice(n)));
}
/**
 * A write of struct path `path` inside the element at position `index`
 * (`@xs[i].f = v`, dpa-052 Q3). s473 — a position outside the sequence
 * (negative, at or past the end, or not an int) is the E-INDEX-OUT-OF-RANGE-RT
 * trap, as every position write's is (SPEC §66.12.6 rule 3, ruled S473 "A write
 * past the end of a tape position: runtime TRAP"; §19.17): nothing is written —
 * a write never grows or pads a sequence. `at` is the source location.
 */
export function setAt(target, index, path, v, at) {
  const xs = target.peek();
  if (!Number.isInteger(index)) {
    throw new ScrmlTrap("E-INDEX-OUT-OF-RANGE-RT", `index ${JSON.stringify(index)} is not a sequence position (an int) (${at}) — nothing was written`, { index, length: xs.length, at });
  }
  if (index < 0 || index >= xs.length) {
    const has = xs.length === 0 ? "the sequence is empty" : `its positions are 0..${xs.length - 1}`;
    throw new ScrmlTrap("E-INDEX-OUT-OF-RANGE-RT", `position ${index} is outside the sequence (${has}) (${at}) — nothing was written`, { index, length: xs.length, at });
  }
  // the rest of the path through the CHECKED writer (s473 review LOW-3): a position step
  // inside `path` is range-checked too — never padded, as the unchecked setIn would
  target.set(writePath(xs, [index, ...path], v, at));
}
/**
 * s472 — a POSITION write of a cell's tape, `@xs[i] = v` (SPEC §66.12.6 rule 3,
 * granted by `write`): a new tape with `v` at position `index`, set as the
 * cell's ONE new value, so it notifies exactly as a whole-value write does
 * (§66.11.7). An index outside the tape (negative, at or past the end, or not an
 * int) is the E-INDEX-OUT-OF-RANGE-RT trap and nothing is written — a write never
 * grows or pads a tape (§66.12.6 rule 3, §66.12.8 rule 7).
 */
export function setPosition(target, index, v, at) {
  target.set(writePath(target.peek(), [index], v, at));
}
/**
 * s472 — a write to a PART of a value (a local's `p.f = v`, `xs[i] = v`,
 * `a.xs[i].f = v`): a COPY of `value` with `v` at `path`, sharing every untouched
 * branch with the old value; the old value is never mutated (values are
 * immutable, §66.10 — no alias sees the write). A step into a tape (an Array) is
 * a position: it must be an int index `0 <= i < length`, else the
 * E-INDEX-OUT-OF-RANGE-RT trap, before anything is built. A step into a struct is
 * a field name the compiler wrote. Anything else is a compiler defect — refused,
 * never guessed.
 */
export function writePath(value, path, v, at) {
  const go = (obj, i) => {
    if (i === path.length) return v;
    const k = path[i];
    if (Array.isArray(obj)) {
      if (!Number.isInteger(k) || k < 0 || k >= obj.length) {
        throw new ScrmlTrap("E-INDEX-OUT-OF-RANGE-RT", "index " + k + " is out of range for a tape of length " + obj.length + " (" + at + ") — nothing was written", { index: k, length: obj.length, at });
      }
      const copy = obj.slice();
      copy[k] = go(obj[k], i + 1);
      return copy;
    }
    if (obj === null || typeof obj !== "object" || typeof k !== "string" || !Object.prototype.hasOwnProperty.call(obj, k)) {
      throw new Error("internal: a part write steps into `" + String(k) + "`, which is not a field of the value here (a bootstrap defect — please report it)");
    }
    return { ...obj, [k]: go(obj[k], i + 1) };
  };
  return go(value, 0);
}
/**
 * A write at `path` (struct property names / sequence indices): a new value
 * along the path, sharing every untouched branch with the old one.
 */
export function setIn(target, path, v) {
  const go = (obj, i) => {
    if (i === path.length) return v;
    const k = path[i];
    const copy = Array.isArray(obj) ? obj.slice() : { ...obj };
    copy[k] = go(obj[k], i + 1);
    return copy;
  };
  target.set(go(target.peek(), 0));
}

// ---------------------------------------------------------------------------
// s469 — reading a tape by position (SPEC §49.13), and the trap (§19.17).
//
// A TRAP is a defined runtime error that is not a scrml `!` error value: no
// `!{}`, `?` or `match` sees it. It stops the current unit of execution at
// the trapping expression (an event handler, a render, an effect, a server
// request) — here, by throwing a `ScrmlTrap`, which carries the code and, for
// E-INDEX-OUT-OF-RANGE-RT, the index, the length and the source location. It
// is never caught here: it reaches the host's error reporting (the console;
// on the server, a fixed 500).
export class ScrmlTrap extends Error {
  constructor(code, message, detail) {
    super(code + ": " + message);
    this.name = "ScrmlTrap";
    this.code = code;
    this.detail = detail;
  }
}

/** `xs[i]` (§49.13): the element when `0 <= i < xs.length`; otherwise the E-INDEX-OUT-OF-RANGE-RT trap — never `undefined`. */
export function indexRead(xs, i, at) {
  // s469 — `s[i]` on a string (§66.12.8 rule 6): the code point at position `i`, positions in code
  // points; out of range (a negative `i` included, rule 7) the same trap, naming the code-point length
  if (typeof xs === "string") {
    const cps = codePoints(xs);
    if (Number.isInteger(i) && i >= 0 && i < cps.length) return cps[i];
    throw new ScrmlTrap("E-INDEX-OUT-OF-RANGE-RT", "index " + i + " is out of range for a string of length " + cps.length + " (" + at + ")", { index: i, length: cps.length, at });
  }
  if (Number.isInteger(i) && i >= 0 && i < xs.length) return xs[i];
  throw new ScrmlTrap("E-INDEX-OUT-OF-RANGE-RT", "index " + i + " is out of range for a tape of length " + xs.length + " (" + at + ")", { index: i, length: xs.length, at });
}

/** `xs.at(i)` (§49.13): the element, or `not` when `i` is out of range — a negative `i` included (no counting from the end). Never a trap. */
export function atRead(xs, i) {
  if (Number.isInteger(i) && i >= 0 && i < xs.length) return xs[i];
  return null;
}

// ---------------------------------------------------------------------------
// s472 (boot-math-port) — the RETURN-POINT DECODE of a host-backed function
// (SPEC §21.3.1; ruling:user-voice-scrml.md S472 "host function type, math
// API, remaining review debt" item 1 — "the returned value is decoded against
// [the wrapper's declared type] at that point", the boundary decode of
// scrml-support/docs/deep-dives/typed-host-binding-f3-design-2026-10-27.md
// §5.4). The value a host function returned must FIT the declared type; it is
// never coerced:
//   - `int`: a number, integral, within ±(2^53−1); `number`: a number; `string`:
//     a string; `bool`: a boolean;
//   - `T | not`: JS `null` / `undefined` is `not` (null); anything else is
//     decoded as `T`;
//   - a non-optional `T` receiving `null` / `undefined` is a mismatch ("no
//     null" holds at the one door where JS nulls enter);
//   - a thenable is a mismatch (a host binding is never a waiting value — a
//     discarded host Promise would otherwise fail open).
// A mismatch is the trap E-HOST-VALUE-MISMATCH-RT (§19.17): the DECLARATION is
// wrong, not the call. `ty` is the printer's descriptor (print.scrml
// hostTypeJs: `{ k: "int" | "number" | "string" | "bool" }` or
// `{ k: "maybe", inner }`); `at` names the function and its host module.
// ---------------------------------------------------------------------------
const MAX_EXACT_INT = 9007199254740991; // 2^53 − 1

function hostShow(v) {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "bigint") return String(v) + "n";
  if (typeof v === "function") return "a function";
  return "a " + (Array.isArray(v) ? "sequence" : typeof v);
}

function hostMismatch(v, want, at) {
  throw new ScrmlTrap("E-HOST-VALUE-MISMATCH-RT", at + " returned " + hostShow(v) + " where its declared type is " + want + " — the declaration does not describe the host function", { value: hostShow(v), want, at });
}

function hostWant(ty) {
  return ty.k === "maybe" ? hostWant(ty.inner) + " | not" : ty.k;
}

export function hostResult(v, ty, at) {
  const isThenable = v !== null && (typeof v === "object" || typeof v === "function") && typeof v.then === "function";
  if (isThenable) hostMismatch(v, hostWant(ty) + " (a host binding is not a waiting value)", at);
  if (ty.k === "maybe") {
    if (v === null || v === undefined) return null;
    return hostResult(v, ty.inner, at);
  }
  switch (ty.k) {
    case "int":
      if (typeof v === "number" && Number.isInteger(v) && Math.abs(v) <= MAX_EXACT_INT) return v === 0 ? 0 : v;
      break;
    case "number":
      if (typeof v === "number") return v;
      break;
    case "string":
      if (typeof v === "string") return v;
      break;
    case "bool":
      if (typeof v === "boolean") return v;
      break;
    default:
      throw new Error("hostResult: unknown descriptor " + JSON.stringify(ty) + " (a compiler defect — check.scrml C-H2)");
  }
  return hostMismatch(v, hostWant(ty), at);
}

// ---------------------------------------------------------------------------
// s473 (boot-host-block-f3) — `<host>` BINDINGS (DRAFT SPEC §21.3.3). The
// printer (print.scrml hostBindJs) emits each binding as
//   function name(p…) { return rt.hostCall(() => <target>, <descriptor>, "<at>") }
// with the target as literal JavaScript (rule 7). `hostCall` evaluates it and:
//   - a THROW is the trap E-HOST-THROW-RT (rule 18: "A binding not declared `!
//     HostError` whose target throws … SHALL raise the trap `E-HOST-THROW-RT`").
//     Its text is built without running a conversion of a host object (rule 18:
//     `message` / `name` read once; "no `toString`, `valueOf` or
//     `Symbol.toPrimitive` of a thrown object is called");
//   - the result is DECODED against the declared type (rule 13 — "SHALL NOT be
//     coerced. The decode reads host data, not wire data, so it SHALL read only
//     what it inspects, and only once"):
//       scalars by `typeof` (a boxed `new String("x")` is a mismatch); `int`
//       integral within ±(2^53−1); `T | not`: null / undefined is `not`; a
//       non-optional type receiving null / undefined is a mismatch;
//       a struct: each declared field read ONCE by ordinary property access,
//       ABSENT when the prototype chain does not have it below
//       `Object.prototype` ("so a polluted `Object.prototype` cannot supply a
//       field") — a WebIDL accessor on an interface prototype IS found, and its
//       getter runs once; undeclared members dropped; the copy is built with
//       defineProperty, so a field named `__proto__` stays data;
//       a tape: `Array.isArray` true (a NodeList / HTMLCollection is not), its
//       `length` and each element read once; an absent index is absent;
//       a declared `:host` handle: not decoded, but never null / undefined;
//       a thenable result of a binding not declared waiting is a mismatch —
//       after a rejection handler is attached, so the fault is not reported a
//       second time as an unhandled rejection; the message names the fix;
//   - a throw WHILE DECODING (a getter that throws, a Proxy trap) is the trap
//     E-HOST-THROW-RT too (PA reading: the host threw; the value is never
//     admitted).
// A mismatch is E-HOST-VALUE-MISMATCH-RT (§19.17): the declaration is wrong.
// ---------------------------------------------------------------------------

/** A host root a target names (`window`, `document`, `navigator`) — read here, so no program name can shadow it. */
export function hostRoot(name) {
  switch (name) {
    case "window": return globalThis.window;
    case "document": return globalThis.document;
    case "navigator": return globalThis.navigator;
  }
  throw new Error("hostRoot: " + JSON.stringify(name) + " is not a host root (a compiler defect — check.scrml C-HB2)");
}

/** Rule 18's payload of a thrown value: `message` / `name`, each read once, no conversion of a host object. */
export function hostThrownParts(e) {
  if (e === null || (typeof e !== "object" && typeof e !== "function")) {
    let message = "a non-Error value was thrown";
    try { message = String(e); } catch { /* a primitive runs no host code; keep the fixed text */ }
    return { message, name: "UnknownThrow" };
  }
  let message;
  let name;
  try {
    const m = e.message;
    if (typeof m === "string") message = m;
  } catch { message = undefined; }
  try {
    const n = e.name;
    if (typeof n === "string" && n !== "") name = n;
  } catch { name = undefined; }
  return {
    message: message === undefined ? "a non-Error value was thrown" : message,
    name: name === undefined ? (message === undefined ? "UnknownThrow" : "Error") : name,
  };
}

function hostThrew(e, at, when) {
  const p = hostThrownParts(e);
  throw new ScrmlTrap("E-HOST-THROW-RT", at + " — the host threw " + when + ": " + p.name + ": " + p.message + " (a binding not declared `! HostError` traps on a host throw, §21.3.3 rule 18)", { at, name: p.name, message: p.message });
}

function hostShowSafe(v) {
  try { return hostShow(v); } catch { return "a value"; }
}

function hostBindMismatch(v, want, at, where) {
  const shown = hostShowSafe(v);
  throw new ScrmlTrap("E-HOST-VALUE-MISMATCH-RT", at + " — " + where + " is " + shown + " where its declared type is " + want + " — the declaration does not describe the host (§21.3.3 rule 13)", { value: shown, want, at });
}

function hostDescWant(ty) {
  switch (ty.k) {
    case "maybe": return hostDescWant(ty.inner) + " | not";
    case "tape": return hostDescWant(ty.elem) + "[]";
    case "struct": case "handle": case "iface": return ty.name;
    default: return ty.k;
  }
}

const hostOwn = Object.prototype.hasOwnProperty;

/**
 * s473 (#1659 review M1) — a STRUCT field's chain search (rule 13). A field is present when it
 * is an own property of `o` or of an intermediate prototype (a WebIDL interface prototype, whose
 * accessors carry the field), and ABSENT when it is found only on a chain-TERMINAL object — one
 * whose own prototype is `null`. That terminal is `Object.prototype` of WHATEVER realm `o` came
 * from (this realm's, or a cross-realm iframe's), so a polluted `Object.prototype` can never
 * supply a field, cross-realm included. A struct value is required to be a non-array, non-function
 * ordinary object (hostDecode), so `Array.prototype` / `Function.prototype` are never in its
 * chain; only the Object.prototype terminal is excluded.
 */
function hostHasField(o, key, at) {
  let p = o;
  for (let n = 0; n < 4096; n++) {
    if (p === null || p === undefined) return false;
    const proto = Object.getPrototypeOf(p);
    if (proto === null) return false; // p is a chain terminal (an Object.prototype of some realm) — excluded
    if (hostOwn.call(p, key)) return true;
    p = proto;
  }
  return hostBindMismatch(o, "an object whose prototype chain ends", at, "a value");
}

function hostDecode(v, ty, at, where, topThen) {
  switch (ty.k) {
    case "maybe":
      if (v === null || v === undefined) return null;
      return hostDecode(v, ty.inner, at, where);
    case "int":
      if (typeof v === "number" && Number.isInteger(v) && Math.abs(v) <= MAX_EXACT_INT) return v === 0 ? 0 : v;
      break;
    case "number":
      if (typeof v === "number") return v;
      break;
    case "string":
      if (typeof v === "string") return v;
      break;
    case "bool":
      if (typeof v === "boolean") return v;
      break;
    case "handle":
      if (v !== null && v !== undefined) return v;
      break;
    case "iface":
      // s473 (allowlist lane A) — an Appendix H interface result (DRAFT §21.3.3 r8.4 / r8.7): not
      // decoded, brand-checked (hostBrand). A failure is E-HOST-VALUE-MISMATCH-RT.
      if (hostBranded(v, ty.name)) return v;
      break;
    case "struct": {
      // s473 (#1659 review M1): a struct must be a NON-ARRAY, non-function ordinary object, so
      // its chain cannot be `Array.prototype` / `Function.prototype`; only `Object.prototype`
      // (any realm, hostHasField) is the excluded terminal.
      if (v === null || typeof v !== "object" || Array.isArray(v)) break;
      const out = {};
      for (const f of ty.fields) {
        let fv = null;
        // s473 (#1659 review M2): the top object's `then` was read once in hostCall; reuse it for a
        // field named `then` so no getter runs twice.
        if (topThen !== undefined && f.name === "then") {
          fv = hostDecode(topThen.value, f.ty, at, where + "'s field `then`");
        } else if (hostHasField(v, f.name, at)) {
          fv = hostDecode(v[f.name], f.ty, at, where + "'s field `" + f.name + "`");
        } else if (f.ty.k === "maybe") {
          fv = null;
        } else {
          return hostBindMismatch(undefined, hostDescWant(f.ty), at, where + "'s field `" + f.name + "` (absent)");
        }
        Object.defineProperty(out, f.name, { value: fv, writable: true, enumerable: true, configurable: true });
      }
      return out;
    }
    case "tape": {
      if (!Array.isArray(v)) break;
      const n = v.length;
      if (!(typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 4294967295)) break;
      const out = [];
      for (let i = 0; i < n; i++) {
        // s473 (#1659 review M1 / open Q2): a tape element counts only when it is an OWN index of
        // the array — a hole, and a polluted `Array.prototype[i]` (cross-realm included), is absent.
        if (hostOwn.call(v, String(i))) {
          out.push(hostDecode(v[i], ty.elem, at, where + "'s element " + i));
        } else if (ty.elem.k === "maybe") {
          out.push(null);
        } else {
          return hostBindMismatch(undefined, hostDescWant(ty.elem), at, where + "'s element " + i + " (absent)");
        }
      }
      return out;
    }
    default:
      throw new Error("hostCall: unknown descriptor " + JSON.stringify(ty) + " (a compiler defect — check.scrml C-HB4)");
  }
  return hostBindMismatch(v, hostDescWant(ty), at, where);
}

/** A `<host>` binding's call: evaluate the target, then decode its result (rules 13, 18). */
export function hostCall(thunk, ty, at) {
  let v;
  try {
    v = thunk();
  } catch (e) {
    if (hostGuardTraps.has(e)) throw e;
    hostThrew(e, at, "evaluating its target");
  }
  try {
    // s473 (#1659 review M2): read `then` ONCE. The value is reused for the decode of a struct
    // field named `then`, so no getter runs twice.
    let topThen;
    if (v !== null && (typeof v === "object" || typeof v === "function")) {
      const then = v.then;
      topThen = { value: then };
      if (typeof then === "function") {
        try { then.call(v, undefined, () => {}); } catch { /* no handler could be attached */ }
        return hostBindMismatch(v, (ty.k === "void" ? "nothing (no `->`)" : hostDescWant(ty)) + " and it is a thenable — the binding is not declared waiting; declare it `-> waiting void` (or `-> waiting T`)", at, "its result");
      }
    }
    if (ty.k === "void") return undefined;
    return hostDecode(v, ty, at, "its result", topThen);
  } catch (e) {
    if (e instanceof ScrmlTrap) throw e;
    return hostThrew(e, at, "while its result was decoded");
  }
}

// ---------------------------------------------------------------------------
// s473 (allowlist lane A; design scrml-support/docs/deep-dives/host-binding-allowlist-design-
// 2026-10-29.md §5.3, §5.5, §10 step 4) — the RUN-TIME half of the `<host>` allowlist (DRAFT
// §21.3.3 rule 8; ruling:user-voice-scrml.md S473 "⭐ RULED — `<host>` rule 8 moves from a sink
// denylist to an allowlist"). The compiler (the typed chain walk) chooses WHICH of these a target
// goes through. Each is a check from the closed set the design names, and each reuses an oracle
// that already exists (design C3):
//
//   - guarded(url)            hostUrl / hostAttrValue: the §5.2 rule 3 data-supplied URL guard,
//                             `_scrml_safe_url` below (the verbatim impl#1 copy). Same scheme test,
//                             same admitted set, `about:blank` plus one report on refusal. Never a
//                             second list.
//   - guarded(inert-receiver) hostInert: the receiver's local name and namespace, read through the
//                             `Element.prototype` getters CAPTURED at runtime start (never the
//                             instance's own `localName`), SHALL be HTML and on the inert element
//                             list (HOST_INERT_ELEMENTS), and its prototype SHALL be the realm's own
//                             for that tag (no customized built-in, no other realm; #1670 M1).
//                             Otherwise the trap E-HOST-RECEIVER-RT.
//   - guarded(attr-name)      hostSetAttrName: the run-time wall behind the compile-time
//                             literal-name rule (§5.2's event-handler test and `srcdoc`).
//   - brand checks (r8.7)     hostBrand / descriptor `{ k: "iface", name }`: `instanceof` the
//                             interface object CAPTURED at runtime start (another realm's object
//                             fails), plus the interface's captured WebIDL brand getter (Illegal
//                             invocation on a fake or a Proxy), plus, for an Element interface, the
//                             realm's exact prototype for the element's tag (#1670 review M2). A
//                             failure is E-HOST-VALUE-MISMATCH-RT.
//   - callback wrappers       hostCallback: a scrml function in a callback slot crosses as a
//                             wrapper, MEMOIZED per (function, signature), so
//                             `removeEventListener(t, cb)` removes what `addEventListener(t, cb)`
//                             added. Each argument the host passes is decoded (rule 13).
//
// Interface for the compiler (lane B's chain walk and the printer; recorded in
// docs/changes/s473-host-allowlist-a/progress.md "Interface"):
//   rt.hostInert(el, at)                    -> el             trap E-HOST-RECEIVER-RT
//   rt.hostUrl(el, name, value, at)         -> string         guarded(url), a property write
//   rt.hostAttrValue(el, name, value, at)   -> value | string setAttribute's value: the URL guard iff
//                                                             `name` is URL-valued on el's element
//   rt.hostSetAttrName(name, at)            -> name           guarded(attr-name), run-time wall
//   rt.hostBrand(v, iface, at, optional)    -> v | null       trap E-HOST-VALUE-MISMATCH-RT
//   rt.hostCallback(fn, argDescs, at)       -> function       memoized wrapper
//   result descriptor { k: "iface", name: "HTMLCanvasElement" } in rt.hostCall's decode.
// ---------------------------------------------------------------------------

/**
 * DRAFT Appendix H §H.4 — the INERT ELEMENT LIST: the HTML elements whose children and attributes a
 * `guarded(inert-receiver)` entry may change. An ALLOWLIST of tags (design §5.5): a new element is
 * refused until someone adds it. Deliberately NOT on it: `script`, `style`, `base`, `meta`, `link`,
 * `iframe`, `frame`, `frameset`, `object`, `embed`, `template`, `slot`, `form` (its `action` and
 * submission navigate), `noscript`, `title`, `head`, `html`, `body`, every non-HTML element (SVG,
 * MathML — the namespace test) and every custom element (a hyphenated name runs author callbacks on
 * attribute change). Lane B's host-surface.scrml mirrors Appendix H; its diff test reads this export,
 * so there is one list.
 */
export const HOST_INERT_ELEMENTS = Object.freeze([
  "a", "abbr", "article", "aside", "audio", "b", "blockquote", "br", "button", "canvas", "caption",
  "cite", "code", "col", "colgroup", "dd", "del", "details", "dfn", "div", "dl", "dt", "em",
  "fieldset", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr",
  "i", "img", "input", "ins", "kbd", "label", "legend", "li", "main", "mark", "meter", "nav", "ol",
  "optgroup", "option", "output", "p", "pre", "progress", "q", "s", "samp", "section", "select",
  "small", "span", "strong", "sub", "summary", "sup", "table", "tbody", "td", "textarea", "tfoot",
  "th", "thead", "time", "tr", "u", "ul", "var", "video", "wbr",
]);
const hostInertSet = new Set(HOST_INERT_ELEMENTS);
const HOST_HTML_NS = "http://www.w3.org/1999/xhtml";

/**
 * The platform pieces the guards read, CAPTURED ONCE when this module is evaluated (design §5.3 and
 * §5.5: "read through the `Element.prototype` getter captured at runtime start"). A later own
 * property or shadowing getter on an instance is never consulted. With no DOM at start (a server
 * realm), every guard fails closed.
 */
const hostCaps = (() => {
  const g = globalThis;
  const getter = (C, name) => {
    try {
      const d = C && C.prototype ? Object.getOwnPropertyDescriptor(C.prototype, name) : undefined;
      return d && typeof d.get === "function" ? d.get : null;
    } catch { return null; }
  };
  const Elem = typeof g.Element === "function" ? g.Element : null;
  const NodeC = typeof g.Node === "function" ? g.Node : null;
  // every interface object the realm has at start: an own global whose value is a constructor with a
  // prototype object. The compiler names only Appendix H interfaces, so a JS built-in is never asked for.
  const ifaces = new Map();
  let names = [];
  try { names = Object.getOwnPropertyNames(g); } catch { names = []; }
  for (const n of names) {
    if (!/^[A-Z]/.test(n)) continue;
    let v;
    try {
      const d = Object.getOwnPropertyDescriptor(g, n);
      v = d && "value" in d ? d.value : undefined;
    } catch { v = undefined; }
    if (typeof v === "function" && v.prototype !== null && typeof v.prototype === "object") ifaces.set(n, v);
  }
  // #1670 review M2 — each interface's BRAND GETTER: the first own accessor found walking its prototype
  // chain (the interface's own prototype first, `Object.prototype` excluded). A WebIDL attribute getter
  // throws "Illegal invocation" on a receiver that is not a platform object of that interface (or a
  // subinterface): `Object.create(DOMRect.prototype)`, a Proxy, a different interface's object. An
  // interface with no accessor has no brand getter, and its brand check fails closed.
  const brandGetters = new Map();
  for (const [n, C] of ifaces) {
    let found = null;
    let p = C.prototype;
    for (let depth = 0; p !== null && p !== Object.prototype && depth < 64 && found === null; depth++) {
      let keys = [];
      try { keys = Object.getOwnPropertyNames(p); } catch { keys = []; }
      for (const k of keys) {
        let d;
        try { d = Object.getOwnPropertyDescriptor(p, k); } catch { d = undefined; }
        if (d && typeof d.get === "function") { found = d.get; break; }
      }
      try { p = Object.getPrototypeOf(p); } catch { p = null; }
    }
    if (found !== null) brandGetters.set(n, found);
  }
  // #1670 review M1 / I2 — the realm's own prototype for each INERT tag, from an element this module
  // makes at start: a receiver must have exactly it, so a customized built-in (`<button is="x-b">`,
  // whose prototype is the author's class), another realm's element and a re-prototyped element fail.
  const doc = g.document && typeof g.document === "object" ? g.document : null;
  const createElement = doc !== null && typeof doc.createElement === "function" ? doc.createElement : null;
  const createElementNS = doc !== null && typeof doc.createElementNS === "function" ? doc.createElementNS : null;
  // #1674 review F2 — the interfaces whose prototype carries NO own accessor in a real browser, so
  // no brand getter exists: `Window` and `Location` (their members are [LegacyUnforgeable] instance
  // properties) and `ResizeObserver` (methods only). Their brand test is not instanceof alone:
  //   - Window / Location are per-realm SINGLETONS: the brand is IDENTITY with the instance captured
  //     here (`globalThis` itself, and its `location`), so a Proxy, Object.create(…) or another
  //     realm's window / location fails;
  //   - ResizeObserver: a METHOD brand — the captured `unobserve` called on the value with a detached
  //     element this module made (a no-op on a real observer, which never observed it; "Illegal
  //     invocation" on anything else).
  let winSingleton = null;
  let locSingleton = null;
  try { if (g.window === g) winSingleton = g; } catch { winSingleton = null; }
  try {
    const l = g.location;
    if (l !== null && typeof l === "object") locSingleton = l;
  } catch { locSingleton = null; }
  const brandMethods = new Map();
  try {
    const RO = ifaces.get("ResizeObserver");
    const un = RO ? Object.getOwnPropertyDescriptor(RO.prototype, "unobserve") : undefined;
    const probe = g.document && typeof g.document.createElement === "function" ? g.document.createElement("div") : null;
    if (un && typeof un.value === "function" && probe !== null) brandMethods.set("ResizeObserver", (v) => { un.value.call(v, probe); });
  } catch { /* absent: ResizeObserver brands fail closed */ }
  const inertProtos = new Map();
  if (createElement !== null) {
    for (const t of HOST_INERT_ELEMENTS) {
      try { inertProtos.set(t, Object.getPrototypeOf(createElement.call(doc, t))); } catch { /* absent: refused */ }
    }
  }
  return {
    localName: getter(Elem, "localName"),
    namespaceURI: getter(Elem, "namespaceURI"),
    nodeType: getter(NodeC, "nodeType"),
    NodeProto: NodeC ? NodeC.prototype : null,
    ElementProto: Elem ? Elem.prototype : null,
    ifaces,
    brandGetters,
    inertProtos,
    winSingleton,
    locSingleton,
    brandMethods,
    doc,
    createElementNS,
    getPrototypeOf: Object.getPrototypeOf,
    instanceOf: Function.prototype[Symbol.hasInstance],
    isPrototypeOf: Object.prototype.isPrototypeOf,
  };
})();

// s473-host-allowlist-b (lane merge): the traps the GUARDS raise inside a binding's target thunk — hostCall
// passes exactly these through (identity, a module-private WeakSet), so E-HOST-RECEIVER-RT is not
// re-labelled E-HOST-THROW-RT; a host-thrown object is never trusted to be one.
const hostGuardTraps = new WeakSet();

// The realm's own prototype of a STANDARD element named `ln` in namespace `ns` (memoized), made with
// the captured `createElementNS` on the document captured at start. null for a custom-element name (a
// hyphen: making one could run an author constructor) or when no element can be made — fail closed.
const hostTagProtoMemo = new Map();
function hostTagProto(ns, ln) {
  if (typeof ns !== "string" || typeof ln !== "string" || ln === "" || ln.indexOf("-") >= 0) return null;
  const key = ns + " " + ln;
  if (hostTagProtoMemo.has(key)) return hostTagProtoMemo.get(key);
  let p = null;
  if (hostCaps.createElementNS !== null) {
    try { p = hostCaps.getPrototypeOf(hostCaps.createElementNS.call(hostCaps.doc, ns, ln)); } catch { p = null; }
  }
  hostTagProtoMemo.set(key, p);
  return p;
}

function hostReceiverTrap(at, what) {
  const t = new ScrmlTrap("E-HOST-RECEIVER-RT", at + " — its receiver is " + what + ", which a `<host>` binding SHALL NOT mutate: a `guarded(inert-receiver)` entry changes only an HTML element on the inert element list (§21.3.3 rule 8.5, Appendix H §H.4); a <script>, <iframe>, <base>, <meta>, <link>, <style>, <object>, <embed>, <form>, a custom element and a non-HTML element are refused", { at, receiver: what });
  hostGuardTraps.add(t);
  throw t;
}

/** The receiver's local name through the captured getters; null when it is not an HTML-namespace Element. */
function hostLocalName(el) {
  if (el === null || typeof el !== "object") return null;
  if (hostCaps.localName === null || hostCaps.namespaceURI === null) return null;
  let ns;
  let ln;
  try {
    // the captured WebIDL getters BRAND-CHECK their receiver: a non-Element (a plain object, a Proxy,
    // an object that only borrows Element.prototype) throws, and is refused
    ns = hostCaps.namespaceURI.call(el);
    ln = hostCaps.localName.call(el);
  } catch { return null; }
  if (ns !== HOST_HTML_NS || typeof ln !== "string") return null;
  return ln;
}

/** guarded(inert-receiver): `el` is an inert HTML element, or the trap E-HOST-RECEIVER-RT. */
export function hostInert(el, at) {
  const ln = hostLocalName(el);
  if (ln === null) return hostReceiverTrap(at, el === null || el === undefined ? String(el) : "not an HTML element");
  if (!hostInertSet.has(ln)) return hostReceiverTrap(at, "a <" + ln + ">");
  // #1670 review M1 / I2: the element's prototype SHALL be this realm's own prototype for its tag — a
  // customized built-in (`<button is="x-b">` reports `button` but runs the author's
  // attributeChangedCallback), another realm's element and a re-prototyped element are refused
  const want = hostCaps.inertProtos.get(ln);
  let have;
  try { have = hostCaps.getPrototypeOf(el); } catch { have = undefined; }
  if (want === undefined || have !== want) return hostReceiverTrap(at, "a <" + ln + "> that is not this page's own standard <" + ln + "> (a customized built-in `is=` element, another realm's element, or a re-prototyped one)");
  return el;
}

/**
 * guarded(url) on a URL-valued PROPERTY write (`a.href = v`, `img.src = v`): the §5.2 rule 3 guard,
 * unchanged. `_scrml_safe_url` returns the value as the write converts it (`String(value)`) when its
 * scheme is admitted, else `about:blank` plus one report (never the value). `name` is the property's
 * attribute name (`href`, `src`).
 */
export function hostUrl(el, name, value, at) {
  return _scrml_safe_url(el, name, value);
}

/**
 * guarded(url) for `setAttribute(name, value)`'s VALUE: judged by the §5.2 rule 3 guard exactly when
 * `name` is a URL-valued attribute of the receiver's element (`_scrml_is_url_attr`, element-scoped as
 * §5.2 scopes it; an element whose name cannot be read counts every URL-valued name, fail closed).
 * Any other value is returned unchanged (setAttribute converts it).
 */
export function hostAttrValue(el, name, value, at) {
  // #1670 review L2: the name is a string (a compile-time literal); anything else — an object whose
  // `toString` can answer `title` here and `href` to setAttribute — is refused, never converted
  if (typeof name !== "string") {
    throw new Error("hostAttrValue: " + at + " — the attribute name is not a string (a compiler defect: §21.3.3 rule 8.5 guarded(attr-name) requires a string literal)");
  }
  // #1674 review F1 — ONE write path: the data-attribute walls `rt.attr` uses (refusedDataAttrWrite:
  // `form` / `formaction` / `action`, `style`, `srcdoc`, a refresh `<meta>`, a `<base>` / stylesheet
  // `<link>` href), then its value guard (writeGuardOf: §5.2 rule 3's URL guard, the CSS-url
  // attributes' cssValueOf). The compiler refuses every such NAME (E-HOST-TARGET-NOT-ALLOWED), so
  // reaching a refusal here is a compiler defect; the write is still never made (the attribute is
  // removed, the binding throws — E-HOST-THROW-RT).
  if (refusedDataAttrWrite(el, name)) {
    throw new Error("hostAttrValue: " + at + " — `" + name + "` is never written from data (SPEC §5.2 / §65.4.2; a compiler defect: §21.3.3 rule 8.5 refuses the name at compile time)");
  }
  const guard = writeGuardOf(el, name);
  const s = String(value);
  if (guard === null) return s;
  const w = guard(s);
  if (w === null) {
    el.removeAttribute(name);
    throw new Error("hostAttrValue: " + at + " — the value for `" + name + "` was refused by the CSS value guard (SPEC §25.7); the attribute was removed");
  }
  return w;
}

/**
 * guarded(attr-name), the run-time wall behind the compile-time rule (the name SHALL be a string
 * literal; §5.2's event-handler test and `srcdoc` refuse it). The compiler never emits a refused
 * name, so reaching the throw is a compiler defect; it fails closed all the same. The event-handler
 * test is §5.2's: a lowercased name beginning `on`, except `one`, `online` and `onboarding`.
 */
export function hostSetAttrName(name, at) {
  const low = typeof name === "string" ? name.toLowerCase() : "";
  const handler = low.startsWith("on") && low !== "one" && low !== "online" && low !== "onboarding";
  if (typeof name !== "string" || handler || low === "srcdoc" || low === "") {
    throw new Error("hostSetAttrName: " + at + " — the attribute name " + JSON.stringify(String(name)) + " is an event handler, `srcdoc`, or not a string (a compiler defect: §21.3.3 rule 8.5 guarded(attr-name) refuses it at compile time)");
  }
  return name;
}

/**
 * The brand check (r8.7): `v` is a platform object of the Appendix H interface `iface` in THIS realm.
 * Every one of these, all captured at start, must hold (#1670 review M2):
 *   1. `instanceof` the interface object (another realm's object fails: its chain holds that realm's
 *      prototypes);
 *   2. the interface's BRAND GETTER (hostCaps.brandGetters — a WebIDL attribute getter of the interface
 *      or an ancestor) accepts `v`. A real WebIDL getter throws "Illegal invocation" for a receiver that
 *      is not a platform object implementing it, so `Object.create(DOMRect.prototype)`, a Proxy whose
 *      `getPrototypeOf` answers `DOMRect.prototype`, and `Object.create(CanvasRenderingContext2D
 *      .prototype)` fail. An interface with no accessor fails closed;
 *   3. a Node interface: the captured `nodeType` getter accepts `v`;
 *   4. an Element interface: the element's prototype is EXACTLY this realm's own prototype for its
 *      namespace and local name (hostTagProto), so a `<div>` re-prototyped as `HTMLCanvasElement`, a
 *      `<script>` re-prototyped as `HTMLDivElement`, and a customized built-in fail; a custom element
 *      (a hyphenated name) fails closed.
 * (Under an emulated DOM — happy-dom — a JS getter may not throw for a fake; 4 still refuses it there.)
 */
function hostBranded(v, iface) {
  if (v === null || (typeof v !== "object" && typeof v !== "function")) return false;
  const C = hostCaps.ifaces.get(iface);
  if (C === undefined) return false;
  let ok = false;
  try { ok = hostCaps.instanceOf.call(C, v) === true; } catch { ok = false; }
  if (!ok) return false;
  // #1674 review F2 — the per-realm singletons brand by IDENTITY: `Window` is exactly the captured
  // global, `Location` exactly its captured `location` (a superinterface of Window — EventTarget —
  // admits the captured global too). Neither is ever admitted by a getter or a prototype.
  if (iface === "Window") return hostCaps.winSingleton !== null && v === hostCaps.winSingleton;
  if (iface === "Location") return hostCaps.locSingleton !== null && v === hostCaps.locSingleton;
  if (hostCaps.winSingleton !== null && v === hostCaps.winSingleton) return true;   // instanceof C above
  const method = hostCaps.brandMethods.get(iface);
  if (method !== undefined) {
    try { method(v); } catch { return false; }
    return true;
  }
  const brand = hostCaps.brandGetters.get(iface);
  if (brand !== undefined) {
    try { brand.call(v); } catch { return false; }
  } else {
    // no accessor (EventTarget): admitted only for a value that brands as a Node — a superinterface
    // of Node is implemented by every Node — and otherwise refused (fail closed)
    let nodeAncestor = false;
    try { nodeAncestor = hostCaps.NodeProto !== null && hostCaps.isPrototypeOf.call(C.prototype, hostCaps.NodeProto); } catch { nodeAncestor = false; }
    if (!nodeAncestor || hostCaps.nodeType === null) return false;
    try { hostCaps.nodeType.call(v); } catch { return false; }
    if (!hostBranded(v, "Node")) return false;
  }
  const under = (P) => {
    if (P === null) return false;
    try { return C.prototype === P || hostCaps.isPrototypeOf.call(P, C.prototype); } catch { return true; }
  };
  if (hostCaps.NodeProto !== null && under(hostCaps.NodeProto)) {
    if (hostCaps.nodeType === null) return false;
    let t;
    try { t = hostCaps.nodeType.call(v); } catch { return false; }
    if (typeof t !== "number") return false;
  }
  if (hostCaps.ElementProto !== null && under(hostCaps.ElementProto)) {
    if (hostCaps.localName === null || hostCaps.namespaceURI === null) return false;
    let ln;
    let ns;
    try {
      ln = hostCaps.localName.call(v);
      ns = hostCaps.namespaceURI.call(v);
    } catch { return false; }
    const want = hostTagProto(ns, ln);
    let have;
    try { have = hostCaps.getPrototypeOf(v); } catch { return false; }
    if (want === null || have !== want) return false;
  }
  return true;
}

/** The brand check as a call: `v`, or E-HOST-VALUE-MISMATCH-RT. `optional`: `null` / `undefined` is `not` (null). */
export function hostBrand(v, iface, at, optional) {
  if (optional === true && (v === null || v === undefined)) return null;
  if (hostBranded(v, iface)) return v;
  return hostBindMismatch(v, String(iface) + (optional === true ? " | not" : "") + " (a platform object of this page)", at, "a host value");
}

/**
 * A scrml function crossing into a callback slot (design Lemma 3: "A callback crosses as a compiler
 * wrapper around a scrml function, never as a host value"). MEMOIZED per function and signature (the
 * descriptors' text), so the same function handed to `addEventListener` and then to
 * `removeEventListener` is the same wrapper and the listener is removed. Each argument the host
 * passes is decoded against its declared type (rule 13: a callback argument that does not fit is
 * E-HOST-VALUE-MISMATCH-RT; a host throw while decoding is E-HOST-THROW-RT). An argument beyond the
 * declared ones is dropped, `this` is never passed on, and the wrapper returns nothing to the host.
 */
const hostCallbackMemo = new WeakMap();
export function hostCallback(fn, argDescs, at) {
  if (typeof fn !== "function") throw new Error("hostCallback: " + at + " — not a function (a compiler defect: §21.3.3 rule 8.4 refuses a non-function in a callback slot, E-HOST-ARG-TYPE)");
  const descs = Array.isArray(argDescs) ? argDescs : [];
  const key = JSON.stringify(descs);
  let bySig = hostCallbackMemo.get(fn);
  if (bySig === undefined) {
    bySig = new Map();
    hostCallbackMemo.set(fn, bySig);
  }
  const have = bySig.get(key);
  if (have !== undefined) return have;
  const wrapper = function (...xs) {
    const args = [];
    for (let i = 0; i < descs.length; i++) {
      let a;
      try {
        a = hostDecode(xs[i], descs[i], at, "its callback's argument " + (i + 1));
      } catch (e) {
        if (e instanceof ScrmlTrap) throw e;
        return hostThrew(e, at, "while its callback's argument " + (i + 1) + " was decoded");
      }
      args.push(a);
    }
    fn(...args);
    return undefined;
  };
  bySig.set(key, wrapper);
  return wrapper;
}

/** Structural equality (§45) for `==` on structs and sequences. */
export function eq(a, b) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => eq(a[k], b[k]));
}

// ---------------------------------------------------------------------------
// s469 — the typed built-in string and tape methods (print.scrml `primJs`).
// CODE POINTS EVERYWHERE (bryan, S469 — `.length` included): a string's
// length, a position (`strSlice`, `strCharAt`) and a match (`strIncludes`,
// `strStartsWith`, `strEndsWith`, `strSplit`) are all by code point, never by
// UTF-16 unit. A match counts only where it starts AND ends on a code-point
// boundary, so an argument holding a lone surrogate can never match, or cut,
// half of an astral character. The tape functions never mutate: each returns
// a NEW array and leaves its argument unchanged (§66.12.6 rule 3). Copies are
// plain index loops.
// ---------------------------------------------------------------------------

/** The code points of `s`, one string each, in order (the string's `for…of`). */
function codePoints(s) {
  const out = [];
  for (const c of s) out.push(c);
  return out;
}

/** A string's `.length`: its number of code points. */
export function strLength(s) {
  // the UTF-16 length less one per surrogate PAIR (a lone surrogate is a code point of its own)
  let n = s.length;
  for (let j = 0; j + 1 < s.length; j++) {
    const c = s.charCodeAt(j);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(j + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { n--; j++; }
    }
  }
  return n;
}

/** A position must be an int (the typer guarantees it; this keeps a defect loud, never a wrong slice). */
function requireInt(i, what) {
  if (!Number.isInteger(i)) throw new Error(`${what}: position ${JSON.stringify(i)} is not an int`);
}

/**
 * No negative positions (S469 "No negatives anywhere"): a negative position, count or width is out of
 * range — never counted from the end, never clamped to 0. A negative LITERAL is refused at compile time
 * (E-POSITION-NEGATIVE); a negative COMPUTED one reaches here and traps (E-INDEX-OUT-OF-RANGE-RT, §19.17).
 */
function requireNonNegative(i, what, length) {
  if (i < 0) throw new ScrmlTrap("E-INDEX-OUT-OF-RANGE-RT", what + " " + i + " is negative — out of range for a string of length " + length + " (no position counts from the end)", { index: i, length });
}

/** `s.slice(from)` / `s.slice(from, to)`, positions in code points: past the end clamps to the end, `to < from` is `""`, a negative position traps. */
export function strSlice(s, from, to) {
  requireInt(from, "slice");
  if (to !== undefined) requireInt(to, "slice");
  const cps = codePoints(s);
  requireNonNegative(from, "slice: position", cps.length);
  if (to !== undefined) requireNonNegative(to, "slice: position", cps.length);
  const a = Math.min(from, cps.length);
  const b = to === undefined ? cps.length : Math.min(to, cps.length);
  let out = "";
  for (let i = a; i < b; i++) out += cps[i];
  return out;
}

/** `s.charAt(i)`: the code point at position `i`, or `""` when there is none. */
export function strCharAt(s, i) {
  requireInt(i, "charAt");
  if (i < 0) return "";
  // walk code points without building them: `codePointAt` reads a pair as one (> 0xFFFF, two units)
  let k = 0;
  for (let j = 0; j < s.length; k++) {
    const w = s.codePointAt(j) > 0xffff ? 2 : 1;
    if (k === i) return s.slice(j, j + w);
    j += w;
  }
  return "";
}

/** Is UTF-16 index `i` of `s` a code-point boundary (not between the two halves of a surrogate pair)? */
function atBoundary(s, i) {
  if (i <= 0 || i >= s.length) return true;
  const hi = s.charCodeAt(i - 1);
  const lo = s.charCodeAt(i);
  return !(hi >= 0xd800 && hi <= 0xdbff && lo >= 0xdc00 && lo <= 0xdfff);
}

/**
 * The needle `t` as a `u`-flag RegExp: the engine then reads both strings as CODE POINTS, so a match
 * starts and ends on code-point boundaries by construction, and a lone surrogate in `t` matches only
 * a lone surrogate in the string — never half of a pair. Linear like a native search (a candidate is
 * never re-scanned after a rejected full compare). Only the u-mode syntax characters are escaped.
 */
function codePointNeedle(t) {
  return new RegExp(t.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&"), "u");
}

/** `s.includes(t)`, on code-point boundaries. */
export function strIncludes(s, t) {
  return codePointNeedle(t).test(s);
}

/** `s.startsWith(t)`, on code-point boundaries. */
export function strStartsWith(s, t) {
  return s.startsWith(t) && atBoundary(s, t.length);
}

/** `s.endsWith(t)`, on code-point boundaries. */
export function strEndsWith(s, t) {
  return s.endsWith(t) && atBoundary(s, s.length - t.length);
}

/** `s.split(sep)`: `""` splits into code points; any other separator splits only on code-point boundaries. */
export function strSplit(s, sep) {
  if (sep === "") return codePoints(s);
  return s.split(codePointNeedle(sep));
}

function copyOf(xs) {
  const out = new Array(xs.length);
  for (let i = 0; i < xs.length; i++) out[i] = xs[i];
  return out;
}

/** The order of two strings by code point (not by UTF-16 unit, which puts U+10000.. before U+E000..U+FFFF). */
function compareCodePoints(a, b) {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i);
    const y = b.codePointAt(j);
    if (x !== y) return x < y ? -1 : 1;
    i += x > 0xffff ? 2 : 1;
    j += y > 0xffff ? 2 : 1;
  }
  if (i < a.length) return 1;
  if (j < b.length) return -1;
  return 0;
}

/** The natural order of numbers: numerically; `NaN` (a defined value, dpa-037) sorts last. */
function compareNumbers(a, b) {
  const an = Number.isNaN(a);
  const bn = Number.isNaN(b);
  if (an || bn) return an === bn ? 0 : an ? 1 : -1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** `xs.sort()` on a tape of numbers: a new tape. */
export function sortNum(xs) {
  const out = copyOf(xs);
  out.sort(compareNumbers);
  return out;
}

/** `xs.sort()` on a tape of strings: a new tape, by code point. */
export function sortStr(xs) {
  const out = copyOf(xs);
  out.sort(compareCodePoints);
  return out;
}

/** `xs.sort(cmp)`: a new tape ordered by the comparator (a stable sort). */
export function sortBy(xs, cmp) {
  const out = copyOf(xs);
  out.sort((a, b) => cmp(a, b));
  return out;
}

/** `xs.reverse()`: a new tape. */
export function reversed(xs) {
  const out = new Array(xs.length);
  for (let i = 0; i < xs.length; i++) out[i] = xs[xs.length - 1 - i];
  return out;
}

// s475 (s475-boot-local-tape-edits) — the tape edits as VALUES (Core PrimOp TapeAppend … TapeConcat):
// a granted edit of a LOCAL rebinds the local to one of these (print.scrml), so each returns a NEW tape
// and never writes its operand — value semantics (§66.10): no alias of the old value sees the edit.

/** `xs.append(v)` on a local: a new tape, `v` at the end. */
export function tapeAppend(xs, v) {
  const out = copyOf(xs);
  out.push(v);
  return out;
}

/** `xs.prepend(v)` on a local: a new tape, `v` at the front. */
export function tapePrepend(xs, v) {
  const out = new Array(xs.length + 1);
  out[0] = v;
  for (let i = 0; i < xs.length; i++) out[i + 1] = xs[i];
  return out;
}

/** `xs.pop()` on a local: a new tape without the last position (an empty tape stays empty). */
export function tapeDropEnd(xs) {
  return xs.length === 0 ? copyOf(xs) : xs.slice(0, xs.length - 1);
}

/** `xs.shift()` on a local: a new tape without the first position (an empty tape stays empty). */
export function tapeDropFront(xs) {
  return xs.slice(1);
}

/** `xs.remove(i)` on a local: a new tape without position `i`; no position `i`, nothing is removed (§66.12.6 rule 3). */
export function tapeRemoveAt(xs, i) {
  if (!Number.isInteger(i) || i < 0 || i >= xs.length) return copyOf(xs);
  const out = [];
  for (let k = 0; k < xs.length; k++) if (k !== i) out.push(xs[k]);
  return out;
}

// s476 (s476-boot-tape-inplace) — the same edits of a local, IN PLACE when the local OWNS its value.
// `owned` is the printer's proof (print.scrml ownedLocals): no other binding, cell, argument, field,
// element, iteration or deferred body can see the local's current value, so editing it is
// unobservable (§66.10 item 5: "The copy strategy is not part of the contract"). `owned` false: the
// copying edit above, exactly. Each returns the local's new value; the printer rebinds the local to it.

/** `xs.append(v)` on a local: `xs` itself, `v` pushed, when owned; else a new tape. */
export function tapeAppendOwned(owned, xs, v) {
  if (!owned) return tapeAppend(xs, v);
  xs.push(v);
  return xs;
}

/** `xs.prepend(v)` on a local: `xs` itself, `v` at the front, when owned; else a new tape. */
export function tapePrependOwned(owned, xs, v) {
  if (!owned) return tapePrepend(xs, v);
  xs.unshift(v);
  return xs;
}

/** `xs.pop()` on a local: `xs` itself without its last position, when owned (an empty tape stays empty). */
export function tapeDropEndOwned(owned, xs) {
  if (!owned) return tapeDropEnd(xs);
  if (xs.length > 0) xs.pop();
  return xs;
}

/** `xs.shift()` on a local: `xs` itself without its first position, when owned (an empty tape stays empty). */
export function tapeDropFrontOwned(owned, xs) {
  if (!owned) return tapeDropFront(xs);
  if (xs.length > 0) xs.shift();
  return xs;
}

/** `xs.remove(i)` on a local: `xs` itself without position `i`, when owned; no position `i`, nothing is removed. */
export function tapeRemoveAtOwned(owned, xs, i) {
  if (!owned) return tapeRemoveAt(xs, i);
  if (Number.isInteger(i) && i >= 0 && i < xs.length) xs.splice(i, 1);
  return xs;
}

/**
 * A part write of a local (`xs[i] = v`, `p.f = v`, `a.xs[i].f = v`) when the local OWNS its value:
 * the TOP of the value (a tape or a struct the local alone holds) is written in place; every step
 * below it is the copying writePath, because an element may be held elsewhere (`const e = xs[i]`).
 * A step the copying writer would refuse — an index outside the tape, not a field — goes to it, so
 * the trap (or the defect) is the same, raised before anything is written. `owned` false: writePath.
 */
export function writePathOwned(owned, value, path, v, at) {
  if (!owned || path.length === 0) return writePath(value, path, v, at);
  const k = path[0];
  const fits = Array.isArray(value)
    ? Number.isInteger(k) && k >= 0 && k < value.length
    : value !== null && typeof value === "object" && typeof k === "string" && Object.prototype.hasOwnProperty.call(value, k);
  if (!fits) return writePath(value, path, v, at);
  // the rest of the path first: an inner trap leaves the value unwritten
  const below = path.length === 1 ? v : writePath(value[k], path.slice(1), v, at);
  value[k] = below;
  return value;
}

/** `xs.includes(x)` on a tape: some element is structurally equal to `x` (§45 — the same `eq` as `==`). */
export function tapeIncludes(xs, x) {
  for (let i = 0; i < xs.length; i++) if (eq(xs[i], x)) return true;
  return false;
}

/** `[...a, ...b]`: a new tape holding `a`'s values, then `b`'s (an array value with a spread). */
export function tapeConcat(a, b) {
  const out = new Array(a.length + b.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i];
  for (let i = 0; i < b.length; i++) out[a.length + i] = b[i];
  return out;
}

// ---------------------------------------------------------------------------
// s477 (s477-boot-tape-bounds) — O36 RULED S477: a write whose effect on a
// sequence invariant the compiler cannot prove is checked at RUN TIME and TRAPS
// on violation (ruling:user-voice-scrml.md S477 "⭐ RULED — O36"; SPEC §66.11.2,
// §66.12.2, §19.17). A bounded-length tape type `T[min..=max, …]` admits only
// values whose length lies in min..=max: a value that would land outside is the
// E-WRITE-INVARIANT-RT trap, raised BEFORE the write, so nothing is written (a
// refused write refuses the whole write — no partial apply). The compiler emits
// these only where it could not prove the bound; a proven write has no check.

function lengthTrap(n, min, max, at) {
  return new ScrmlTrap("E-WRITE-INVARIANT-RT", "the write would leave a tape of length " + n + ", outside its type's length bound " + min + "..=" + max + " (" + at + ") — nothing was written", { length: n, min, max, at });
}

/** A value flowing into a bounded tape type: `xs` itself when it fits (or is `not`), else the trap. */
export function lengthCheck(xs, min, max, at) {
  if (xs === null || xs === undefined) return xs;
  if (xs.length < min || xs.length > max) throw lengthTrap(xs.length, min, max, at);
  return xs;
}

/** The length a cell's tape would have after `delta` elements are added (negative: removed; never below 0) — checked before any write. */
export function lengthGuard(target, delta, min, max, at) {
  const n = Math.max(0, target.peek().length + delta);
  if (n < min || n > max) throw lengthTrap(n, min, max, at);
}

/** `@xs.append(v)` on a bounded cell: the bound checked first, then the edit. */
export function appendWithin(target, element, min, max, at) {
  lengthGuard(target, 1, min, max, at);
  append(target, element);
}

/** `@xs.prepend(v)` on a bounded cell. */
export function prependWithin(target, element, min, max, at) {
  lengthGuard(target, 1, min, max, at);
  prepend(target, element);
}

/** `@xs.pop()` on a bounded cell (`n` removed at the end). */
export function removeEndWithin(target, n, min, max, at) {
  lengthGuard(target, -n, min, max, at);
  removeEnd(target, n);
}

/** `@xs.shift()` on a bounded cell (`n` removed at the front). */
export function removeFrontWithin(target, n, min, max, at) {
  lengthGuard(target, -n, min, max, at);
  removeFront(target, n);
}

// ---------------------------------------------------------------------------
// s478 (s478-boot-refinement-runtime) — SPEC §53.4.5, the BOUNDARY zone's runtime
// check of a refinement type `base(pred)` (§53.4.3; §53.11: "The compiler SHALL
// emit a runtime check for every boundary-zone assignment that it cannot statically
// elide"). The compiler's one reader (parse.scrml judgeRefine) hands the predicate
// over as a SPEC — prefix tokens separated by one space:
//   `c <op> <n>`  the value against a number      `l <op> <n>`  `.length`, in code points (App. D.1)
//   `s <name>`    a named shape (§53.6.1)         `& A B` · `| A B` · `! A`
// The value must first be a value of the base type (§53.3.4: "A `number(>0 &&
// <10000)` value IS a `number`. The constrained type is a subtype of the base
// type"). A value that fails is the E-CONTRACT-001-RT trap, raised before the
// assignment it guards (§53.11: "The runtime check SHALL halt execution and produce
// E-CONTRACT-001-RT before the assignment is applied"), naming the constraint, the
// value, the failing clause and the variable and its location (§53.4.5 item 3).
// The shapes are the compiler's static-zone predicates (parse.scrml refShapeLit —
// §53.6.1: "The normative predicate implementations are compiler-defined"), and
// `url` is `_scrml_url_shape_ok` below (§53.6.1, normative: the WHATWG URL parser
// and the §5.2 scheme reader — one reader, one safe-scheme set). A spec this
// function does not read (an unknown shape, a token out of place) admits NOTHING
// (§53.11: a runtime check "SHALL NOT admit values it cannot judge").

function refineParse(toks, st) {
  const t = toks[st.i++];
  if (t === "&" || t === "|") {
    const l = refineParse(toks, st);
    const r = refineParse(toks, st);
    return { k: t, l, r };
  }
  if (t === "!") return { k: "!", x: refineParse(toks, st) };
  if (t === "c" || t === "l") {
    const op = toks[st.i++];
    const n = Number(toks[st.i++]);
    return { k: t, op, n };
  }
  if (t === "s") return { k: "s", name: toks[st.i++] };
  return { k: "?" };
}

function refineCmp(op, a, b) {
  switch (op) {
    case ">": return a > b;
    case ">=": return a >= b;
    case "<": return a < b;
    case "<=": return a <= b;
    case "==": return a === b;
    case "!=": return a !== b;
    default: return false;
  }
}

// The named shapes, as the static zone judges a literal (parse.scrml shapeEmail … shapeColor).
const _SCRML_REFINE_SHAPES = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  uuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  phone: (v) => /^[+]?[0-9\s\-().]{7,15}$/.test(v),
  date: (v) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v),
  time: (v) => /^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$/.test(v),
  color: (v) => /^#[0-9A-Fa-f]{6}$|^[a-z]+$/.test(v),
  url: (v) => _scrml_url_shape_ok(v),
};

function refineHolds(node, v) {
  switch (node.k) {
    case "&": return refineHolds(node.l, v) && refineHolds(node.r, v);
    case "|": return refineHolds(node.l, v) || refineHolds(node.r, v);
    case "!": return !refineHolds(node.x, v);
    case "c": return typeof v === "number" && !Number.isNaN(node.n) && refineCmp(node.op, v, node.n);
    case "l": return typeof v === "string" && !Number.isNaN(node.n) && refineCmp(node.op, codePoints(v).length, node.n);
    case "s": {
      if (typeof v !== "string" || !Object.prototype.hasOwnProperty.call(_SCRML_REFINE_SHAPES, node.name)) return false;
      return _SCRML_REFINE_SHAPES[node.name](v) === true;
    }
    default: return false;
  }
}

// Review #1911 LOW-1: is every node of the spec one this runtime reads — a known
// combinator, comparison operator, number and shape? A spec with ANY node it does
// not read is refused whole (refineCheck traps), so no composition — a `!` above an
// unread node included — can turn "cannot judge" into an admit (§53.11: a runtime
// check "SHALL NOT admit values it cannot judge").
const _SCRML_REFINE_OPS = { ">": 1, ">=": 1, "<": 1, "<=": 1, "==": 1, "!=": 1 };
function refineKnown(node) {
  switch (node.k) {
    case "&": case "|": return refineKnown(node.l) && refineKnown(node.r);
    case "!": return refineKnown(node.x);
    case "c": case "l":
      return Object.prototype.hasOwnProperty.call(_SCRML_REFINE_OPS, node.op) && !Number.isNaN(node.n);
    case "s": return Object.prototype.hasOwnProperty.call(_SCRML_REFINE_SHAPES, node.name);
    default: return false;
  }
}

function refineText(node) {
  switch (node.k) {
    case "&": return refineText(node.l) + " && " + refineText(node.r);
    case "|": return "(" + refineText(node.l) + " || " + refineText(node.r) + ")";
    case "!": return "!(" + refineText(node.x) + ")";
    case "c": return "value " + node.op + " " + node.n;
    case "l": return ".length " + node.op + " " + node.n;
    case "s": return node.name;
    default: return "(a predicate the runtime does not read)";
  }
}

// The failing clause (§53.4.5 item 3, "if decomposable"): the first conjunct of a
// `&&` chain that fails; any other predicate fails whole.
function refineFailing(node, v) {
  if (node.k === "&") return refineHolds(node.l, v) ? refineFailing(node.r, v) : refineFailing(node.l, v);
  return refineText(node);
}

function refineBaseHolds(base, v) {
  if (base === "number") return typeof v === "number" && !Number.isNaN(v);
  // Review #1911 LOW-2: an `int` is a SAFE integer — ±(2^53−1), the range
  // E-INT-CONVERSION-RT holds (§41.18, §19.17) — not any integral double (2^53+1, 1e300).
  if (base === "int" || base === "integer") return Number.isSafeInteger(v);
  if (base === "string") return typeof v === "string";
  return false;
}

function refineShowValue(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v === null || v === undefined) return "not";
  return "a " + (Array.isArray(v) ? "tape" : typeof v);
}

/** A value reaching a boundary-zone refinement: `v` itself when it inhabits `base(spec)`, else the E-CONTRACT-001-RT trap. */
export function refineCheck(v, base, spec, shown, what, at) {
  const st = { i: 0 };
  const toks = String(spec).split(" ");
  const node = refineParse(toks, st);
  const whole = st.i === toks.length && refineKnown(node);
  if (whole && refineBaseHolds(base, v) && refineHolds(node, v)) return v;
  let failing;
  if (!whole) failing = "(a predicate the runtime does not read)";
  else if (!refineBaseHolds(base, v)) failing = "the value is not a `" + base + "`";
  else failing = refineFailing(node, v);
  throw new ScrmlTrap("E-CONTRACT-001-RT",
    "Value constraint violated at runtime. Type: " + shown + "; value: " + refineShowValue(v) + "; failing condition: " + failing + "; " + what + " (" + at + ")",
    { type: shown, value: v, failing, what, at });
}

/**
 * `xs.insert(i, v)` (§66.12.6 rule 3, grow anywhere): a NEW tape with `v` at
 * position `i` — `0 <= i <= xs.length` (`i == xs.length` adds at the end). A
 * position outside that (negative, past the end, not an int) would leave a
 * position holding no value: the E-INDEX-OUT-OF-RANGE-RT trap, and nothing is
 * written (§66.12.8 rule 7; O36 RULED S477 extends the S473 index-past-end trap).
 * Never writes `xs` (§66.10).
 */
export function tapeInsert(xs, i, v, at) {
  if (!Number.isInteger(i) || i < 0 || i > xs.length) {
    const ok = xs.length === 0 ? "the tape is empty: the only position is 0" : "its insert positions are 0..=" + xs.length;
    throw new ScrmlTrap("E-INDEX-OUT-OF-RANGE-RT", "insert position " + i + " is outside the tape (" + ok + ") (" + at + ") — nothing was written", { index: i, length: xs.length, at });
  }
  const out = new Array(xs.length + 1);
  for (let k = 0; k < i; k++) out[k] = xs[k];
  out[i] = v;
  for (let k = i; k < xs.length; k++) out[k + 1] = xs[k];
  return out;
}

/**
 * `xs.join(sep)` on a tape of one-text elements (s480, S479 item 13): `string`, `int`, `number`,
 * `bool` or a unit enum (its variant name). Each element is written by `textOf` — the same text as
 * before for every admitted type (`String(v)` equals `"" + v` on a primitive, NaN / ±Infinity / -0
 * included) — so an element the typer should have refused (a struct, a tape, `not`) fails closed
 * as a compiler defect instead of printing `[object Object]` or `null` (#2006 r1).
 */
export function joinStr(xs, sep) {
  let out = "";
  for (let i = 0; i < xs.length; i++) out += (i > 0 ? sep : "") + textOf(xs[i]);
  return out;
}

// ---------------------------------------------------------------------------
// s469 — the admitted additions (S469 "more string methods admitted"; SPEC Appendix D.1), still
// CODE POINTS everywhere: a match counts only where it starts AND ends on a code-point boundary, a
// position returned is a code-point position, and a width is a number of code points. Matching uses
// the host's own search (linear) and steps past a candidate that would cut a surrogate pair.
// ---------------------------------------------------------------------------

/** The UTF-16 index of the first occurrence of `t` in `s` at or after UTF-16 index `from` on code-point boundaries, or -1. */
function findOnBoundary(s, t, from) {
  let i = s.indexOf(t, from);
  while (i >= 0 && !(atBoundary(s, i) && atBoundary(s, i + t.length))) i = s.indexOf(t, i + 1);
  return i;
}

/** The UTF-16 index of the last occurrence of `t` in `s` on code-point boundaries, or -1. */
function findLastOnBoundary(s, t) {
  let i = s.lastIndexOf(t);
  while (i >= 0 && !(atBoundary(s, i) && atBoundary(s, i + t.length))) i = i === 0 ? -1 : s.lastIndexOf(t, i - 1);
  return i;
}

/** `s.indexOf(t)`: the code-point position of the first occurrence of `t`, or `not` — never -1. */
export function strIndexOf(s, t) {
  const i = findOnBoundary(s, t, 0);
  return i < 0 ? null : strLength(s.slice(0, i));
}

/** `s.lastIndexOf(t)`: the code-point position of the last occurrence of `t`, or `not` — never -1. */
export function strLastIndexOf(s, t) {
  const i = findLastOnBoundary(s, t);
  return i < 0 ? null : strLength(s.slice(0, i));
}

/** `s.replace(find, with)`: the first occurrence of `find` replaced by `with` — plain strings; `with` is literal text (no `$&` patterns). */
export function strReplace(s, find, withText) {
  const i = findOnBoundary(s, find, 0);
  if (i < 0) return s;
  return s.slice(0, i) + withText + s.slice(i + find.length);
}

/** `s.replaceAll(find, with)`: every occurrence replaced, left to right, never overlapping; `find` `""` puts `with` between code points (and at both ends). */
export function strReplaceAll(s, find, withText) {
  if (find === "") {
    const cps = codePoints(s);
    if (cps.length === 0) return withText;
    requireFits((cps.length + 1) * withText.length + s.length, "replaceAll: the insertions", cps.length + 1);
    return withText + cps.join(withText) + withText;
  }
  let out = "";
  let pos = 0;
  let i = findOnBoundary(s, find, 0);
  while (i >= 0) {
    requireFits(out.length + (i - pos) + withText.length + (s.length - i), "replaceAll: the replacements", out.length);
    out += s.slice(pos, i) + withText;
    pos = i + find.length;
    i = findOnBoundary(s, find, pos);
  }
  return out + s.slice(pos);
}

/**
 * The longest string a result may be, in UTF-16 units: the smallest host limit among the engines the
 * output runs on (V8's 2^29 − 24; JavaScriptCore's is larger), so every host refuses the same widths.
 * A `repeat` / `padStart` / `padEnd` whose result would be longer is checked UP FRONT — before any text
 * is built — and traps (E-INDEX-OUT-OF-RANGE-RT, the count or width out of range), never a raw host
 * RangeError after the memory is spent (review s469-boot-ruled-backlog F1: a server DoS).
 */
const MAX_TEXT_UNITS = 2 ** 29 - 24;

function requireFits(units, what, count) {
  if (units > MAX_TEXT_UNITS) {
    throw new ScrmlTrap("E-INDEX-OUT-OF-RANGE-RT", what + " " + count + " is out of range — the result would be " + units + " UTF-16 units, past the longest string (" + MAX_TEXT_UNITS + ")", { index: count, length: MAX_TEXT_UNITS });
  }
}

/** `fill` repeated to exactly `n` code points (the last repeat cut on a code-point boundary): built natively, length checked first. */
function fillTo(fill, n, extraUnits, what, width) {
  const f = codePoints(fill);
  const q = Math.floor(n / f.length);
  const r = n % f.length;
  let prefix = "";
  for (let k = 0; k < r; k++) prefix += f[k];
  requireFits(q * fill.length + prefix.length + extraUnits, what + ": width", width);
  return fill.repeat(q) + prefix;
}

/** The padding `padStart` / `padEnd` put on: `fill` repeated until `s` is `width` code points, or "" when it already is. */
function padding(s, width, fill, what) {
  requireInt(width, what);
  const n = strLength(s);
  requireNonNegative(width, what + ": width", n);
  if (fill === undefined) fill = " ";
  if (width <= n || fill === "") return "";
  return fillTo(fill, width - n, s.length, what, width);
}

/** `s.padStart(width, fill?)`: `fill` (default " ") before `s` until it is `width` code points long. */
export function strPadStart(s, width, fill) {
  return padding(s, width, fill, "padStart") + s;
}

/** `s.padEnd(width, fill?)`: `fill` (default " ") after `s` until it is `width` code points long. */
export function strPadEnd(s, width, fill) {
  return s + padding(s, width, fill, "padEnd");
}

/** `s.repeat(n)`: `s` written `n` times; a negative `n` traps. */
export function strRepeat(s, n) {
  requireInt(n, "repeat");
  requireNonNegative(n, "repeat: count", strLength(s));
  if (s.length > 0 && n > MAX_TEXT_UNITS / s.length) requireFits(s.length * n, "repeat: count", n);
  return s.repeat(n);
}

// ---------------------------------------------------------------------------
// s469 — `T.parse(s)` (SPEC §14.13.4; ruled S469: spelling `T.parse(s)`, a failure is `T | not`, strict
// whole-string, finite only). ONE grammar per type, matched against the WHOLE text — no trim, no `+`, no
// `0x` / `0o` / `0b`, no `_`, ASCII digits only — and only then handed to the host's `Number`, which can
// no longer see anything it would read loosely (`" 42"`, `""`, `"0x1F"`, `"Infinity"`). A value the text
// spells but the type cannot hold is `not`: an int beyond ±(2^53−1), a number that overflows to ±∞.
// ---------------------------------------------------------------------------

const INT_TEXT = /^-?[0-9]+$/;
const NUMBER_TEXT = /^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

/** The text a parse reads must be a string (the typer guarantees it; this keeps a defect loud, never a guess). */
function requireText(s, what) {
  if (typeof s !== "string") throw new Error(`${what}: the text ${JSON.stringify(s)} is not a string`);
}

/** `int.parse(s)`: an optional `-`, then ASCII digits (leading zeros allowed), within ±(2^53−1); else `not`. */
export function parseIntText(s) {
  requireText(s, "int.parse");
  if (!INT_TEXT.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  return n === 0 ? 0 : n; // `-0` spells the int 0
}

/** `number.parse(s)`: an optional `-`, digits with an optional `.` fraction, an optional exponent; a FINITE result only; else `not`. */
export function parseNumText(s) {
  requireText(s, "number.parse");
  if (!NUMBER_TEXT.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  // PA default (review F3): a parse never yields -0 — `"-0"` and an underflow like `"-1e-400"` read as 0,
  // as `int.parse` does; §14.13.4's round trip already reads the text of -0 back as 0
  return n === 0 ? 0 : n;
}

/**
 * s469 (SPEC §14.13.3, §20.7.2) — the one honest text of a logic template slot's value: an `int` /
 * `number` as ECMAScript Number::toString (`0.1 + 0.2` → "0.30000000000000004", `1e21` → "1e+21",
 * `-0` → "0"), a `bool` as `true` / `false`, a unit enum value as its variant name (its runtime tag).
 * The typer admits nothing else (E-TEXT-NON-PRIMITIVE, E-OPERAND-NOT-NARROWED); anything else reaching
 * here is a compiler defect, refused rather than printed as `[object Object]` or `null`.
 */
export function textOf(v) {
  const t = typeof v;
  if (t === "number" || t === "boolean" || t === "string") return String(v);
  throw new Error(`template slot: ${v === null ? "not" : t} has no text (compiler defect: the typer admits only primitives)`);
}

/** `bool.parse(s)`: exactly `"true"` or `"false"`; else `not`. */
export function parseBoolText(s) {
  requireText(s, "bool.parse");
  if (s === "true") return true;
  if (s === "false") return false;
  return null;
}

// ---------------------------------------------------------------------------
// SPEC §5.2 rule 3 (S457) — the URL-attribute scheme guard, judged on every
// bound write (`attr` below). The reader, the URL-valued attribute table, the
// safe-scheme sets and `_scrml_safe_url` are impl#1's
// compiler/src/runtime-url-guard.js, copied VERBATIM (`export ` stripped, as
// impl#1's own runtime inlines it): ONE definition for both implementations,
// never a second list (s462-bootstrap-sink-guards). Do not edit between the
// markers — change runtime-url-guard.js and run
// `bun scripts/sync-bootstrap-url-guard.ts --write`; the unit test
// compiler/tests/unit/bootstrap-url-guard-verbatim.test.js fails on drift.
// With no `_scrml_error_boundary_log` in this runtime, a refusal reports to
// `console.error` (the guard's own fallback) — never the value.
// ---------------------------------------------------------------------------
// >>> BEGIN verbatim compiler/src/runtime-url-guard.js
// SPEC §5.2 — the URL scheme reader and the runtime URL-attribute guard (S456 rule 2, S457 rule 3).
//
// ONE source for both halves of the rule:
//   - the COMPILER reads it as an ES module: `attr-injection-sink.ts` takes the URL-valued attribute
//     set, the safe-scheme set and `_scrml_read_url_scheme` from here, to judge the LITERAL text of a
//     quoted attribute before its first `${` (compile-time refusal, E-ATTR-INTERP-EXECUTABLE);
//   - the RUNTIME inlines this file's source verbatim (`export ` stripped, runtime-template.js chunk
//     'urlguard'; emit-ssr-render.ts for the server's first-paint rows) and calls `_scrml_safe_url` on
//     every URL-attribute write whose value the compiler could not prove safe — the data supplies the
//     scheme there (`href="${url}"`, `href=${@u}`, an `<each>` row's `src=@.img`).
// Both halves therefore read a URL with the same steps and admit the same schemes. The `string(url)`
// refinement shape (§53.6.1, S457 "6a") is judged here too (`_scrml_url_shape_ok`, at the end). Do not
// write a second list or a second reader anywhere: change this file.
//
// This file is inlined into a classic browser script and into the server bundle, so it holds plain
// function and `const` declarations only — no imports, no TypeScript, and every top-level name carries
// the `_scrml_` / `_SCRML_` prefix the runtime reserves.

// Attributes whose value is a URL (or a list of URLs), lowercased. Element-insensitive on purpose
// (fail closed): `href` is a URL on `<a>`, `<area>`, `<link>`, `<base>` and SVG/MathML elements alike.
// Source: the HTML Living Standard attribute index — every attribute whose value is a "valid URL
// potentially surrounded by spaces", a "valid non-empty URL", or a set/list of them — plus the
// URL-valued attributes of § "Obsolete features" that browsers still parse, and SVG/XML
// `xlink:href` / `xml:base`.
const _SCRML_URL_VALUED_ATTRS = new Set([
  "action", "archive", "background", "cite", "classid", "codebase", "data", "dynsrc", "formaction",
  "href", "icon", "imagesrcset", "itemid", "itemtype", "longdesc", "lowsrc", "manifest", "ping",
  "poster", "profile", "src", "srcset", "usemap", "xlink:href", "xml:base",
]);

// The elements on which the HTML standard makes an attribute of `_SCRML_URL_VALUED_ATTRS` a URL, for
// the names it scopes to particular elements (lowercased tags; HTML reads `<Link>` as `<link>`). A
// name absent from this table — `href`, `src`, `xlink:href`, `xml:base`, `itemid`, `itemtype` — is a
// URL on every element (SVG and MathML give `href` / `src`-like meaning to many elements, and the
// microdata attributes are global). The compile-time literal-prefix rule (§5.2 rule 2) refuses on any
// element (fail closed: an executable scheme written literally is never legitimate); the RUNTIME guard
// (§5.2 rule 3) uses this table, so a `data=` on a `<div>` or a custom element, or a component prop
// that happens to be named `data` / `icon` / `cite` / `action`, keeps the value the data gave it.
const _SCRML_URL_ATTR_ELEMENTS = {
  action: ["form"],
  archive: ["object", "applet"],
  background: ["body", "table", "thead", "tbody", "tfoot", "tr", "td", "th"],
  cite: ["blockquote", "q", "del", "ins"],
  classid: ["object"],
  codebase: ["object", "applet"],
  data: ["object"],
  dynsrc: ["img"],
  formaction: ["button", "input"],
  icon: ["command", "menuitem"],
  imagesrcset: ["link"],
  longdesc: ["img", "iframe", "frame"],
  lowsrc: ["img"],
  manifest: ["html"],
  ping: ["a", "area"],
  poster: ["video"],
  profile: ["head"],
  srcset: ["img", "source"],
  usemap: ["img", "object", "input"],
};

// Is attribute `name` a URL on element `tag`? `tag` may be empty when the caller does not know it —
// then every name in `_SCRML_URL_VALUED_ATTRS` counts (fail closed).
function _scrml_is_url_attr(tag, name) {
  const lowerName = String(name).toLowerCase();
  if (!_SCRML_URL_VALUED_ATTRS.has(lowerName)) return false;
  if (!tag) return true;
  const scope = Object.prototype.hasOwnProperty.call(_SCRML_URL_ATTR_ELEMENTS, lowerName)
    ? _SCRML_URL_ATTR_ELEMENTS[lowerName]
    : null;
  return scope === null || scope.indexOf(String(tag).toLowerCase()) !== -1;
}

// Schemes that never run the URL's text as script in any URL attribute: `http:` / `https:` / `ftp:`
// fetch or navigate; `mailto:` / `tel:` / `sms:` hand off to an external handler. Every other scheme —
// `javascript:`, `vbscript:`, `data:` (an `<iframe src>` of `data:text/html` runs script; see
// `_SCRML_SAFE_DATA_IMAGE_TYPES` for the one admitted shape), `blob:` (a same-origin document), and any
// scheme not named here — is refused (fail closed).
const _SCRML_SAFE_URL_SCHEMES = new Set(["http", "https", "ftp", "mailto", "tel", "sms"]);

// Raster image media types a `data:` URL may name on an image-loading attribute. A raster image is
// decoded, never executed. `image/svg+xml` is NOT here (an SVG document can carry script).
const _SCRML_SAFE_DATA_IMAGE_TYPES = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/avif", "image/bmp",
  "image/x-icon", "image/vnd.microsoft.icon",
]);

// Attributes whose URL is loaded as an image source (where a raster `data:` image is admitted).
const _SCRML_IMAGE_SOURCE_ATTRS = new Set(["src", "srcset", "imagesrcset", "poster"]);

// Read the scheme a URL text commits to, the way the WHATWG URL parser reads it:
//   - leading C0 controls and spaces are stripped ("remove any leading C0 control or space");
//   - ASCII tab / LF / CR are removed anywhere ("remove all ASCII tab or newline"), so
//     `java<TAB>script:` IS `javascript:`;
//   - the scheme is the run before the first `:` when that run is ALPHA *( ALPHA / DIGIT / "+" / "-" /
//     "." ) and no `/`, `?` or `#` came first; it is compared lowercased.
// Returns one of:
//   { kind: "scheme", scheme, rest } — `rest` is the normalized text after the `:`;
//   { kind: "relative" }             — the text can no longer begin with a scheme: a `/`, `?` or `#`
//                                      came first, or the run before `:` is not a scheme (the URL
//                                      parser then reads a relative URL);
//   { kind: "none" }                 — the text ended before committing either way (`""`, `java`): text
//                                      that FOLLOWS it can still supply a scheme;
//   { kind: "unprovable", reason }   — only when `decodesEscapes` is true: a `\` or `&` came before the
//                                      scheme ended. The compiler passes true for the literal text of a
//                                      quoted attribute, which it emits as a JS template literal (that
//                                      decodes `\x6a`) and which HTML would read `&#106;` in; neither
//                                      is ever needed in a real scheme, so it is refused, not decoded.
//                                      The runtime passes false: it reads the final string the browser
//                                      will parse, where a `\` or `&` is just a character.
function _scrml_read_url_scheme(text, decodesEscapes) {
  let s = String(text);
  let start = 0;
  while (start < s.length && s.charCodeAt(start) <= 0x20) start++;
  s = s.slice(start).replace(/[\t\n\r]/g, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (decodesEscapes && (c === "\\" || c === "&")) {
      return { kind: "unprovable", reason: c === "\\" ? "an escape sequence (`\\`)" : "a character reference (`&`)" };
    }
    if (c === "/" || c === "?" || c === "#") return { kind: "relative" };
    if (c === ":") {
      const candidate = s.slice(0, i);
      if (/^[A-Za-z][A-Za-z0-9+.\-]*$/.test(candidate)) {
        return { kind: "scheme", scheme: candidate.toLowerCase(), rest: s.slice(i + 1) };
      }
      return { kind: "relative" };
    }
  }
  return { kind: "none" };
}

// Does the text after `data:` name a complete raster image media type — terminated by `;` or `,`?
function _scrml_data_url_is_raster_image(rest) {
  const m = /^([^;,]*)[;,]/.exec(rest);
  if (!m) return false;
  return _SCRML_SAFE_DATA_IMAGE_TYPES.has(m[1].trim().toLowerCase());
}

// Is a URL whose scheme is `scheme` (rest = the text after its `:`) admitted on attribute `lowerName`?
function _scrml_url_scheme_admitted(lowerName, scheme, rest) {
  if (_SCRML_SAFE_URL_SCHEMES.has(scheme)) return true;
  return scheme === "data" && _SCRML_IMAGE_SOURCE_ATTRS.has(lowerName) && _scrml_data_url_is_raster_image(rest);
}

// One URL (the whole text the browser will parse) — admitted, or not?
function _scrml_one_url_admitted(lowerName, url) {
  const r = _scrml_read_url_scheme(url, false);
  if (r.kind !== "scheme") return true; // relative, or no scheme at all
  return _scrml_url_scheme_admitted(lowerName, r.scheme, r.rest);
}

// The candidate URLs of a `srcset` / `imagesrcset` value, read the way the HTML "parse a srcset
// attribute" algorithm reads them: skip whitespace and commas; the URL is the run up to the next
// whitespace (trailing commas stripped — a `data:` URL keeps its inner commas); then the descriptors run
// to the next comma that is not inside parentheses.
function _scrml_srcset_urls(text) {
  const urls = [];
  const isWs = (ch) => ch === " " || ch === "\t" || ch === "\n" || ch === "\f" || ch === "\r";
  let i = 0;
  const n = text.length;
  while (i < n) {
    while (i < n && (isWs(text[i]) || text[i] === ",")) i++;
    if (i >= n) break;
    const urlStart = i;
    while (i < n && !isWs(text[i])) i++;
    let url = text.slice(urlStart, i);
    if (/,+$/.test(url)) {
      urls.push(url.replace(/,+$/, ""));
      continue;
    }
    urls.push(url);
    let depth = 0;
    while (i < n) {
      const ch = text[i];
      if (ch === "(") depth++;
      else if (ch === ")" && depth > 0) depth--;
      else if (ch === "," && depth === 0) { i++; break; }
      i++;
    }
  }
  return urls;
}

// Is `value` (already a string) admitted on the URL-valued attribute `name`? `srcset` / `imagesrcset`
// check every candidate URL; `ping` (space-separated) and `archive` (space- or comma-separated) check
// every entry; every other URL attribute holds one URL.
function _scrml_url_value_admitted(name, value) {
  const lowerName = String(name).toLowerCase();
  if (lowerName === "srcset" || lowerName === "imagesrcset") {
    const urls = _scrml_srcset_urls(value);
    for (let i = 0; i < urls.length; i++) if (!_scrml_one_url_admitted(lowerName, urls[i])) return false;
    return true;
  }
  if (lowerName === "ping" || lowerName === "archive") {
    const parts = value.split(lowerName === "ping" ? /[\t\n\f\r ]+/ : /[\t\n\f\r ,]+/);
    for (let i = 0; i < parts.length; i++) if (parts[i] && !_scrml_one_url_admitted(lowerName, parts[i])) return false;
    return true;
  }
  return _scrml_one_url_admitted(lowerName, value);
}

// SVG animation elements (SMIL). Each one writes the value of ANOTHER attribute — the one its
// `attributeName` names, on its target element (the parent, or the element its `href` points at) — over
// time: `<a><set attributeName="href" to="javascript:…"/>…</a>` animates the link's href to that value,
// and a click then runs it (Chromium-confirmed, S457). So a value attribute of one of these elements
// whose `attributeName` names a URL-valued attribute IS a URL-attribute write (§5.2 rules 2 and 3).
// Lowercased (`animateTransform` is matched as `animatetransform`).
const _SCRML_SVG_ANIMATION_ELEMENTS = new Set([
  "set", "animate", "animatecolor", "animatemotion", "animatetransform",
]);

// The animation attributes that carry the value written to the animated attribute. `values` is a
// `;`-separated list (SMIL splits it on `;`); `to`, `from` and `by` hold one value each.
const _SCRML_SVG_ANIMATION_VALUE_ATTRS = new Set(["to", "from", "by", "values"]);

// Is the animation value `value` (already a string) admitted, when written to the animation attribute
// `lowerName` (`to` / `from` / `by` / `values`) of an element animating the attribute `target`? `target`
// is the lowercased URL-valued attribute `attributeName` names when the author wrote it literally, and ""
// when it is computed at runtime — then each value is judged as a URL on an unknown attribute (a raster
// `data:image` is not admitted, since the animated attribute may not be an image source).
function _scrml_animation_value_admitted(lowerName, value, target) {
  const entries = lowerName === "values" ? value.split(";") : [value];
  for (let i = 0; i < entries.length; i++) {
    if (!_scrml_url_value_admitted(target, entries[i])) return false;
  }
  return true;
}

// The runtime guard (SPEC §5.2 rule 3). The compiler routes every URL-attribute write it cannot prove
// safe through this call: `el.setAttribute("href", _scrml_safe_url(el, "href", value))`. Returns the
// value as `setAttribute` would write it (`String(value)`) when its scheme is admitted, and otherwise
// `"about:blank"` plus one report to scrml's logging surface (§19.6.8) naming the attribute and the
// element — never the value, which may carry data the page should not echo to a log. `el` may be null
// (the server's first-paint row renderer has no element).
//
// `target` is passed only for an SVG animation value attribute (`to` / `from` / `by` / `values` on
// `<set>`, `<animate>`, …): it names the URL-valued attribute being animated ("" when `attributeName` is
// computed at runtime), and every `;`-separated entry of `values` is judged.
function _scrml_safe_url(el, name, value, target) {
  const text = String(value);
  const animated = typeof target === "string";
  const admitted = animated
    ? _scrml_animation_value_admitted(String(name).toLowerCase(), text, target)
    : _scrml_url_value_admitted(name, text);
  if (admitted) return text;
  const tag = el && typeof el.tagName === "string" ? "<" + el.tagName.toLowerCase() + "> " : "";
  const what = animated
    ? String(name) + "= value animating " + (target ? target + "=" : "a URL attribute named at runtime")
    : String(name) + "=";
  const err = new Error(
    "blocked a " + tag + what + " URL whose scheme is not admitted (SPEC §5.2): only http:, " +
    "https:, ftp:, mailto:, tel:, sms:, a relative URL, or a raster data:image on an image source may be " +
    "written from data. The attribute was set to about:blank.",
  );
  if (typeof _scrml_error_boundary_log === "function") {
    _scrml_error_boundary_log("url-guard", err);
  } else if (typeof console !== "undefined" && typeof console.error === "function") {
    console.error("[scrml url-guard] " + err.message);
  }
  return "about:blank";
}

// The `url` named shape of a refinement type (SPEC §53.6.1, S457 ruling "6a"): `string(url)`. A value
// inhabits the shape when it is a string, the WHATWG URL parser accepts it as an absolute URL (no base
// — a relative URL such as `/users/1` does not inhabit it), AND the scheme this file's reader finds is
// one of `_SCRML_SAFE_URL_SCHEMES`. Every other scheme — `javascript:`, `vbscript:`, `data:` (a value
// type does not know which attribute it will reach, so no `data:` form is admitted), `blob:`, `file:`,
// and any scheme not named there — fails the shape (fail closed). The compiler's static zone imports
// this function to judge a string literal (type-system.ts); the runtime boundary check calls it
// (emit-predicates.ts), inlined from this file into the client runtime ('urlguard' chunk) and into the
// server bundle — one predicate at both enforcement sites.
function _scrml_url_shape_ok(value) {
  if (typeof value !== "string") return false;
  try {
    new URL(value);
  } catch (e) {
    return false;
  }
  const r = _scrml_read_url_scheme(value, false);
  return r.kind === "scheme" && _SCRML_SAFE_URL_SCHEMES.has(r.scheme);
}
// <<< END verbatim compiler/src/runtime-url-guard.js

// ---------------------------------------------------------------------------
// s482 (s482-meta-runtime) — SPEC §22.12 "Runtime `meta.emit` output is gated" (ruling
// user-voice-scrml.md S458 "a"; S459 rounds 3-4; S460). The gate is SECURITY CODE and the bootstrap
// does not re-implement it: the block between the markers below is impl#1's runtime gate COPIED
// VERBATIM — exactly the text impl#1's own client runtime inlines (compiler/src/runtime-template.js
// CSS_ATTR_GUARD_RUNTIME_SOURCE, then META_EMIT_GATE_RUNTIME_SOURCE: runtime-css-attr-guard.js, the
// element tables from html-elements.js, the `_SCRML_EMIT_FORM_MEMBERS` table of
// dom-named-property-members.js, markup-attr-allow-list.js and runtime-meta-emit-gate.js, each with
// `export ` stripped). Copied at impl#1 784b7f1d0 (the last commit touching any of those sources).
// Its URL reader is the verbatim URL-guard block above (`_scrml_is_url_attr`,
// `_scrml_url_value_admitted`) — never a second one. Do not edit between the markers — change the
// impl#1 sources and run `bun scripts/sync-bootstrap-meta-emit-gate.ts --write`; the unit test
// compiler/tests/unit/bootstrap-meta-emit-gate-verbatim.test.js fails on drift. The bootstrap's
// `metaEffect` (below) calls only `_scrml_meta_emit_insert`. With no `_scrml_error_boundary_log`
// in this runtime, a refusal reports to `console.error` (the gate's own fallback) — never the value.
// ---------------------------------------------------------------------------
// >>> BEGIN verbatim impl#1 runtime meta.emit gate (runtime-template.js CSS_ATTR_GUARD_RUNTIME_SOURCE + META_EMIT_GATE_RUNTIME_SOURCE)
// SPEC §5.2 — the runtime write guards for the CSS-url attributes and a stylesheet `<link>`'s `href`
// (impl#1; S479 carve-out 2 — ruling:user-voice-scrml.md-S479-3B-rest-item-21, gap
// g-impl1-svg-css-url-attr-and-link-stylesheet-href-unguarded-s473).
//
// The compiler routes every data write of a CSS-url attribute, an SVG animation value whose target
// may be one, and a `<link>`'s `href`, through the two setters at the end of this file
// (`codegen/url-attr-guard.ts` `dataAttrWriteGuard` / `guardedAttrWrite`). The runtime inlines this
// file verbatim (`export ` stripped; runtime-template.js chunk 'cssattrguard', which depends on
// 'urlguard' for `_scrml_safe_url`), so a page with no such write ships none of it.
//
// The CSS value reader is the bootstrap's, ported verbatim — `cssValueOf` + `cssAttrValue` +
// `CSS_URL_ATTRS` / `CSS_ATTR_FUNCTIONS` / `LOCAL_FRAGMENT_URL` in
// compiler/self-host-v2/slice-m1/runtime/runtime.js (the §25.7 bridge's value check, s473 / s479).
// Same alphabet, same function sets, same accept/refuse: do not widen one without the other.
//
// Plain function and `const` declarations only — no imports — and every top-level name carries the
// `_scrml_` / `_SCRML_` prefix the runtime reserves.

// The CSS-url attributes (SPEC §5.2 "Data-supplied CSS-url attributes — runtime guard (S473)"): the
// SVG presentation attributes whose CSS value grammar admits `<url>` / `<image>`. Matched by
// lowercased name on EVERY element (SVG, HTML or custom — fail closed).
const _SCRML_CSS_URL_ATTRS = new Set([
  "fill", "stroke", "marker", "marker-start", "marker-mid", "marker-end",
  "clip-path", "mask", "filter", "cursor", "color-profile",
]);

// The §25.7 bridge's CSS-value alphabet and colour / math functions (bootstrap `cssValueOf`).
const _SCRML_CSS_VALUE_ALPHABET = /^[A-Za-z0-9 #%.,+\-*/_()]*$/;
const _SCRML_CSS_VALUE_FUNCTIONS = new Set([
  "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color",
  "calc", "min", "max", "clamp",
]);
const _SCRML_CSS_VALUE_MAX = 256;

// For the CSS-url attributes only: the Filter Effects 1 filter functions and the CSS Shapes 1 basic
// shapes, none of which takes a URL (bootstrap `CSS_ATTR_FUNCTIONS`).
const _SCRML_CSS_ATTR_FUNCTIONS = new Set([
  "blur", "brightness", "contrast", "drop-shadow", "grayscale", "hue-rotate",
  "invert", "opacity", "saturate", "sepia",
  "inset", "circle", "ellipse", "polygon",
]);

// S479 (ruled §3.B item 22, INTERIM) — exactly `url(#ident)`, a same-document fragment reference.
const _SCRML_LOCAL_FRAGMENT_URL = /^url\(#[A-Za-z_][A-Za-z0-9_-]*\)$/;

// The bootstrap's `cssValueOf(v, extraFunctions)` for a string: the text when admitted, else null.
function _scrml_css_attr_value_of(v) {
  if (v.length > _SCRML_CSS_VALUE_MAX || !_SCRML_CSS_VALUE_ALPHABET.test(v)) return null;
  if (v.includes("/*") || v.includes("*/")) return null;
  let depth = 0;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c === "(") {
      let j = i;
      while (j > 0 && /[A-Za-z0-9_-]/.test(v[j - 1])) j--;
      const name = v.slice(j, i).toLowerCase();
      // a bare `(` is a grouping only inside a function (`calc((1px + 2px) * 2)`)
      if (name === "" ? depth === 0 : !(_SCRML_CSS_VALUE_FUNCTIONS.has(name) || _SCRML_CSS_ATTR_FUNCTIONS.has(name))) return null;
      depth++;
    } else if (c === ")") {
      depth--;
      if (depth < 0) return null;
    }
  }
  return depth === 0 ? v : null;
}

// Is `text` (the string the write would set) admitted on a CSS-url attribute? `perEntry` (an animation
// `values` list) judges every `;`-separated entry (bootstrap `cssAttrValue`).
function _scrml_css_attr_value_admitted(text, perEntry) {
  const entries = perEntry ? text.split(";") : [text];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (_SCRML_LOCAL_FRAGMENT_URL.test(e.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, ""))) continue;
    if (_scrml_css_attr_value_of(e) === null) return false;
  }
  return true;
}

function _scrml_css_guard_report(message) {
  const err = new Error(message);
  if (typeof _scrml_error_boundary_log === "function") {
    _scrml_error_boundary_log("css-guard", err);
  } else if (typeof console !== "undefined" && typeof console.error === "function") {
    console.error("[scrml css-guard] " + err.message);
  }
}

// THE write of a CSS-url attribute (or of an SVG animation value that may animate one) from data
// (SPEC §5.2 "Data-supplied CSS-url attributes"). `value` is converted to a string exactly as
// `setAttribute` converts it. `target` is passed only for an animation value whose animated attribute
// may ALSO be a URL attribute — `""` when `attributeName` is computed: then §5.2 rule 3's URL guard
// judges first (a refused scheme is written as `about:blank`, as `_scrml_safe_url` does), then this
// one. A refused value is NOT written: the attribute is removed, and the refusal is reported once,
// naming the attribute and the element — never the value.
function _scrml_css_attr_set(el, name, value, target) {
  const text = String(value);
  if (typeof target === "string") {
    const u = _scrml_safe_url(el, name, text, target);
    if (u !== text) { el.setAttribute(name, u); return; }
  }
  const lower = String(name).toLowerCase();
  if (_scrml_css_attr_value_admitted(text, lower === "values")) { el.setAttribute(name, text); return; }
  el.removeAttribute(name);
  _scrml_css_attr_refused(el, name, "removed");
}

// Report one refused CSS-url attribute value (never the value). `fate`: what happened to the attribute.
function _scrml_css_attr_refused(el, name, fate) {
  const tag = el && typeof el.tagName === "string" ? "<" + el.tagName.toLowerCase() + "> " : "";
  _scrml_css_guard_report(
    "refused a data-supplied value for " + tag + String(name) + "=: the browser reads this attribute as " +
    "CSS, and only a finite number, a plain CSS value (no url(), image-set(), var(), quotes, escapes, ; { } " +
    "< or !) or exactly a same-document url(#id) is written there from data (SPEC §5.2). The attribute was " + fate + ".",
  );
}

function _scrml_css_attr_escape(text) {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// THE write of a CSS-url attribute into an HTML STRING (S480 r1 F2): an enum variant's `renders`
// template / an `<errorBoundary>` `fallback=` is assembled as text and written with innerHTML
// (codegen/emit-error-boundary.ts `emitBoundaryMarkupExpr`). `parts` are the value's pieces (static
// text and payload fields, `null` / `undefined` read as ""). Returns ` name="…"` (attribute-escaped)
// when `_scrml_css_attr_set` would write the value, `""` (reported) when it would remove it; `target`
// as for `_scrml_css_attr_set`.
function _scrml_css_attr_html(tag, name, parts, target) {
  let text = "";
  for (let i = 0; i < parts.length; i++) text += parts[i] == null ? "" : String(parts[i]);
  const el = { tagName: String(tag) };
  if (typeof target === "string") {
    const u = _scrml_safe_url(el, name, text, target);
    if (u !== text) return " " + name + '="' + _scrml_css_attr_escape(u) + '"';
  }
  if (_scrml_css_attr_value_admitted(text, String(name).toLowerCase() === "values")) {
    return " " + name + '="' + _scrml_css_attr_escape(text) + '"';
  }
  _scrml_css_attr_refused(el, name, "not written");
  return "";
}

// Does this `rel` text load (or may it load) a stylesheet? It holds `stylesheet` anywhere (ASCII
// case-insensitive — a superset of the token test, fail closed). null: no `rel`.
function _scrml_rel_loads_sheet(rel) {
  return rel !== null && rel !== undefined && String(rel).toLowerCase().indexOf("stylesheet") !== -1;
}

// Does this `<link>` load (or may it load) a stylesheet? A `rel` written from data is refused at
// compile time with any data `href` (E-ATTR-STYLESHEET-HREF), so the static text decides.
function _scrml_link_loads_sheet(el) {
  return _scrml_rel_loads_sheet(el && typeof el.getAttribute === "function" ? el.getAttribute("rel") : null);
}

function _scrml_link_href_refused(name, fate) {
  _scrml_css_guard_report(
    "refused a data-supplied `" + String(name) + "` on a <link> whose `rel` loads a stylesheet: a " +
    "stylesheet is never chosen by data (SPEC §5.2). The attribute was " + fate + ".",
  );
}

// Is `el` a `<base>` (tag compared case-insensitively)? (bootstrap runtime.js `isBaseElement`.)
function _scrml_is_base_el(el) {
  return !!el && typeof el.tagName === "string" && el.tagName.toLowerCase() === "base";
}

function _scrml_base_href_refused(name, fate) {
  _scrml_css_guard_report(
    "refused a data-supplied `" + String(name) + "` on a <base>: data never chooses the document's base " +
    "URL (SPEC §5.2). The attribute was " + fate + ".",
  );
}

// THE write of a URL attribute into an HTML STRING (S480, carve-out 2 widened —
// ruling:user-voice-scrml.md-S480-census-recs item 5; gap g-impl1-renders-href-unguarded-s480): a
// `renders` / `fallback=` template (codegen/emit-error-boundary.ts `emitBoundaryMarkupExpr`) writes a
// URL attribute (`href`, `src`, `action`, … on its element — `_scrml_is_url_attr`), or an SVG animation
// value that animates one (`target` as for `_scrml_safe_url`), from a payload field. The assembled
// value (`parts`: static text and payload fields, `null` / `undefined` read as "") is judged by §5.2
// rule 3's guard, `_scrml_safe_url` — the one reader: a refused scheme is written as `about:blank`
// (reported, never the value). Returns ` name="…"`, attribute-escaped.
function _scrml_url_attr_html(tag, name, parts, target) {
  let text = "";
  for (let i = 0; i < parts.length; i++) text += parts[i] == null ? "" : String(parts[i]);
  const u = _scrml_safe_url({ tagName: String(tag) }, name, text, target);
  return " " + name + '="' + _scrml_css_attr_escape(u) + '"';
}

// THE write of a `<link>`'s `href` into an HTML STRING (S480 r2 N1) — the string-template twin of
// `_scrml_link_href_set`, for a `renders` / `fallback=` template (codegen/emit-error-boundary.ts
// `emitBoundaryMarkupExpr`). `relParts` are the pieces of the element's `rel` value (null: no `rel`),
// `hrefParts` those of the `href` value (static text and payload fields, `null` / `undefined` read as
// ""). When `rel` loads a stylesheet: `""` (the attribute is not written; reported, never the value).
// Otherwise ` name="…"` judged by §5.2 rule 3's URL guard, as `_scrml_link_href_set` judges it (S480,
// carve-out 2 widened; gap g-impl1-renders-href-unguarded-s480). `tag` (S480) is passed only for a
// `<base>`: its `href` is never written from data (§5.2 "Data never moves the document base") — `""`,
// reported.
function _scrml_link_href_html(name, relParts, hrefParts, tag) {
  if (typeof tag === "string" && tag.toLowerCase() === "base") {
    _scrml_base_href_refused(name, "not written");
    return "";
  }
  let rel = null;
  if (relParts != null) {
    rel = "";
    for (let i = 0; i < relParts.length; i++) rel += relParts[i] == null ? "" : String(relParts[i]);
  }
  if (_scrml_rel_loads_sheet(rel)) {
    _scrml_link_href_refused(name, "not written");
    return "";
  }
  return _scrml_url_attr_html("link", name, hrefParts);
}

// THE write of a `<link>`'s `href` (any case, any `prefix:href`) from data (SPEC §5.2 "Data-supplied
// stylesheets (S472)": "Every runtime path that writes a `<link>`'s `href` from data SHALL refuse the
// write when the element's `rel` contains `stylesheet` …"). Refused: the attribute is removed and the
// refusal reported (never the value). Otherwise the value is judged by §5.2 rule 3's URL guard.
//
// S480 (carve-out 2 widened) — the same setter is the runtime wall for a `<base>`'s `href` (§5.2 "Data
// never moves the document base (S473)": "Every runtime path that writes a `<base>`'s `href` from data
// SHALL refuse the write (fail closed)"): removed, reported. The compiler refuses every such write
// first (E-ATTR-BASE-HREF), so no compiled program asks for it.
function _scrml_link_href_set(el, name, value) {
  if (_scrml_is_base_el(el)) {
    el.removeAttribute(name);
    _scrml_base_href_refused(name, "removed");
    return;
  }
  if (_scrml_link_loads_sheet(el)) {
    el.removeAttribute(name);
    _scrml_link_href_refused(name, "removed");
    return;
  }
  el.setAttribute(name, _scrml_safe_url(el, name, value));
}
const _SCRML_META_EMIT_KNOWN_ELEMENTS = new Set(["a","abbr","acronym","address","altglyph","altglyphdef","altglyphitem","animate","animatecolor","animatemotion","animatetransform","annotation","annotation-xml","applet","area","article","aside","audio","b","base","basefont","bdi","bdo","bgsound","big","blink","blockquote","body","br","button","canvas","caption","center","circle","cite","clippath","code","col","colgroup","color-profile","content","cursor","data","datalist","dd","defs","del","desc","details","dfn","dialog","dir","discard","div","dl","dt","ellipse","em","embed","feblend","fecolormatrix","fecomponenttransfer","fecomposite","feconvolvematrix","fediffuselighting","fedisplacementmap","fedistantlight","fedropshadow","feflood","fefunca","fefuncb","fefuncg","fefuncr","fegaussianblur","feimage","femerge","femergenode","femorphology","fencedframe","feoffset","fepointlight","fespecularlighting","fespotlight","fetile","feturbulence","fieldset","figcaption","figure","filter","font","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","footer","foreignobject","form","frame","frameset","g","glyph","glyphref","h1","h2","h3","h4","h5","h6","hatch","hatchpath","head","header","hgroup","hkern","hr","html","i","iframe","image","img","input","ins","isindex","kbd","keygen","label","legend","li","line","lineargradient","link","listing","maction","main","maligngroup","malignmark","map","mark","marker","marquee","mask","math","menclose","menu","menuitem","merror","mesh","meshgradient","meshpatch","meshrow","meta","metadata","meter","mfenced","mfrac","mglyph","mi","missing-glyph","mlabeledtr","mlongdiv","mmultiscripts","mn","mo","mover","mpadded","mpath","mphantom","mprescripts","mroot","mrow","ms","mscarries","mscarry","msgroup","msline","mspace","msqrt","msrow","mstack","mstyle","msub","msubsup","msup","mtable","mtd","mtext","mtr","multicol","munder","munderover","nav","nextid","nobr","noembed","noframes","none","noscript","object","ol","optgroup","option","output","p","param","path","pattern","picture","plaintext","polygon","polyline","portal","pre","progress","q","radialgradient","rb","rect","rp","rt","rtc","ruby","s","samp","script","search","section","select","semantics","set","shadow","slot","small","solidcolor","source","spacer","span","stop","strike","strong","style","sub","summary","sup","svg","switch","symbol","table","tbody","td","template","text","textarea","textpath","tfoot","th","thead","time","title","tr","track","tref","tspan","tt","u","ul","unknown","use","var","video","view","vkern","wbr","xmp"]);
const _SCRML_CUSTOM_ELEMENT_NAME = /^[a-z][a-z0-9._]*-[a-z0-9._-]*$/;
const _SCRML_EMIT_FORM_MEMBERS = new Set([
  "ATTRIBUTE_NODE", "CDATA_SECTION_NODE", "COMMENT_NODE", "DOCUMENT_FRAGMENT_NODE", "DOCUMENT_NODE",
  "DOCUMENT_POSITION_CONTAINED_BY", "DOCUMENT_POSITION_CONTAINS", "DOCUMENT_POSITION_DISCONNECTED",
  "DOCUMENT_POSITION_FOLLOWING", "DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC",
  "DOCUMENT_POSITION_PRECEDING", "DOCUMENT_TYPE_NODE", "ELEMENT_NODE", "ENTITY_NODE",
  "ENTITY_REFERENCE_NODE", "NOTATION_NODE", "PROCESSING_INSTRUCTION_NODE", "TEXT_NODE",
  "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__", "__proto__",
  "acceptCharset", "accessKey", "action", "activeViewTransition", "addEventListener", "after",
  "animate", "append", "appendChild", "ariaActiveDescendantElement", "ariaAtomic",
  "ariaAutoComplete", "ariaBrailleLabel", "ariaBrailleRoleDescription", "ariaBusy", "ariaChecked",
  "ariaColCount", "ariaColIndex", "ariaColIndexText", "ariaColSpan", "ariaControlsElements",
  "ariaCurrent", "ariaDescribedByElements", "ariaDescription", "ariaDetailsElements",
  "ariaDisabled", "ariaErrorMessageElements", "ariaExpanded", "ariaFlowToElements", "ariaHasPopup",
  "ariaHidden", "ariaInvalid", "ariaKeyShortcuts", "ariaLabel", "ariaLabelledByElements",
  "ariaLevel", "ariaLive", "ariaModal", "ariaMultiLine", "ariaMultiSelectable", "ariaNotify",
  "ariaOrientation", "ariaPlaceholder", "ariaPosInSet", "ariaPressed", "ariaReadOnly",
  "ariaRelevant", "ariaRequired", "ariaRoleDescription", "ariaRowCount", "ariaRowIndex",
  "ariaRowIndexText", "ariaRowSpan", "ariaSelected", "ariaSetSize", "ariaSort", "ariaValueMax",
  "ariaValueMin", "ariaValueNow", "ariaValueText", "assignedSlot", "attachInternals",
  "attachShadow", "attributeStyleMap", "attributes", "autocapitalize", "autocomplete", "autofocus",
  "baseURI", "before", "blur", "checkValidity", "checkVisibility", "childElementCount",
  "childNodes", "children", "classList", "className", "click", "clientHeight", "clientLeft",
  "clientTop", "clientWidth", "cloneNode", "closest", "compareDocumentPosition", "computedStyleMap",
  "constructor", "contains", "contentEditable", "currentCSSZoom", "customElementRegistry",
  "dataset", "dir", "dispatchEvent", "draggable", "editContext", "elementTiming", "elements",
  "encoding", "enctype", "enterKeyHint", "firstChild", "firstElementChild", "focus",
  "getAnimations", "getAttribute", "getAttributeNS", "getAttributeNames", "getAttributeNode",
  "getAttributeNodeNS", "getBoundingClientRect", "getClientRects", "getElementsByClassName",
  "getElementsByTagName", "getElementsByTagNameNS", "getHTML", "getRootNode", "hasAttribute",
  "hasAttributeNS", "hasAttributes", "hasChildNodes", "hasOwnProperty", "hasPointerCapture",
  "hidden", "hidePopover", "id", "inert", "innerHTML", "innerText", "inputMode",
  "insertAdjacentElement", "insertAdjacentHTML", "insertAdjacentText", "insertBefore",
  "isConnected", "isContentEditable", "isDefaultNamespace", "isEqualNode", "isPrototypeOf",
  "isSameNode", "lang", "lastChild", "lastElementChild", "length", "localName",
  "lookupNamespaceURI", "lookupPrefix", "matches", "method", "moveBefore", "name", "namespaceURI",
  "nextElementSibling", "nextSibling", "noValidate", "nodeName", "nodeType", "nodeValue", "nonce",
  "normalize", "offsetHeight", "offsetLeft", "offsetParent", "offsetTop", "offsetWidth", "onabort",
  "onanimationcancel", "onanimationend", "onanimationiteration", "onanimationstart", "onauxclick",
  "onbeforecopy", "onbeforecut", "onbeforeinput", "onbeforematch", "onbeforepaste",
  "onbeforetoggle", "onbeforexrselect", "onblur", "oncancel", "oncanplay", "oncanplaythrough",
  "onchange", "onclick", "onclose", "oncommand", "oncontentvisibilityautostatechange",
  "oncontextlost", "oncontextmenu", "oncontextrestored", "oncopy", "oncuechange", "oncut",
  "ondblclick", "ondrag", "ondragend", "ondragenter", "ondragleave", "ondragover", "ondragstart",
  "ondrop", "ondurationchange", "onemptied", "onended", "onerror", "onfocus", "onformdata",
  "onfullscreenchange", "onfullscreenerror", "ongotpointercapture", "oninput", "oninvalid",
  "onkeydown", "onkeypress", "onkeyup", "onload", "onloadeddata", "onloadedmetadata", "onloadstart",
  "onlostpointercapture", "onmousedown", "onmouseenter", "onmouseleave", "onmousemove",
  "onmouseout", "onmouseover", "onmouseup", "onmousewheel", "onpaste", "onpause", "onplay",
  "onplaying", "onpointercancel", "onpointerdown", "onpointerenter", "onpointerleave",
  "onpointermove", "onpointerout", "onpointerover", "onpointerup", "onprogress", "onratechange",
  "onreset", "onresize", "onscroll", "onscrollend", "onscrollsnapchange", "onscrollsnapchanging",
  "onsearch", "onsecuritypolicyviolation", "onseeked", "onseeking", "onselect", "onselectionchange",
  "onselectstart", "onslotchange", "onstalled", "onsubmit", "onsuspend", "ontimeupdate", "ontoggle",
  "ontransitioncancel", "ontransitionend", "ontransitionrun", "ontransitionstart", "onvolumechange",
  "onwaiting", "onwebkitanimationend", "onwebkitanimationiteration", "onwebkitanimationstart",
  "onwebkitfullscreenchange", "onwebkitfullscreenerror", "onwebkittransitionend", "onwheel",
  "outerHTML", "outerText", "ownerDocument", "parentElement", "parentNode", "part", "popover",
  "prefix", "prepend", "previousElementSibling", "previousSibling", "propertyIsEnumerable",
  "querySelector", "querySelectorAll", "rel", "relList", "releasePointerCapture", "remove",
  "removeAttribute", "removeAttributeNS", "removeAttributeNode", "removeChild",
  "removeEventListener", "replaceChild", "replaceChildren", "replaceWith", "reportValidity",
  "requestFullscreen", "requestPointerLock", "requestSubmit", "reset", "role", "scroll", "scrollBy",
  "scrollHeight", "scrollIntoView", "scrollIntoViewIfNeeded", "scrollLeft", "scrollTo", "scrollTop",
  "scrollWidth", "setAttribute", "setAttributeNS", "setAttributeNode", "setAttributeNodeNS",
  "setHTML", "setHTMLUnsafe", "setPointerCapture", "shadowRoot", "showPopover", "slot",
  "spellcheck", "startViewTransition", "style", "submit", "tabIndex", "tagName", "target",
  "textContent", "title", "toLocaleString", "toString", "toggleAttribute", "togglePopover",
  "translate", "valueOf", "virtualKeyboardPolicy", "webkitMatchesSelector",
  "webkitRequestFullScreen", "webkitRequestFullscreen", "when", "writingSuggestions",
]);
// SPEC §22.4.1 / §22.12 — the ONE attribute judge for markup a `^{}` block emits: compile-time
// `emit()` / `emit.raw()` output (meta-eval.ts `checkEmittedNodes`) and runtime `meta.emit(html)`
// output (runtime-meta-emit-gate.js). S459 round 3 (PA addendum 3, items 2 + 3).
//
// THE TEST IS CLOSED. An attribute is admitted only when its name is on the list below for the
// element's namespace (and, for the HTML per-element names, for that element); every other name is
// refused — an attribute no list knows yet (a new event handler, a new navigation or resource
// attribute) is refused, never let through. This replaces the earlier deny-list (`on*`, `srcdoc`,
// `data-scrml*`), which admitted everything it did not name. The lists name presentation, structure,
// accessibility and form-value attributes that never run text as script and never load or navigate
// on their own; the URL-valued names they admit (`href`, `src`, `srcset`, `cite`, `poster`,
// `xlink:href`, `itemid`, `itemtype`) are ADDITIONALLY judged by scheme per §5.2 by the
// caller, in BOTH phases with the ONE §5.2 reader (S459 round 4 F4): `_scrml_is_url_attr("", name)` +
// `_scrml_url_value_admitted(name, value)` from runtime-url-guard.js — the runtime on the parsed value,
// compile time (meta-eval.ts `checkEmittedNodes`) on the literal value the emitted markup carries,
// which is the string the browser parses (the compiler HTML-escapes it on output). (Before round 4
// this header claimed compile time was covered by the §5.2 sink check over the spliced nodes; that
// check judges only the literal text before a `${`, so a fully literal `href="javascript:…"` in
// `emit()` output passed — the review's F4.)
//
// Deliberately NOT on the lists (refused): every `on*` event handler; `srcdoc`; `is` (instantiates a
// page-registered customized built-in); `nonce` / `integrity`; `ping`; `xml:base` (re-bases relative
// URLs); `action`, `method`, `enctype`, `target` on `<form>`, and `form`, `formaction`, `formmethod`,
// `formenctype`, `formtarget`, `formnovalidate` (data must not redirect or retarget a submission — of
// the emitted form or, through `form=`, of a form already on the page); `popovertarget`,
// `popovertargetaction`, `commandfor`, `command`, `anchor`, and `for` on `<label>` (act on an element
// elsewhere in the page by id — a `<label for="x">` click IS a click on the page's `#x`, S459 round 4
// F1; `<output for>` only names its inputs and is admitted); `usemap` on `<img>` and `name` on `<map>`
// (S460 N1 — the same reference-by-name class: `<img usemap="#m">` resolves `#m` against every
// `<map>` in the page by name OR id, so an emitted image would run a page `<area>`'s activation on
// click, and an emitted `<map name>` / `<map id>` would capture the areas of a page image — `id` on
// `<map>` is the one global refused on one element, in `_scrml_emit_attr_name_verdict`); the SVG animation attributes `attributename`, `to`, `from`, `by`, `begin` (their elements are
// refused anyway); and the compiler-owned `data-scrml` / `data-scrml-*` namespace (ruling S458 "your
// recs on all four" item 3 + PA-ruled S459 consequence: the component CSS scope root and the runtime
// markers).
//
// Names are compared as the HTML tokenizer leaves them: ASCII upper case folded to lower case (the
// tokenizer does not decode character references in a name). SVG's camelCase attributes (`viewBox`)
// are listed lowercased; callers fold before asking.
//
// This file is BOTH a compiler module (imported by meta-eval.ts) and runtime source (inlined verbatim,
// `export ` stripped, into the 'metaemit' chunk by runtime-template.js), so it holds only `const`
// tables and plain functions, every top-level name `_scrml_` / `_SCRML_` prefixed, no imports.

// Admitted on every element of every namespace.
const _SCRML_EMIT_GLOBAL_ATTRS = new Set([
  "accesskey", "autocapitalize", "autocorrect", "autofocus", "class", "contenteditable", "dir",
  "draggable", "enterkeyhint", "exportparts", "hidden", "id", "inert", "inputmode", "itemid",
  "itemprop", "itemref", "itemscope", "itemtype", "lang", "part", "popover", "role", "slot",
  "spellcheck", "style", "tabindex", "title", "translate", "writingsuggestions",
  "xml:lang", "xml:space", "xmlns", "xmlns:xlink",
]);

// HTML per-element names: attribute → the (lowercased) HTML elements it is admitted on.
const _SCRML_EMIT_HTML_ELEMENT_ATTRS = {
  abbr: ["td", "th"],
  accept: ["input"],
  "accept-charset": ["form"],
  // `<meta>`'s DESCRIPTIVE attributes (PA-ruled S459: meta descriptive attrs; http-equiv refused).
  // `content` is inert only while the element has no `http-equiv` — `http-equiv="refresh"` with
  // `content="0;url=javascript:…"` is an executable navigation (S456 filed meta refresh as a URL
  // sink). `http-equiv` is on no list, so it is refused outright, and THAT is what makes admitting
  // `content` safe — which is why `content` is scoped to `<meta>` here, never admitted globally.
  // (The runtime gate refuses the `<meta>` element itself; these names matter for compile-time
  // `emit()` output, e.g. `<meta name="robots" content="index, follow">`, `<meta name="Description">`.)
  charset: ["meta"],
  content: ["meta"],
  property: ["meta"],
  alt: ["img", "area", "input"],
  autocomplete: ["form", "input", "select", "textarea"],
  autoplay: ["audio", "video"],
  checked: ["input"],
  cite: ["blockquote", "q", "del", "ins"],
  cols: ["textarea"],
  colspan: ["td", "th"],
  controls: ["audio", "video"],
  coords: ["area"],
  crossorigin: ["img", "audio", "video"],
  datetime: ["time", "del", "ins"],
  decoding: ["img"],
  default: ["track"],
  dirname: ["input", "textarea"],
  disabled: ["button", "fieldset", "input", "optgroup", "option", "select", "textarea"],
  download: ["a", "area"],
  fetchpriority: ["img"],
  // `for` on `<label>` is NOT admitted (S459 round 4 F1): activating a label activates its control,
  // and `for="id"` picks that control anywhere in the page — `<label for="danger">` made a click on
  // emitted text a click on the page's `#danger`. `<output for>` only lists its inputs.
  for: ["output"],
  headers: ["td", "th"],
  height: ["img", "video", "canvas", "input", "source"],
  high: ["meter"],
  href: ["a", "area"],
  hreflang: ["a", "area"],
  ismap: ["img"],
  kind: ["track"],
  label: ["option", "optgroup", "track"],
  list: ["input"],
  loading: ["img"],
  loop: ["audio", "video"],
  low: ["meter"],
  max: ["input", "meter", "progress"],
  maxlength: ["input", "textarea"],
  media: ["source", "meta"],
  min: ["input", "meter"],
  minlength: ["input", "textarea"],
  multiple: ["input", "select"],
  muted: ["audio", "video"],
  // Not on `<map>` (S460 N1 — see the header).
  name: ["button", "fieldset", "input", "output", "select", "textarea", "details", "meta"],
  novalidate: ["form"],
  open: ["details", "dialog"],
  optimum: ["meter"],
  pattern: ["input"],
  placeholder: ["input", "textarea"],
  playsinline: ["video"],
  poster: ["video"],
  preload: ["audio", "video"],
  readonly: ["input", "textarea"],
  referrerpolicy: ["a", "area", "img"],
  rel: ["a", "area"],
  required: ["input", "select", "textarea"],
  reversed: ["ol"],
  rows: ["textarea"],
  rowspan: ["td", "th"],
  scope: ["th"],
  selected: ["option"],
  shape: ["area"],
  size: ["input", "select"],
  sizes: ["img", "source"],
  span: ["col", "colgroup"],
  src: ["img", "audio", "video", "source", "track", "input"],
  srclang: ["track"],
  srcset: ["img", "source"],
  start: ["ol"],
  step: ["input"],
  type: ["a", "button", "input", "ol", "source", "menu"],
  value: ["button", "data", "input", "li", "meter", "option", "progress"],
  width: ["img", "video", "canvas", "input", "source", "col", "colgroup"],
  wrap: ["textarea"],
};

// SVG names (any SVG element; their elements are judged separately). Lowercased.
const _SCRML_EMIT_SVG_ATTRS = new Set([
  "alignment-baseline", "baseline-shift", "baseprofile", "clip", "clip-path", "clip-rule",
  "clippathunits", "color", "color-interpolation", "color-interpolation-filters", "cursor", "cx", "cy",
  "d", "diffuseconstant", "direction", "display", "divisor", "dominant-baseline", "dx", "dy",
  "edgemode", "elevation", "fill", "fill-opacity", "fill-rule", "filter", "filterunits",
  "flood-color", "flood-opacity", "focusable", "font-family", "font-size", "font-size-adjust",
  "font-stretch", "font-style", "font-variant", "font-weight", "fr", "fx", "fy", "gradienttransform",
  "gradientunits", "height", "href", "image-rendering", "in", "in2", "k", "k1", "k2", "k3", "k4",
  "kernelmatrix", "kernelunitlength", "lengthadjust", "letter-spacing", "lighting-color",
  "limitingconeangle", "marker-end", "marker-mid", "marker-start", "markerheight", "markerunits",
  "markerwidth", "mask", "maskcontentunits", "maskunits", "mode", "numoctaves", "offset", "opacity",
  "operator", "order", "orient", "overflow", "paint-order", "pathlength", "patterncontentunits",
  "patterntransform", "patternunits", "pointer-events", "points", "pointsatx", "pointsaty",
  "pointsatz", "preservealpha", "preserveaspectratio", "primitiveunits", "r", "radius", "refx",
  "refy", "result", "rotate", "rx", "ry", "scale", "seed", "shape-rendering", "spacing",
  "specularconstant", "specularexponent", "spreadmethod", "startoffset", "stddeviation",
  "stitchtiles", "stop-color", "stop-opacity", "stroke", "stroke-dasharray", "stroke-dashoffset",
  "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke-width",
  "surfacescale", "systemlanguage", "tablevalues", "targetx", "targety", "text-anchor",
  "text-decoration", "text-rendering", "textlength", "transform", "transform-origin", "type",
  "unicode-bidi", "values", "vector-effect", "version", "viewbox", "visibility", "width",
  "word-spacing", "writing-mode", "x", "x1", "x2", "xchannelselector", "xlink:href", "xlink:title",
  "y", "y1", "y2", "ychannelselector", "z",
]);

// MathML names (any MathML element). Lowercased.
const _SCRML_EMIT_MATHML_ATTRS = new Set([
  "accent", "accentunder", "align", "arg", "close", "columnalign", "columnlines", "columnspacing",
  "columnspan", "depth", "display", "displaystyle", "encoding", "equalcolumns", "equalrows", "fence",
  "form", "frame", "framespacing", "height", "href", "intent", "largeop", "linethickness", "lspace",
  "mathbackground", "mathcolor", "mathsize", "mathvariant", "maxsize", "minsize", "movablelimits",
  "notation", "open", "rowalign", "rowlines", "rowspacing", "rowspan", "rspace", "scriptlevel",
  "separator", "separators", "side", "stretchy", "symmetric", "voffset", "width",
]);

const _SCRML_EMIT_NS_HTML = "http://www.w3.org/1999/xhtml";
const _SCRML_EMIT_NS_SVG = "http://www.w3.org/2000/svg";
const _SCRML_EMIT_NS_MATHML = "http://www.w3.org/1998/Math/MathML";

// Fold ASCII upper case to lower case — the HTML tokenizer's only change to an attribute name.
function _scrml_emit_fold_name(name) {
  return String(name).replace(/[A-Z]/g, (c) => c.toLowerCase());
}

// The compiler-owned namespace: `data-scrml` itself (the component CSS scope root) and every
// `data-scrml-*` name (the runtime markers). `lowerName` is already folded.
function _scrml_emit_reserved_attr_name(lowerName) {
  return lowerName === "data-scrml" || lowerName.slice(0, 11) === "data-scrml-";
}

// The ONE attribute judge. `ns` is the element's namespace URI (one of the three above; anything else
// is judged as HTML), `tag` its lowercased local name, `name` the attribute name as written / parsed.
// Returns "" when the name is admitted, else a short reason naming the attribute (never its value).
function _scrml_emit_attr_name_verdict(ns, tag, name) {
  const lowerName = _scrml_emit_fold_name(name);
  if (_scrml_emit_reserved_attr_name(lowerName)) {
    return "a " + lowerName + "= attribute on <" + tag + "> (the data-scrml attribute namespace is " +
      "reserved for the compiler's own markers)";
  }
  // A `<map>` is found by `id` as well as `name` (hash-name reference; Chromium-verified S460 N1).
  if (lowerName === "id" && String(tag).toLowerCase() === "map" && ns !== _SCRML_EMIT_NS_SVG && ns !== _SCRML_EMIT_NS_MATHML) {
    return "an id= attribute on <map> (an <img usemap> anywhere in the page resolves to a map by its id " +
      "or name)";
  }
  if (lowerName.slice(0, 5) === "data-" && lowerName.length > 5) return "";
  if (lowerName.slice(0, 5) === "aria-" && lowerName.length > 5) return "";
  if (_SCRML_EMIT_GLOBAL_ATTRS.has(lowerName)) return "";
  if (ns === _SCRML_EMIT_NS_SVG) {
    if (_SCRML_EMIT_SVG_ATTRS.has(lowerName)) return "";
  } else if (ns === _SCRML_EMIT_NS_MATHML) {
    if (_SCRML_EMIT_MATHML_ATTRS.has(lowerName)) return "";
  } else if (Object.prototype.hasOwnProperty.call(_SCRML_EMIT_HTML_ELEMENT_ATTRS, lowerName)
    && _SCRML_EMIT_HTML_ELEMENT_ATTRS[lowerName].indexOf(String(tag).toLowerCase()) !== -1) {
    return "";
  }
  if (lowerName.slice(0, 2) === "on") return "an event-handler attribute " + lowerName + "= on <" + tag + ">";
  return (/^[aeiou]/.test(lowerName) ? "an " : "a ") + lowerName + "= attribute on <" + tag + "> (not on the admitted attribute list for " +
    "emitted markup)";
}

// The value half of the judge (names already admitted). `tag` is the element's lowercased local name.
//   - An `id` / `name` whose value begins with the compiler-reserved prefix `_scrml` / `__scrml`
//     (§47.1.1) is refused on EVERY element — any element's `id` becomes a `window._scrml…` named
//     property, which the runtime's own `typeof _scrml_x === "function"` probes would then find.
//   - Other `id` / `name` values are judged by `_scrml_emit_named_value_verdict` below, and only on
//     the elements that make them a named property of `document` or of a form.
//   - `<meta name>` values are not judged (S459 round 4 F5). `<meta>` creates no named property of
//     `document`, `window` or a form, so no value of it can shadow anything; meta names are ASCII
//     case-insensitive tokens of any spelling (`Description`, `DC.title`, `msapplication-TileColor`).
//     The earlier lowercase-token rule refused those and guarded nothing, so it is dropped rather than
//     case-folded.
// `tag` is kept in the signature for callers; the value rules here are element-independent.
// Returns "" or a reason naming the attribute (never its value).
function _scrml_emit_attr_value_verdict(name, value, tag) {
  const lowerName = _scrml_emit_fold_name(name);
  if ((lowerName === "id" || lowerName === "name") && /^_{1,2}scrml/i.test(String(value).trim())) {
    return (lowerName === "id" ? "an " : "a ") + lowerName + "= value in the compiler-reserved _scrml / __scrml namespace";
  }
  return "";
}

// NAMED PROPERTIES (S459 round 4 F2). `Document` and `HTMLFormElement` are [LegacyOverrideBuiltIns]:
// an element they expose BY NAME shadows their member of the same name (`<img name="querySelector">`
// makes `document.querySelector` that image; `<input name="action">` inside a form makes `form.action`
// that input). So an `id` / `name` value is refused when — and only when — the element makes it such a
// named property AND it names a member of that object. Which elements, per the HTML standard:
//   - `document` (Document's supported property names): the `name` of `embed`, `form`, `iframe`,
//     `img`, `object`; the `id` of `object`; the `id` of an `img` that also has a `name`;
//   - a form (HTMLFormElement's supported property names): the `id` and the `name` of every LISTED
//     element whose form owner is that form — `button`, `fieldset`, `input`, `object`, `output`,
//     `select`, `textarea`, and a form-associated custom element (whether a custom element is
//     form-associated is known only once the page upgrades it, so every custom element counts) — and
//     of every `img` inside the form.
// `window`'s named properties are not consulted: Window is NOT [LegacyOverrideBuiltIns], so an element
// named like a window member never shadows it (the reserved `_scrml` prefix above covers the names the
// runtime probes for). Every other element — `div`, `h2`, `section`, `p`, … — is admitted with any
// `id` / `name` value (the round-3 belt refused the 370 HTMLFormElement member names on EVERY element).
const _SCRML_EMIT_DOCUMENT_NAMED_BY_NAME = new Set(["embed", "form", "iframe", "img", "object"]);
const _SCRML_EMIT_FORM_LISTED_ELEMENTS = new Set([
  "button", "fieldset", "input", "object", "output", "select", "textarea",
]);

// Is the element `tag` (lowercased) in namespace `ns` a form-associated control — one that joins the
// submission and the named properties of the form it sits in? `isCustom`: `tag` is a custom-element
// name.
function _scrml_emit_is_form_control(ns, tag, isCustom) {
  if (ns && ns !== _SCRML_EMIT_NS_HTML) return false;
  return _SCRML_EMIT_FORM_LISTED_ELEMENTS.has(tag) || isCustom === true;
}

// The named-property judge for attribute `lowerName` (folded) with `value` on the element `tag`
// (lowercased) in namespace `ns`. `hasNameAttr`: the element also carries `name`. `inForm`: the element
// sits inside a `<form>` — of the emitted tree, or (at run time) the page form around the insertion
// point. `members` = { document, form }: the generated member tables (dom-named-property-members.js),
// plus at run time `formProto`: the live HTMLFormElement prototype captured at load (`in` on it
// reaches the platform's own members, data cannot). Each phase passes only the table it needs (S460):
// compile time `form: null` with `inForm` false (no form half there — ruling S460 "n4 b"); the runtime
// `document: null` (the document half never decides a runtime verdict: `name` is admitted on none of
// embed / form / iframe / img / object, and object / embed / iframe are refused elements). A `null`
// table judges fail-closed. Returns "" or a reason naming the attribute and the object it would
// shadow a member of (never the value).
function _scrml_emit_named_value_verdict(ns, tag, lowerName, value, hasNameAttr, inForm, isCustom, members) {
  if (lowerName !== "id" && lowerName !== "name") return "";
  if (ns && ns !== _SCRML_EMIT_NS_HTML) return "";
  const v = String(value);
  if (v === "") return "";
  // A `null` table (a phase that does not carry it) is FAIL-CLOSED: every value counts as a member.
  const isMember = (table, proto) => table === null || table === undefined || table.has(v)
    || (proto !== null && proto !== undefined && v in proto);
  const ofDocument = (lowerName === "name" && _SCRML_EMIT_DOCUMENT_NAMED_BY_NAME.has(tag))
    || (lowerName === "id" && (tag === "object" || (tag === "img" && hasNameAttr === true)));
  if (ofDocument && isMember(members.document, null)) {
    return (lowerName === "id" ? "an " : "a ") + lowerName + "= value on <" + tag + "> that names a member of document (the element " +
      "would shadow that member)";
  }
  const ofForm = inForm === true && (_scrml_emit_is_form_control(ns, tag, isCustom) || tag === "img");
  if (ofForm && isMember(members.form, members.formProto)) {
    return (lowerName === "id" ? "an " : "a ") + lowerName + "= value on <" + tag + "> inside a form that names a member of the form " +
      "(the element would shadow that member)";
  }
  return "";
}

// The namespace of a child element named `childTag` (lowercased) whose parent is in namespace
// `parentNs` with local name `parentTag` — the HTML tree builder's rule, for callers (compile time)
// that judge a tree no parser built: `<svg>` opens SVG, `<math>` opens MathML, and an SVG
// `foreignObject` / `desc` / `title` or a MathML `annotation-xml` (text/html) / token element returns
// to HTML.
function _scrml_emit_child_ns(parentNs, parentTag, childTag) {
  if (parentNs === _SCRML_EMIT_NS_SVG) {
    if (parentTag === "foreignobject" || parentTag === "desc" || parentTag === "title") {
      return childTag === "svg" ? _SCRML_EMIT_NS_SVG : childTag === "math" ? _SCRML_EMIT_NS_MATHML : _SCRML_EMIT_NS_HTML;
    }
    return _SCRML_EMIT_NS_SVG;
  }
  if (parentNs === _SCRML_EMIT_NS_MATHML) {
    if (parentTag === "annotation-xml" || parentTag === "mi" || parentTag === "mo" || parentTag === "mn"
      || parentTag === "ms" || parentTag === "mtext") {
      return childTag === "svg" ? _SCRML_EMIT_NS_SVG : childTag === "math" ? _SCRML_EMIT_NS_MATHML : _SCRML_EMIT_NS_HTML;
    }
    return _SCRML_EMIT_NS_MATHML;
  }
  return childTag === "svg" ? _SCRML_EMIT_NS_SVG : childTag === "math" ? _SCRML_EMIT_NS_MATHML : _SCRML_EMIT_NS_HTML;
}
// SPEC §22.4.1 / §22.5.1 / §22.12 — the runtime `meta.emit(html)` gate (ruling S458 "a"; S459 round 3).
//
// Runtime `meta.emit(html)` output is held to the SAME closed rule as compile-time `emit()` output:
// admitted elements, admitted attribute NAMES (markup-attr-allow-list.js — the one attribute judge
// both phases use), URL schemes judged per §5.2. A violation is refused, reported once to scrml's
// logging surface (§19.6.8 B5), and NOTHING is written. At run time every byte of the string is DATA
// (`meta.emit("<p>" + row.name + "</p>")`), so every attribute value is judged the way §5.2 rule 3
// judges a data-supplied value.
//
// ONE READER. The string is parsed ONCE, inertly — as the content of an element of the insertion
// point's tag, created in a separate document with no browsing context (`createHTMLDocument`: nothing
// in it runs, no resource loads, no event fires). The gate walks THAT tree, and on success the SAME
// nodes are moved into the page — the string is never parsed a second time, so the checked tree is
// the inserted tree.
//
// UNFORGEABLE READS (S459 round 3, review HIGH). The tree the gate walks was SHAPED BY THE DATA, and the
// DOM lets markup shadow properties: on an `HTMLFormElement` ([LegacyOverrideBuiltIns]) a control named
// `lastChild`, `previousSibling` or `attributes` replaces those properties, and a `name=` / `id=` can
// shadow `document.*` members. A gate that reads `node.lastChild` / `node.attributes` therefore judged a
// tree the data chose for it (four payloads were inserted unread and ran). So NOTHING here reads a
// property of a node, of `document`, or of an attribute map: every read goes through an accessor or
// method taken from the PROTOTYPE at chunk load (`Object.getOwnPropertyDescriptor(Node.prototype,
// "firstChild").get`, …) and applied with `.call` — those cannot be shadowed by anything in the data.
// Chunk load runs before any `meta.emit`, so the captured functions are the platform's own.
//
// This file is inlined into the client runtime verbatim (runtime-template.js, chunk 'metaemit',
// `export ` stripped) after the 'urlguard' chunk, whose scheme reader it calls (`_scrml_is_url_attr`,
// `_scrml_url_value_admitted` — runtime-url-guard.js; do NOT write a second URL reader here), the
// 'cssattrguard' chunk (`_SCRML_CSS_URL_ATTRS`, `_scrml_css_attr_value_admitted` —
// runtime-css-attr-guard.js, the CSS-url attribute reader; S480 r1 F3), and
// after the `_SCRML_EMIT_FORM_MEMBERS` declaration of dom-named-property-members.js (the only one the
// runtime carries — S460 N6) and
// markup-attr-allow-list.js (`_scrml_emit_attr_name_verdict`, `_scrml_emit_attr_value_verdict`,
// `_scrml_emit_named_value_verdict`, `_scrml_emit_is_form_control`, `_scrml_emit_fold_name`).
// `_SCRML_META_EMIT_KNOWN_ELEMENTS` is defined immediately before this file's source by
// runtime-template.js from the compiler's ONE element list (html-elements.js
// `standardMarkupElementNamesLowercase()`), the list compile-time `emit()` output is judged against;
// `_SCRML_CUSTOM_ELEMENT_NAME` likewise from html-elements.js `CUSTOM_ELEMENT_NAME_PATTERN`.
// Plain function and `const` declarations only; every top-level name carries the `_scrml_` /
// `_SCRML_` prefix the runtime reserves.

// Elements refused in runtime `meta.emit` output, by lowercased local name in ANY namespace (an
// `<svg><script>` is a script). Derived as:
//   - what compile-time `emit()` refuses: `script` (E-SCRIPT-001), `style` (E-STYLE-001);
//   - elements whose effect reaches beyond the emitted fragment, where a per-attribute §5.2 check of
//     the fragment cannot see what they do: `base` (re-bases every relative URL in the document),
//     `meta` (`http-equiv` refresh / cookies / policy), `link` (loads a stylesheet or resource into
//     the document); `iframe`, `frame`, `frameset`, `object`, `embed`, `applet`, `portal`,
//     `fencedframe` (a nested document or plugin whose content the gate never sees); and the SVG
//     animation elements `set`, `animate`, `animatecolor`, `animatemotion`, `animatetransform`, which
//     write ANOTHER element's attribute — a target an `href="#id"` may pick anywhere in the page.
// Every other element must ALSO be a standard HTML / SVG / MathML element or a custom element (below):
// the element test is an allow-list, this set only removes names from it.
const _SCRML_META_EMIT_REFUSED_ELEMENTS = new Set([
  "script", "style", "base", "meta", "link",
  "iframe", "frame", "frameset", "object", "embed", "applet", "portal", "fencedframe",
  "set", "animate", "animatecolor", "animatemotion", "animatetransform",
]);

// The platform's own accessors, taken from the prototypes once, at chunk load (see UNFORGEABLE READS).
// `null` where there is no DOM (the chunk is then inert: `_scrml_meta_emit_insert` returns at once).
function _scrml_meta_emit_dom() {
  const w = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null);
  if (!w || typeof w.Node !== "function" || typeof w.Element !== "function" || typeof w.Document !== "function") {
    return null;
  }
  const getter = (proto, name) => {
    for (let p = proto; p; p = Object.getPrototypeOf(p)) {
      const d = Object.getOwnPropertyDescriptor(p, name);
      if (d && typeof d.get === "function") return d.get;
    }
    return null;
  };
  const setter = (proto, name) => {
    for (let p = proto; p; p = Object.getPrototypeOf(p)) {
      const d = Object.getOwnPropertyDescriptor(p, name);
      if (d && typeof d.set === "function") return d.set;
    }
    return null;
  };
  const method = (proto, name) => {
    for (let p = proto; p; p = Object.getPrototypeOf(p)) {
      const d = Object.getOwnPropertyDescriptor(p, name);
      if (d && typeof d.value === "function") return d.value;
    }
    return null;
  };
  const N = w.Node.prototype;
  const E = w.Element.prototype;
  const D = w.Document.prototype;
  // DOMImplementation's prototype: the global constructor's, or (where the environment does not expose
  // the constructor) the prototype of the real `document.implementation`, read once at load through the
  // captured Document getter — `document` itself is unforgeable.
  const implGetter = getter(D, "implementation");
  let implProto = w.DOMImplementation ? w.DOMImplementation.prototype : null;
  if (!implProto && implGetter && typeof document !== "undefined") {
    const impl = implGetter.call(document);
    implProto = impl ? Object.getPrototypeOf(impl) : null;
  }
  const dom = {
    firstChild: getter(N, "firstChild"),
    nextSibling: getter(N, "nextSibling"),
    parentNode: getter(N, "parentNode"),
    nodeType: getter(N, "nodeType"),
    appendChild: method(N, "appendChild"),
    removeChild: method(N, "removeChild"),
    localName: getter(E, "localName"),
    namespaceURI: getter(E, "namespaceURI"),
    attributes: getter(E, "attributes"),
    setAttribute: method(E, "setAttribute"),
    innerHTML: setter(E, "innerHTML") || (w.HTMLElement ? setter(w.HTMLElement.prototype, "innerHTML") : null),
    attrsLength: w.NamedNodeMap ? getter(w.NamedNodeMap.prototype, "length") : null,
    attrsItem: w.NamedNodeMap ? method(w.NamedNodeMap.prototype, "item") : null,
    attrName: w.Attr ? getter(w.Attr.prototype, "name") : null,
    attrValue: w.Attr ? getter(w.Attr.prototype, "value") : null,
    templateContent: w.HTMLTemplateElement ? getter(w.HTMLTemplateElement.prototype, "content") : null,
    implementation: implGetter,
    querySelector: method(D, "querySelector"),
    createElement: method(D, "createElement"),
    body: getter(D, "body") || (w.HTMLDocument ? getter(w.HTMLDocument.prototype, "body") : null),
    createHTMLDocument: implProto ? method(implProto, "createHTMLDocument") : null,
    // The live prototype the named-property rule (S459 round 4 F2) asks `in` of, on top of the
    // generated HTMLFormElement member table. Captured here, at load; data cannot reach it.
    formProto: w.HTMLFormElement ? w.HTMLFormElement.prototype : null,
  };
  for (const k in dom) {
    if (dom[k] === null && k !== "templateContent" && k !== "formProto") return null;
  }
  return dom;
}
const _SCRML_META_EMIT_DOM = _scrml_meta_emit_dom();

// Is `el` (an element of the page) inside an HTML `<form>`? Walked up through the captured `parentNode`
// / `localName` / `namespaceURI` accessors — the page's own markup may name its elements anything.
function _scrml_meta_emit_inside_form(el) {
  const dom = _SCRML_META_EMIT_DOM;
  for (let p = dom.parentNode.call(el); p; p = dom.parentNode.call(p)) {
    if (dom.nodeType.call(p) !== 1) continue;
    if (dom.localName.call(p) === "form" && dom.namespaceURI.call(p) === _SCRML_EMIT_NS_HTML) return true;
  }
  return false;
}

// The violation the tree rooted at `root` carries, as a short description naming the element and the
// attribute but NEVER the value (it is data, and may be sensitive) — or "" when it carries none.
// Walks every descendant, including an HTML `<template>`'s content, reading ONLY through the captured
// accessors. `inPageForm`: the insertion point sits inside a page `<form>` (S459 round 4 F1) — then a
// form-associated control anywhere in the tree is refused (it would join that form's submission and
// named properties: an injected `<input type=hidden name=amount>` fed the page form's FormData, an
// injected `<button type=submit>` submitted it) — except inside an HTML `<template>`'s inert content
// (S460 N5). A named-property `id` / `name` (F2) is reported only
// when the walk finds nothing else, so a refusal names what such a shadowing would have hidden.
function _scrml_meta_emit_violation(root, inPageForm) {
  const dom = _SCRML_META_EMIT_DOM;
  const call = (fn, self, a, b) => fn.call(self, a, b);
  // `document: null`: no document table ships (S460 N6; why: `_scrml_emit_named_value_verdict`).
  const members = { document: null, form: _SCRML_EMIT_FORM_MEMBERS, formProto: dom.formProto };
  // [node, insideAForm, insideTemplateContent]. Template content is inert — it joins no form and no
  // radio group — so the page-form rule, the form half of the named-property rule and the radio-group
  // rule do not apply inside it (S460 N5); every other rule does.
  const stack = [];
  let shadowing = "";
  const pushChildren = (parent, inForm, inTemplate) => {
    const kids = [];
    for (let c = call(dom.firstChild, parent); c; c = call(dom.nextSibling, c)) kids.push(c);
    for (let k = kids.length - 1; k >= 0; k--) stack.push([kids[k], inForm, inTemplate]);
  };
  pushChildren(root, inPageForm === true, false);
  while (stack.length > 0) {
    const entry = stack.pop();
    const node = entry[0];
    let inForm = entry[1];
    const inTemplate = entry[2];
    const type = call(dom.nodeType, node);
    if (type === 1) {
      // Names are folded the way the HTML tokenizer folds them — ASCII only (a KELVIN SIGN stays
      // itself, as it does in the compile-time judge).
      const tag = _scrml_emit_fold_name(String(call(dom.localName, node)));
      const ns = call(dom.namespaceURI, node);
      if (_SCRML_META_EMIT_REFUSED_ELEMENTS.has(tag)) return "a <" + tag + "> element";
      const isCustom = _SCRML_CUSTOM_ELEMENT_NAME.test(tag);
      if (!_SCRML_META_EMIT_KNOWN_ELEMENTS.has(tag) && !isCustom) {
        return "a <" + tag + "> element (not a standard HTML / SVG / MathML element or a custom element)";
      }
      if (inPageForm === true && inTemplate !== true && _scrml_emit_is_form_control(ns, tag, isCustom)) {
        return "a <" + tag + "> element inserted inside a page <form> (a form control there would join " +
          "that form's submission)";
      }
      const attrs = call(dom.attributes, node);
      const n = call(dom.attrsLength, attrs);
      const read = [];
      let hasNameAttr = false;
      for (let i = 0; i < n; i++) {
        const a = call(dom.attrsItem, attrs, i);
        const name = _scrml_emit_fold_name(String(call(dom.attrName, a)));
        if (name === "name") hasNameAttr = true;
        read.push([name, String(call(dom.attrValue, a))]);
      }
      for (let i = 0; i < read.length; i++) {
        const name = read[i][0];
        const value = read[i][1];
        const nameVerdict = _scrml_emit_attr_name_verdict(ns, tag, name);
        if (nameVerdict !== "") return nameVerdict;
        const valueVerdict = _scrml_emit_attr_value_verdict(name, value, tag);
        if (valueVerdict !== "") return valueVerdict + " on <" + tag + ">";
        if (shadowing === "") {
          // Recorded, not returned: the walk goes on (see above).
          shadowing = _scrml_emit_named_value_verdict(ns, tag, name, value, hasNameAttr, inForm, isCustom, members);
        }
        if (_scrml_is_url_attr("", name) && !_scrml_url_value_admitted(name, value)) {
          return "a " + name + "= URL on <" + tag + "> whose scheme is not admitted";
        }
        // §5.2 "Data-supplied CSS-url attributes" (S479 carve-out 2; S480 r1 F3) — `fill=`, `filter=`,
        // … are read as CSS: judged by the same reader as every other data write of one
        // (runtime-css-attr-guard.js, chunk 'cssattrguard'). `name` is already folded.
        if (_SCRML_CSS_URL_ATTRS.has(name) && !_scrml_css_attr_value_admitted(value, false)) {
          return "a " + name + "= value on <" + tag + "> that is not a plain CSS value (the browser reads it as CSS; " +
            "no url() other than a same-document url(#id))";
        }
      }
      // A radio button outside any form joins the radio group of every form-less radio of the same
      // name in the page — checking it unchecks the page's (S460 N2a). Inside an emitted `<form>` its
      // group is that form's (a page form around the insertion point already refused it above).
      if (tag === "input" && ns === _SCRML_EMIT_NS_HTML && inForm !== true && inTemplate !== true) {
        let inputType = "";
        let groupName = "";
        for (let i = 0; i < read.length; i++) {
          if (read[i][0] === "type") inputType = _scrml_emit_fold_name(read[i][1]);
          if (read[i][0] === "name") groupName = read[i][1];
        }
        if (inputType === "radio" && groupName !== "") {
          return "a name= on an <input type=radio> outside any form (it would join a radio group of the page)";
        }
      }
      if (tag === "form" && ns === _SCRML_EMIT_NS_HTML) inForm = true;
      // Only an HTML `<template>` has a content fragment (the getter throws on an SVG / MathML element
      // named `template`, which is an ordinary element whose children are walked below).
      if (tag === "template" && ns === _SCRML_EMIT_NS_HTML && dom.templateContent !== null) {
        const content = call(dom.templateContent, node);
        if (content) stack.push([content, false, true]);
      }
    } else if (type === 11) {
      // a template's content fragment — its children are judged like any others
    } else if (type !== 3 && type !== 8) {
      return "a node of type " + type;
    }
    pushChildren(node, inForm, inTemplate);
  }
  return shadowing;
}

// Report one refusal to the §19.6.8 logging surface.
function _scrml_meta_emit_report(scopeId, violation) {
  const err = new Error(
    "refused meta.emit() output for ^{} block " + scopeId + ": it contains " + violation + " (SPEC " +
    "§22.4.1, §22.12). Runtime meta.emit() admits the same closed markup as compile-time emit(): " +
    "standard elements, attributes on the admitted list (no event handlers, no data-scrml or " +
    "data-scrml-* name), and URL attributes with http:, https:, ftp:, mailto:, tel:, sms:, a relative " +
    "URL, or a raster data:image on an image source, and CSS-url attributes (fill=, filter=, …) holding " +
    "a plain CSS value. Nothing was written.",
  );
  if (typeof _scrml_error_boundary_log === "function") {
    _scrml_error_boundary_log("meta-emit", err);
  } else if (typeof console !== "undefined" && typeof console.error === "function") {
    console.error("[scrml meta-emit] " + err.message);
  }
}

// Parse `htmlString` inertly as the content of a `contextTag` element in a document with no browsing
// context and judge it. Returns that inert container when admitted; `null` (after one report) when not.
// `inPageForm`: the insertion point is inside a page `<form>` (see `_scrml_meta_emit_violation`).
// Anything the reading throws (an accessor the environment applies differently) is a refusal too —
// reported, nothing written, never an exception out of `meta.emit`.
function _scrml_meta_emit_checked(scopeId, htmlString, contextTag, inPageForm) {
  const dom = _SCRML_META_EMIT_DOM;
  let violation = "";
  let container = null;
  try {
    const impl = dom.implementation.call(document);
    const inert = dom.createHTMLDocument.call(impl, "");
    container = dom.createElement.call(inert, contextTag || "span");
    dom.innerHTML.call(container, String(htmlString)); // the string conversion the ungated path used
    violation = _scrml_meta_emit_violation(container, inPageForm);
  } catch (e) {
    violation = "markup the gate could not read to the end (reading it threw)";
  }
  if (violation === "") return container;
  _scrml_meta_emit_report(scopeId, violation);
  return null;
}

// `meta.emit(html)`: judge, then move the judged nodes to the block's placeholder (created at the end
// of `<body>` when the block has none), replacing what it held. Every DOM read and write here goes
// through the captured accessors too: `document.querySelector` itself can be shadowed by a `name=`.
function _scrml_meta_emit_insert(scopeId, htmlString) {
  const dom = _SCRML_META_EMIT_DOM;
  if (typeof document === "undefined") return;
  if (dom === null) {
    // A document but none of the platform accessors the gate reads through: it cannot judge, so it
    // writes nothing — and says so (fail closed, never silent).
    _scrml_meta_emit_report(scopeId, "markup this environment gives the gate no unforgeable DOM accessors to read");
    return;
  }
  let placeholder = dom.querySelector.call(document, '[data-scrml-meta="' + scopeId + '"]');
  const contextTag = placeholder ? String(dom.localName.call(placeholder)) : "span";
  // The fallback span is appended to <body>, outside any form.
  const inPageForm = placeholder ? _scrml_meta_emit_inside_form(placeholder) : false;
  const judged = _scrml_meta_emit_checked(scopeId, htmlString, contextTag, inPageForm);
  if (judged === null) return;
  if (!placeholder) {
    placeholder = dom.createElement.call(document, "span");
    dom.setAttribute.call(placeholder, "data-scrml-meta", scopeId);
    dom.appendChild.call(dom.body.call(document), placeholder);
  }
  for (let c = dom.firstChild.call(placeholder); c; c = dom.firstChild.call(placeholder)) {
    dom.removeChild.call(placeholder, c);
  }
  for (let c = dom.firstChild.call(judged); c; c = dom.firstChild.call(judged)) {
    dom.appendChild.call(placeholder, c);
  }
}
// <<< END verbatim impl#1 runtime meta.emit gate

// ---------------------------------------------------------------------------
// DOM. Views are cloned from <template> elements the printer writes into the
// page; holes are addressed by child-index path, looked up before any wiring.
// ---------------------------------------------------------------------------

// s474 (boot-gate-await-mathml) — a FOREIGN-CONTENT template. A template's content is parsed where the
// printer writes it — in the page head, an HTML context — so content that will be inserted into an
// `<svg>` or a `<math>` (an `if=` arm, an `<each>` row, a component's renders, slot content) would be
// built as HTML elements (`<text>` / `<mi>` as HTMLUnknownElement) that never render there. The printer
// (print.scrml `wrapNs`) instead writes such content inside the parse context it needs, and marks the
// template `data-scrml-ns`; here the clone is unwrapped to the content itself. The wrapper chain per
// context, and so its depth: svg `<svg>`, math `<math>`, math-text `<math><mi>` (a MathML text
// integration point), annot `<math><annotation-xml>`. No parse happens here — the browser's parser
// built the nodes once, from the page; this only moves them. Fail closed: an unknown marker, or a
// wrapper level that is not exactly one node (the parser moved content out of the wrapper), throws
// rather than rendering a tree whose hole paths would not line up.
const NS_DEPTH = { svg: 1, math: 1, "math-text": 2, annot: 2 };

// s474 r1 (review of #1727, F3 defence in depth) — THE SHAPE CHECK. Holes are addressed by child-index
// path over the tree as the printer WROTE it; if the browser's parser restructured a template (a node
// moved, wrapped or dropped), every path after the change names the wrong node, and a `show=` hid the
// wrong element (the secret stayed visible). The analyzer refuses the restructurings it models (SPEC
// §24.5); this is the backstop for the rest. The printer writes `data-scrml-shape`, a hash of the
// content's element / comment structure (print.scrml `shapeHash` — the same walk and the same hash);
// the first clone of each template compares it with what was actually built and throws on a mismatch,
// so the template never mounts. Text is not part of the shape; nor are an HTML `<template>`'s
// children (its content is separate).
const shapeChecked = new WeakSet();
const XHTML_NS = "http://www.w3.org/1999/xhtml";
// HTML elements whose children are not walked — print.scrml `shapeOpaque`, the same list: a `<template>`'s
// content is not its children, and a raw-text / RCDATA element holds only text in a browser (a DOM that
// builds elements there — happy-dom does, for `<textarea><!----></textarea>` — is not judged by them).
const SHAPE_OPAQUE = new Set(["template", "script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript", "plaintext"]);

// s474 r2 (re-review R1): a hole path is a `childNodes` index, which counts text nodes, so a text node
// is part of the shape — `depth:t;`, once per run of adjacent text (presence only, never content), as
// print.scrml `shapeOf` writes it.
function shapeWalk(n, depth) {
  let s = "";
  let inText = false;
  for (const c of n.childNodes) {
    if (c.nodeType === 3) {
      if (!inText) s += depth + ":t;";
      inText = true;
      continue;
    }
    inText = false;
    if (c.nodeType === 8) s += depth + ":#;";
    else if (c.nodeType === 1) {
      const name = c.localName.toLowerCase();
      s += depth + ":" + name + ";";
      if (!(c.namespaceURI === XHTML_NS && SHAPE_OPAQUE.has(name))) s += shapeWalk(c, depth + 1);
    }
  }
  return s;
}

/** The hash print.scrml `shapeHash` writes: 7, then h = (h·31 + code unit) mod 2^31−1. */
export function shapeHash(root) {
  const s = shapeWalk(root, 0);
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 2147483647;
  return String(h);
}

function checkShape(t, id, root) {
  const want = t.getAttribute("data-scrml-shape");
  if (want === null || shapeChecked.has(t)) return;
  if (shapeHash(root) !== want) {
    throw new Error(`<template id="${id}">: the HTML parser restructured this markup (its element structure is not the one compiled), so its holes would address the wrong nodes — not mounted (SPEC §24.5)`);
  }
  shapeChecked.add(t);
}

/** A fresh clone of template `id`'s content. */
export function template(id) {
  const t = document.getElementById(id);
  if (!t) throw new Error(`missing <template id="${id}">`);
  const ns = t.getAttribute("data-scrml-ns");
  if (ns === null) {
    checkShape(t, id, t.content);
    return t.content.cloneNode(true);
  }
  const depth = Object.prototype.hasOwnProperty.call(NS_DEPTH, ns) ? NS_DEPTH[ns] : 0;
  if (depth === 0) throw new Error(`<template id="${id}">: unknown data-scrml-ns "${ns}"`);
  let n = t.content;
  for (let i = 0; i < depth; i++) {
    if (n.childNodes.length !== 1) throw new Error(`<template id="${id}">: its ${ns} wrapper does not hold exactly one node`);
    n = n.firstChild;
  }
  checkShape(t, id, n);
  const inner = n.cloneNode(true);
  // s480 r2 (review N3): the view is a fragment of the template content's INERT document (a
  // shallow clone of the content, as the HTML path's view is a deep one) — never of the live
  // document — so a bound attribute written at the mount (an `<img>`'s `src` in a
  // `<foreignObject>`) loads nothing until `insert` adopts the view into the page (an element a
  // trap holds is out of the fragment before that).
  const frag = t.content.cloneNode(false);
  while (inner.firstChild) frag.appendChild(inner.firstChild);
  return frag;
}

/** The node at a child-index path under `node`. */
export function at(node, ...path) {
  let n = node;
  for (const i of path) n = n.childNodes[i];
  return n;
}

/** Insert a fragment before `anchor`; its nodes are removed when `scope` is disposed. */
export function insert(scope, frag, anchor) {
  const nodes = [...frag.childNodes];
  anchor.parentNode.insertBefore(frag, anchor);
  scope.own(() => {
    for (const n of nodes) {
      if (n.parentNode) n.parentNode.removeChild(n);
      // s480 — a top-level element held out by a trapped attribute, or the placeholder holding its place
      const m = holeMate.get(n);
      if (m !== undefined && m.parentNode) m.parentNode.removeChild(m);
    }
  });
}

/** A comment anchor appended to `parent` — the mount point of the program's view. */
export function mount(parent) {
  const a = document.createComment("scrml");
  parent.appendChild(a);
  return a;
}

function display(v) { return v === null || v === undefined ? "" : String(v); }

/** A text hole: replaces the marker comment with a text node kept equal to `fn()`. */
export function text(scope, marker, fn) {
  const t = document.createTextNode("");
  marker.parentNode.replaceChild(t, marker);
  hole(scope, () => { t.data = display(fn()); }, () => { t.data = ""; });
}

/**
 * s482 — the content of a raw-text / RCDATA element (`<textarea>`, `<title>`, `<xmp>`, …) that holds a
 * `${}`: ONE text value, kept equal to `fn()`'s parts (static text and interpolated values, each shown
 * as a text hole shows it) joined. The HTML parser reads such content as one text node, so it has no
 * place for a per-part anchor. A `<textarea>`'s content is its default value; its current value is
 * set too (SPEC §34 W-RCDATA-BIND-VALUE-CONTENT-CONFLICT: content in a `<textarea>` "compiles to a
 * reactive `.value` bind"), so a change shows even after the user has typed.
 */
export function textContent(scope, el, fn) {
  const textarea = el.localName === "textarea";
  hole(scope, () => {
    const s = fn().map(display).join("");
    el.textContent = s;
    if (textarea) el.value = s;
  }, () => {
    el.textContent = "";
    if (textarea) el.value = "";
  });
}

// ---------------------------------------------------------------------------
// s473 — §5.2 "Data never chooses where a form posts or where the page goes
// (S473)". Ruled (user-voice-scrml.md "S473 owner questions round 2" items 1
// and 2): "Form `action` / `formaction` from data: REFUSED unless static." and
// "`<meta http-equiv=\"refresh\">` from data: REFUSED." Refused data writes,
// names and tags compared ASCII case-insensitively:
//   - `action` on a `<form>`, and `formaction` on any element (inert off
//     `<button>` / `<input>` — fail closed);
//   - `form` (the form owner) on any element — data never chooses which form
//     a control is submitted with (S473 PA ruling, extends round 2 item 1);
//   - `http-equiv` on a `<meta>` (data never chooses a pragma; such a
//     `<meta>` is recorded as computed), and `content` on a `<meta>` whose
//     `http-equiv` holds the text `refresh` anywhere (a superset of the
//     browser's keyword test) or is computed.
// `rt.attr` is the bootstrap's only data attribute writer; a static value is in
// the template and never reaches it.
// ---------------------------------------------------------------------------
const computedMetaEquivs = new WeakSet();

function refusedNavigationWrite(el, name) {
  const tag = String(el.tagName || "").toLowerCase();
  const lower = String(name).toLowerCase();
  let report = null;
  if (lower === "formaction" || (lower === "action" && tag === "form")) {
    report = "[scrml url-guard] refused a data-supplied form submission target (`action` on a <form>, or `formaction`): where a form's fields are sent is never chosen by data (SPEC §5.2). The attribute was removed.";
  } else if (lower === "form") {
    report = "[scrml url-guard] refused a data-supplied `form` owner: which form a control is submitted with is never chosen by data (SPEC §5.2). The attribute was removed.";
  } else if (tag === "meta" && (lower === "http-equiv" || (lower === "content" && metaRefreshes(el)))) {
    if (lower === "http-equiv") computedMetaEquivs.add(el);
    report = "[scrml url-guard] refused a data-supplied `http-equiv`, or `content` on a refresh <meta>: data never navigates the page (SPEC §5.2). The attribute was removed.";
  }
  if (report === null) return false;
  el.removeAttribute(name);
  console.error(report);
  return true;
}

function metaRefreshes(el) {
  if (computedMetaEquivs.has(el)) return true;
  const v = el.getAttribute("http-equiv");
  return v !== null && v.toLowerCase().includes("refresh");
}

/**
 * A bound attribute. Every value written here comes from data (a static
 * attribute is in the template, never written here), so a URL-valued name is
 * judged on EVERY write — the first and each reactive re-write — by the §5.2
 * rule 3 guard: a non-admitted scheme is written as `about:blank` and
 * reported once per write (never the value). The value is converted to a
 * string first, exactly as the write converts it (§5.2 rule 3 "The test").
 */
export function attr(scope, el, name, fn) {
  if (refusedDataAttrWrite(el, name)) return;
  // s473 — user-voice-scrml.md S472 "five PA recs" item 3: "A data-bound
  // `href` on a `<link>` whose `rel` contains `stylesheet` (or is computed) is
  // REFUSED." The compiler refuses it (E-ATTR-STYLESHEET-HREF); this is the
  // wall behind it (fail closed — no compiled program asks for this write).
  if (isLinkElement(el)) {
    if (isHrefName(name)) {
      if (linkLoadsSheet(el)) { refuseLinkHref(el, name); return; }
      dataHrefLinks.add(el);
    } else if (String(name).toLowerCase() === "rel") {
      computedLinkRels.add(el);
      for (const a of [...el.attributes]) {
        if (dataHrefLinks.has(el) && isHrefName(a.name)) refuseLinkHref(el, a.name);
      }
    }
  }
  const guard = writeGuardOf(el, name);
  const sheetHref = isLinkElement(el) && isHrefName(name);
  requireScope(scope, "a bound attribute");
  const h = elementHoleOf(el);
  const slot = { name, guard, v: undefined, refused: false, dirty: false };
  const tok = {};
  h.writers.set(tok, slot);
  scope.own(() => { h.writers.delete(tok); h.trapped.delete(tok); });
  // A LIVE element's attribute is written at once, in the writer's own run, exactly as before
  // s480 (the order of attribute writes on a page with no trap is unchanged). A HELD element's
  // writer only evaluates (the value waits in `slot`); nothing is written to it while it is out.
  new Effect(scope, () => {
    slot.refused = sheetHref && linkLoadsSheet(el);
    slot.v = slot.refused ? undefined : fn();
    h.trapped.delete(tok);
    if (h.out) {
      slot.dirty = true;
      if (h.trapped.size === 0) heldToRestore.add(el);
      return;
    }
    slot.dirty = false;
    if (slot.refused) refuseLinkHref(el, name);
    else writeAttr(el, name, slot.v, guard);
  }, () => holdElement(el, h, tok));               // the element leaves the page; nothing is written to it
}

// The one bound-attribute write (§5.2 guard applied). `changedOnly` (s480 recovery): skip a write
// that would leave the attribute as it is.
function writeAttr(el, name, v, guard, changedOnly = false) {
  if (v === null || v === undefined || v === false) {
    if (!changedOnly || el.hasAttribute(name)) el.removeAttribute(name);
    return;
  }
  const s = v === true ? "" : String(v);
  const w = guard === null ? s : guard(s);
  if (changedOnly && el.getAttribute(name) === w) return;
  if (w === null) el.removeAttribute(name);
  else el.setAttribute(name, w);
}

// ---------------------------------------------------------------------------
// s480 — A TRAPPED DATA-BOUND ATTRIBUTE: THE ELEMENT CARRYING IT IS THE HOLE
// (SPEC §19.17; ruling user-voice-scrml.md S480 "⭐ RULED — what a trap renders
// when "nothing" is not safe" item 1: "the element is replaced by a
// placeholder, the trap is reported once, and the element is restored on
// recovery — on mount and on every re-run. Removing the element is the only
// state that is safe for every attribute").
//
// A live element's writers write at once, each at its own place in the flush,
// as on base. When a writer's run throws, the element (with its subtree) is
// replaced in place by a placeholder comment — at the mount that is inside the
// template clone (inert, on both template paths: `template`), BEFORE the view
// is inserted, so a trapped `<iframe>` never starts loading without its
// `sandbox`; on a re-run it leaves the live page. Nothing is removed from it (a
// removed `referrerpolicy` / `crossorigin` on a live `<img>` is a refetch
// without the policy): the stale value leaves the page with the element. An
// attribute written earlier in the same flush was written while the element
// was live, as on base. The run is an `Effect` hole (`blank` = hold), so a trap
// is reported once per trapped run and any other throw is rethrown after the
// hold — from the run of the writer that threw, which stays trapped (fail
// closed) until it reads again.
//
// While the element is out, its writers still run (tracking their inputs) but
// write nothing: each value waits in its slot. RECOVERY is a post-flush step
// (`restoreHeld`, from `drainQueues` once the flush's render effects — list
// re-renders included — have all run, so no half-updated state is ever
// written): if every writer of the element now reads without a throw, every
// waiting value that differs from the element's attribute is written, THEN the
// element goes back in the placeholder's place. If any still traps, it stays
// out. So the element is never in the page with a stale or absent value of a
// data-bound attribute (`sandbox`, `href`, `src`, `referrerpolicy`, `allow` …).
//
// The element that comes back is the SAME node: its listeners, its own holes
// and child scopes, and a control's value are kept (nothing is registered
// twice). The cost, on a trap path only: focus, selection and scroll position
// are lost, and a frame or media element reloads, when it returns.
// `insert`'s cleanup removes a held element's placeholder (`holeMate`).
// ---------------------------------------------------------------------------
const elementHoles = new WeakMap();
const holeMate = new WeakMap();
const heldToRestore = new Set();

function elementHoleOf(el) {
  let h = elementHoles.get(el);
  if (h === undefined) {
    h = { writers: new Map(), trapped: new Set(), ph: null, out: false };
    elementHoles.set(el, h);
  }
  return h;
}

function holdElement(el, h, tok) {
  h.trapped.add(tok);
  const slot = h.writers.get(tok);
  if (slot !== undefined) slot.dirty = false;      // the thrower's slot is blank: never written
  if (h.out) return;
  h.out = true;
  if (h.ph === null) {
    h.ph = document.createComment("trapped");
    holeMate.set(el, h.ph);
    holeMate.set(h.ph, el);
  }
  if (el.parentNode) el.parentNode.replaceChild(h.ph, el);
}

// The post-flush recovery step (above). An element whose placeholder is no longer in any tree
// (its row or arm was disposed in the flush) is dropped, never written.
//
// s480 r4 (review of #2017, N2) — RE-ENTRANCY. Host code can run synchronously inside a restore: a
// custom element's `attributeChangedCallback` on a write, its `connectedCallback` on the re-insert.
// A cell it writes queues a writer, and every slot not yet restored may now be stale. So after
// each write pass and after each re-insert, a non-empty queue ends this step: the elements not yet
// restored (and, after a write pass, this one, still out) go back into `heldToRestore`, and
// `drainQueues` runs the queued writers first — an element is restored only once the change of
// state has finished (§19.17).
//
// BOUND: scrml code never runs inside a restore (an `<effect>` body writes no cell, §6.7.4), so an
// element is restored at most once per flush unless host code re-enters. Host callbacks that trap
// and recover an element on every insert / removal would loop forever; an element is therefore
// tried at most RESTORE_TRIES times per flush. Past that it stays out (fail closed: held is the safe
// state for every attribute, §19.17), a console warning names the cause, and it is tried again the
// next time one of its writers runs without a trap.
const RESTORE_TRIES = 8;
const restoreTries = new Map();

function restoreHeld() {
  const els = [...heldToRestore];
  heldToRestore.clear();
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const h = elementHoles.get(el);
    if (h === undefined || !h.out || h.trapped.size > 0) continue;
    if (h.ph.parentNode === null) continue;
    const n = (restoreTries.get(el) ?? 0) + 1;
    restoreTries.set(el, n);
    if (n > RESTORE_TRIES) {
      if (n === RESTORE_TRIES + 1) console.warn("[scrml trap] an element held out by a trapped attribute was re-trapped each time it was restored in one update (host code running on its insert or removal); it stays out until its attributes are next recomputed (SPEC §19.17).");
      continue;
    }
    for (const s of h.writers.values()) {
      if (!s.dirty) continue;
      s.dirty = false;
      if (s.refused) { refuseLinkHref(el, s.name); continue; }
      if (s.cls) {                                   // a `class:` toggle (classOn): only its own class
        if (el.classList.contains(s.name) !== s.v) el.classList.toggle(s.name, s.v);
        continue;
      }
      writeAttr(el, s.name, s.v, s.guard, true);
    }
    if (queue.size > 0) {                            // a write re-entered: settle first, then try again
      for (let j = i; j < els.length; j++) heldToRestore.add(els[j]);
      return;
    }
    h.out = false;
    h.ph.parentNode.replaceChild(el, h.ph);
    if (queue.size > 0) {                            // the re-insert re-entered: settle the rest first
      for (let j = i + 1; j < els.length; j++) heldToRestore.add(els[j]);
      return;
    }
  }
}

/**
 * THE data-attribute walls — every write of an attribute from data goes through this one function:
 * `rt.attr` (markup's bound attributes) and `hostAttrValue` (a `<host>` binding's `setAttribute`,
 * s473-host-allowlist-b, #1674 review F1 — "one write path, not two"). True when the write is refused:
 * the attribute is removed and the refusal reported (never the value). Followed, for an admitted write,
 * by `writeGuardOf` (a URL or CSS-url value).
 */
function refusedDataAttrWrite(el, name) {
  // s473 — §5.2 "Data never chooses where a form posts or where the page goes
  // (S473)": the compiler refuses these writes (E-ATTR-FORM-ACTION /
  // E-ATTR-META-REFRESH); this is the wall behind it (fail closed — `fn` is
  // never run, and a value already on the element is removed).
  if (refusedNavigationWrite(el, name)) return true;
  // s472 — §65.4.2: "you cannot apply an arbitrary runtime string as a
  // style-value (that would reopen the injection surface)". The compiler
  // refuses `style=` from data (E-STYLE-VALUE-NOT-STYLE), so no compiled
  // program asks for this; a `style` write from data is still never made
  // (fail closed): the attribute is removed and the refusal reported — never
  // the value; `fn` is never run). A static `style="…"` is in the template and
  // is not written here.
  if (String(name).toLowerCase() === "style") {
    el.removeAttribute(name);
    console.warn("[scrml css-guard] refused a data-supplied `style` write: a style is never built from data (SPEC §65.4.2). The attribute was removed.");
    return true;
  }
  // s473 — §5.2 "Data never moves the document base (S473)": a `<base>`'s
  // `href` is never written from data. The compiler refuses it
  // (E-ATTR-BASE-HREF); this is the wall behind it (fail closed — no compiled
  // program asks for this write; `fn` is never run, and an `href` already on
  // the element is removed rather than left standing).
  if (isBaseElement(el) && isHrefName(name)) {
    el.removeAttribute(name);
    console.warn("[scrml url-guard] refused a data-supplied `href` on a <base>: the document's base URL is never chosen by data (SPEC §5.2). The attribute was removed.");
    return true;
  }
  // s473 — §5.2 rule 2 "`srcdoc` in every form": a `srcdoc` whose value is
  // not a static string is a compile error (E-ATTR-INTERP-EXECUTABLE), so no
  // compiled program asks for this write either; the wall behind it, on any
  // element (fail closed).
  if (String(name).toLowerCase() === "srcdoc") {
    el.removeAttribute(name);
    console.warn("[scrml url-guard] refused a data-supplied `srcdoc`: an HTML document is never written from data (SPEC §5.2). The attribute was removed.");
    return true;
  }
  // s473 — user-voice-scrml.md S472 "five PA recs" item 3: "A data-bound
  // `href` on a `<link>` whose `rel` contains `stylesheet` (or is computed) is
  // REFUSED." The compiler refuses it (E-ATTR-STYLESHEET-HREF); this is the
  // wall behind it (fail closed — no compiled program asks for this write).
  if (isLinkElement(el) && isHrefName(name) && linkLoadsSheet(el)) { refuseLinkHref(el, name); return true; }
  return false;
}

// s473 — the `<base>` element (tag compared case-insensitively; HTML reads
// `<BASE>` as `<base>`). The names that would set its URL are `isHrefName`'s
// (`href` in any case, any prefixed spelling — fail closed).
function isBaseElement(el) {
  return String(el.tagName || "").toLowerCase() === "base";
}

// ---------------------------------------------------------------------------
// s473 — a stylesheet `<link>`'s `href` is never written from data (ruled S472,
// see `attr`). A `<link>` whose `rel` is bound (computed) is recorded when that
// `attr` runs; a data `href` is recorded when its own runs — so either order is
// caught: an href written first is removed when a bound `rel` arrives, and every
// later write of it is refused (`linkLoadsSheet` holds from then on).
// ---------------------------------------------------------------------------
const computedLinkRels = new WeakSet();
const dataHrefLinks = new WeakSet();

function isLinkElement(el) {
  return String(el.tagName || "").toLowerCase() === "link";
}

// `href` in any case, and any prefixed spelling of it (`xlink:href`) — fail closed.
function isHrefName(name) {
  const lower = String(name).toLowerCase();
  return lower === "href" || lower.endsWith(":href");
}

// The `rel` loads (or may load) a stylesheet: it is computed, or its text holds
// `stylesheet` anywhere (ASCII case-insensitive — a token list such as
// `alternate stylesheet` included; the substring test is a superset of the
// token test, fail closed).
function linkLoadsSheet(el) {
  if (computedLinkRels.has(el)) return true;
  const rel = el.getAttribute("rel");
  return rel !== null && rel.toLowerCase().includes("stylesheet");
}

function refuseLinkHref(el, name) {
  el.removeAttribute(name);
  console.warn("[scrml css-guard] refused a data-supplied `href` on a <link> whose `rel` loads a stylesheet or is computed: a stylesheet is never chosen by data (SPEC §5.2). The attribute was removed.");
}

// ---------------------------------------------------------------------------
// s473 (gap g-boot-svg-presentation-attr-css-url-unguarded-s472) — attributes
// the browser reads as a CSS value whose grammar takes a `<url>` or an
// `<image>`. A data `fill="url(https://…)"` is a network fetch (Chromium-
// verified for fill, stroke, filter, mask, clip-path, marker-start, cursor and
// a SMIL `<set attributeName="filter">`), so each such write is judged by
// `cssValueOf` — the §25.7 bridge's guard, the one CSS-value reader (it
// refuses `url(`, `image-set(`, `var(`, quotes, escapes, `;` and `!`).
// Matched by lowercased name on every element (SVG or not — fail closed).
//
// The list (one entry per property whose value grammar admits `<url>` /
// `<image>`, among the SVG presentation attributes):
//   - SVG 2 §13 Painting: `fill`, `stroke` (`<paint>` includes `<url>`);
//     `marker-start`, `marker-mid`, `marker-end` (`none | <url>`) and the
//     `marker` shorthand (not a presentation attribute in SVG 2, one in some
//     engines — listed, fail closed);
//   - CSS Masking 1: `clip-path` (`<clip-source>` = `<url>`), `mask` (the
//     shorthand: `<mask-reference>` = `<image> | <mask-source>`);
//   - Filter Effects 1: `filter` (`<url>` in `<filter-value-list>`);
//   - CSS Basic UI 4 §5.1 / SVG 2's presentation attribute table: `cursor`
//     (`[<url> [<x> <y>]?]#`);
//   - SVG 1.1 ch. 12 Color: `color-profile` (`<iri>` — obsolete, still listed).
// Every other presentation attribute (colours, lengths, keywords, `d`'s
// `path()`, `transform`) takes no URL and is written unchanged.
// ---------------------------------------------------------------------------
const CSS_URL_ATTRS = new Set([
  "fill", "stroke", "marker", "marker-start", "marker-mid", "marker-end",
  "clip-path", "mask", "filter", "cursor", "color-profile",
]);

// The CSS functions these attributes need beyond the bridge's colour / math
// set, none of which takes a URL: the Filter Effects 1 §11 filter functions
// and the CSS Shapes 1 basic shapes (`path()` is not here — it takes a string,
// which `cssValueOf` refuses anyway).
const CSS_ATTR_FUNCTIONS = new Set([
  "blur", "brightness", "contrast", "drop-shadow", "grayscale", "hue-rotate",
  "invert", "opacity", "saturate", "sepia",
  "inset", "circle", "ellipse", "polygon",
]);

// s479 (s479-records; RULED S479 §3.B item 22 — "admit exactly `url(#ident)`, after a browser
// check that it does not fetch under a static `<base>`"; SPEC §5.2 "Data-supplied CSS-url
// attributes", INTERIM): a same-document fragment reference, `url(#grad)`, is admitted — the whole
// value (or `values` entry), ASCII whitespace around it trimmed, and nothing else: no quotes, no
// space inside the parentheses, no fallback paint after it, lower-case `url`. The ident is an
// ASCII letter or `_`, then letters, digits, `_` or `-`. Chromium 152 (puppeteer probe, recorded
// in docs/changes/s479-records/progress.md): a data-written `fill` / `stroke` / `filter` / `mask` /
// `clip-path` / `marker*` / `cursor` / `color-profile` = `url(#ident)` and a SMIL `<set to=>` of
// one fetch NOTHING with a static `<base href>` on another origin (the control,
// `url(x.svg#g)`, fetches from the base origin).
const LOCAL_FRAGMENT_URL = /^url\(#[A-Za-z_][A-Za-z0-9_-]*\)$/;
const trimAsciiWs = (s) => s.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");

/** The value text for a CSS-url attribute write, or null when `cssValueOf` refuses an entry. */
function cssAttrValue(el, name, text, perEntry) {
  const entries = perEntry ? text.split(";") : [text];
  for (const e of entries) {
    if (LOCAL_FRAGMENT_URL.test(trimAsciiWs(e))) continue;
    if (cssValueOf(e, CSS_ATTR_FUNCTIONS) === null) {
      const tag = el && typeof el.tagName === "string" ? "<" + el.tagName.toLowerCase() + "> " : "";
      console.warn("[scrml css-guard] refused a data-supplied value for " + tag + String(name) + "=: the browser reads this attribute as CSS, and only a finite number, a plain CSS value (no url(), image-set(), var(), quotes, escapes, ; { } < or !) or exactly a same-document url(#id) is written there from data. The attribute was removed.");
      return null;
    }
  }
  return text;
}

/**
 * The judgment a bound write of `name` on `el` needs, or null when none: a
 * URL write (§5.2 rule 3, `urlGuardOf`), a CSS-url attribute (`cssAttrValue`),
 * or — for an SVG animation value — whichever the animated attribute needs
 * (both when it is computed). The guard returns the text to write, or null to
 * remove the attribute (a CSS refusal; a URL refusal writes `about:blank`).
 */
function writeGuardOf(el, name) {
  const tag = String(el.tagName || "").toLowerCase();
  const lower = String(name).toLowerCase();
  if (_SCRML_SVG_ANIMATION_ELEMENTS.has(tag) && _SCRML_SVG_ANIMATION_VALUE_ATTRS.has(lower)) {
    const url = urlGuardOf(el, name);
    const css = animatedCssTarget(el);
    const perEntry = lower === "values";
    if (!css) return url;
    if (url === null) return (s) => cssAttrValue(el, name, s, perEntry);
    return (s) => {
      const u = url(s);
      return u === s ? cssAttrValue(el, name, s, perEntry) : u;
    };
  }
  if (CSS_URL_ATTRS.has(lower)) return (s) => cssAttrValue(el, name, s, false);
  return urlGuardOf(el, name);
}

/**
 * Does an SVG animation element animate an attribute read as CSS with a URL?
 * True when its static `attributeName` names a CSS-url attribute or `style`,
 * and when it is computed or absent (any attribute may be animated — fail
 * closed, as `animatedUrlTarget`).
 */
function animatedCssTarget(el) {
  if (computedAnimationTargets.has(el)) return true;
  for (const a of el.attributes) {
    if (a.name.toLowerCase() === "attributename") {
      // a prefixed name (`x:fill`) is judged by its local part — fail closed
      const t = a.value.trim().toLowerCase().replace(/^.*:/, "");
      return CSS_URL_ATTRS.has(t) || t === "style";
    }
  }
  return true;
}

// SVG animation elements whose `attributeName` is written from data (a bound
// `attributeName=`): their `to` / `from` / `by` / `values` are judged as a URL
// on an attribute named at runtime (§5.2 rule 2 "SVG animation values").
const computedAnimationTargets = new WeakSet();

/**
 * The §5.2 rule 3 judgment a bound write of `name` on `el` needs, or null when
 * it is not a URL write. Decided once per bound attribute, from the element:
 *   - an SVG animation element's value attribute (`to` / `from` / `by` /
 *     `values`) writes the attribute its `attributeName` names. A STATIC
 *     `attributeName` (in the template) naming a URL-valued attribute makes it
 *     a URL write judged against that attribute; one naming any other
 *     attribute does not. A computed `attributeName` (bound — recorded when
 *     its own `attr` runs — or absent when this one runs) is judged as a URL
 *     on an unknown attribute, `""` (fail closed);
 *   - otherwise the URL-valued attribute table, scoped to the element
 *     (`_scrml_is_url_attr`, verbatim from impl#1).
 */
function urlGuardOf(el, name) {
  const tag = String(el.tagName || "").toLowerCase();
  const lower = String(name).toLowerCase();
  if (_SCRML_SVG_ANIMATION_ELEMENTS.has(tag)) {
    if (lower === "attributename") {
      computedAnimationTargets.add(el);
      return null;
    }
    if (_SCRML_SVG_ANIMATION_VALUE_ATTRS.has(lower)) {
      const target = animatedUrlTarget(el);
      if (target === null) return null;
      return (s) => _scrml_safe_url(el, name, s, target);
    }
  }
  if (!_scrml_is_url_attr(tag, lower)) return null;
  return (s) => _scrml_safe_url(el, name, s);
}

/**
 * The URL-valued attribute an SVG animation element animates: the static
 * `attributeName` lowercased when it names one, null when it names any other
 * attribute, and `""` when it is computed or absent (any attribute may be
 * animated — fail closed). impl#1 decides this at compile time and leaves a
 * value with NO `attributeName` unjudged; here a bound `attributeName` written
 * AFTER this value's first write cannot be told from an absent one, so absent
 * is judged too (stricter: such an element animates nothing).
 */
function animatedUrlTarget(el) {
  if (computedAnimationTargets.has(el)) return "";
  for (const a of el.attributes) {
    if (a.name.toLowerCase() === "attributename") {
      const t = a.value.trim().toLowerCase();
      return _scrml_is_url_attr("", t) ? t : null;
    }
  }
  return "";
}

/**
 * `show=` (§17.2): the element stays in the DOM; while `fn()` is false its
 * inline `display` is `none`, while true it is the element's own inline
 * `display` (from a static `style=`, else none set — the stylesheet decides).
 * `fn()` is a `bool` (a presence test already lowered to one).
 */
// ---------------------------------------------------------------------------
// s469 (s469-boot-css) — the §25.7 CSS-variable bridge. A `#{}` value's
// `@cell` compiles to `var(--scrml-cell)`; this writes the cell's value to that
// custom property on `:root` (`document.documentElement`), now and on every
// change. A cell's value is DATA, and this is the one place data reaches CSS,
// so it is the injection boundary: a value is written only if `cssValueOf`
// admits it — a finite number, or a string over a small CSS-value alphabet
// (letters, digits, space, `# % . , + - * / _ ( )`) whose every function is a
// colour / math function (`rgb()`, `hsl()`, `calc()`, `clamp()` …). That rules
// out, by construction: a breakout of the declaration or the rule (`;` `{` `}`
// are not in the alphabet), of the `<style>` element (`<`), `url(…)` (any
// network fetch — `url(javascript:…)` included), `image-set()` / `src()` /
// `attr()` / `expression()` / `var()`, escapes (`\`), strings, comments, and
// `!important`. Anything else is not written: the property is REMOVED, so the
// `var()` falls back to the property's unset value (fail closed), and the
// refusal is reported once per write — never the value.
// ---------------------------------------------------------------------------
const CSS_VALUE_ALPHABET = /^[A-Za-z0-9 #%.,+\-*/_()]*$/;
const CSS_VALUE_FUNCTIONS = new Set([
  "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color",
  "calc", "min", "max", "clamp",
]);
const CSS_VALUE_MAX = 256;

/**
 * The CSS text a cell's value is written as, or null when it is refused (fail closed).
 * `extraFunctions` (s473) admits more function names for one caller — the CSS-url
 * attributes' filter functions and basic shapes; the §25.7 bridge passes none.
 */
export function cssValueOf(v, extraFunctions) {
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v !== "string") return null;
  if (v.length > CSS_VALUE_MAX || !CSS_VALUE_ALPHABET.test(v)) return null;
  if (v.includes("/*") || v.includes("*/")) return null;
  let depth = 0;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c === "(") {
      let j = i;
      while (j > 0 && /[A-Za-z0-9_-]/.test(v[j - 1])) j--;
      const name = v.slice(j, i).toLowerCase();
      // a bare `(` is a grouping only inside a function (`calc((1px + 2px) * 2)`)
      if (name === "" ? depth === 0 : !(CSS_VALUE_FUNCTIONS.has(name) || (extraFunctions !== undefined && extraFunctions.has(name)))) return null;
      depth++;
    } else if (c === ")") {
      depth--;
      if (depth < 0) return null;
    }
  }
  return depth === 0 ? v : null;
}

/** `name` (`--scrml-<cell>`) on `:root` follows `read()` — guarded by `cssValueOf`. */
export function cssVar(scope, name, read) {
  const style = document.documentElement.style;
  hole(scope, () => {
    const v = cssValueOf(read());
    if (v === null) {
      style.removeProperty(name);
      console.warn(`[scrml css-guard] refused a value for ${name}: only a finite number, or a plain CSS value (no url(), quotes, escapes, ; { } < or !), reaches CSS (SPEC §25.7). The property was removed.`);
      return;
    }
    style.setProperty(name, v);
  }, () => style.removeProperty(name));
}

export function visibility(scope, el, fn) {
  const own = el.style.display;
  hole(scope, () => {
    const d = fn() === true ? own : "none";
    if (el.style.display !== d) el.style.display = d;
  }, () => { el.style.display = "none"; });
}

/**
 * s480 (s480-boot-cheap-wins) — `class:name=cond` (SPEC §5.5.2): "The compiler SHALL emit
 * client-side wiring that calls `classList.toggle(name, !!condition)` on the target element when
 * any dependency changes", applied on mount when the condition holds and absent when it does not.
 * Only `name` is touched: the static `class` and every other `class:` directive are independent.
 *
 * s480 r1 (#2028 F2) — A `class:` directive writes the `class` attribute, so it is a DATA-BOUND
 * ATTRIBUTE for §19.17 (ruling user-voice-scrml.md S480 "⭐ RULED — what a trap renders when
 * "nothing" is not safe" item 1: "removing the element is the only state that is safe for every
 * attribute" — a removed `hidden` / `blur` / `redacted` class REVEALS content). It is one of the
 * element's writers, exactly as `attr`'s are (`elementHoleOf`): a live element is toggled at once;
 * a trap holds the element out (`holdElement`, reported once); while it is out the condition's
 * value waits in the writer's slot; on recovery (`restoreHeld`) the class state is written, then
 * the element goes back. With no trap the writes are `classList.toggle(name, v)`, as before.
 *
 * s480 (s480-static-class) — `fixed`: the compiler passes `true` when `name` is also in the
 * element's static `class="…"` (§5.5.2: "The static class is always present; each `class:`
 * directive independently adds or removes its named class"). The condition is still read every
 * time (its dependencies; a trap still holds the element out, §19.17), but the slot's value is
 * always true, so no path — mount, re-run, or `restoreHeld` (which writes `slot.v`) — removes it.
 * The decision is the compiler's (it knows the static tokens); the runtime only obeys it.
 */
export function classOn(scope, el, name, fn, fixed = false) {
  requireScope(scope, "a class directive");
  const h = elementHoleOf(el);
  const slot = { name, guard: null, v: fixed, refused: false, dirty: false, cls: true };
  const tok = {};
  h.writers.set(tok, slot);
  scope.own(() => { h.writers.delete(tok); h.trapped.delete(tok); });
  new Effect(scope, () => {
    const v = !!fn();                              // always read: its dependencies, and a trap holds the element
    slot.v = fixed || v;
    h.trapped.delete(tok);
    if (h.out) {
      slot.dirty = true;
      if (h.trapped.size === 0) heldToRestore.add(el);
      return;
    }
    slot.dirty = false;
    el.classList.toggle(name, slot.v);
  }, () => holdElement(el, h, tok));               // the element leaves the page; nothing is written to it
}

/**
 * An event listener owned by `scope`; the handler runs as one batch.
 * s454 (U1b, design §2.3): each invocation runs in its OWN task, passed as the
 * handler's first argument — a handler that suspends (it calls a server
 * function, or a waiting function) continues in it. Teardown of the scope
 * cancels every live task (their continuations are dropped; nothing aborts).
 * A second event does NOT cancel the first's task: supersede is `<request>`
 * semantics (§6.7.7), not a handler's (design reading, flagged).
 */
class HandlerTasks {
  constructor() { this.tasks = new Set(); }
  settled(task) { if (task.pending === 0) this.tasks.delete(task); }
  cancelAll() {
    for (const t of this.tasks) t.cancel();
    this.tasks.clear();
  }
}

/**
 * s478 — body-top statements (Core View.Run, SPEC §40.8 S441: a statement at a
 * `<program>` / `<page>` body top "runs once at mount in source order"): run
 * `body` now, once, in a task the scope owns — a suspension in it (a server
 * call) is cancelled when the scope is destroyed, as a handler's is.
 */
export function run(scope, body) {
  requireScope(scope, "a body-top statement");
  const owner = new HandlerTasks();
  const task = new Task(owner);
  owner.tasks.add(task);
  scope.own(() => owner.cancelAll());
  try {
    batch(() => body(task));
  } finally {
    owner.settled(task);
  }
}

// ---------------------------------------------------------------------------
// s482 (s482-meta-runtime) — a RUNTIME `^{}` block (SPEC §22.5; Core View.Meta;
// print.scrml metaJs): `rt.metaEffect(scope$, placeholder, scopeId, (task$, meta$) => { … })`.
//
// WHEN IT RUNS. Its first run is NOW, where the printer registers it — the hole
// order of the scope's render, so a block at a `<program>` body top runs in source
// order with the body-top statements around it (`rt.run`), as impl#1's inline
// `_scrml_meta_effect` call does (S481 design read Q11, probed: impl#1 logs
// "run1;meta1;run2;meta2;"). A re-run is a flush's, after a dependency changes.
//
// DEPENDENCIES. The body runs UNTRACKED; a read is a dependency only where §22.5.1 /
// §22.9 make it one: `meta.get("x")` and a `meta.bindings.x` of a cell — each printed
// as `meta$.get(() => <the cell read>)`, the one place tracking is on. A direct `@x`
// read in the body, or one inside a function the body calls, is not a dependency
// (impl#1 tracks exactly these two forms too — probed). A write the run itself
// makes never re-runs it (impl#1's re-entrancy guard: its own invalidation while
// running is dropped); every other change of a dependency re-runs it once per flush.
//
// A RUN: the previous run's timers are cleared (LIFO), then its `meta.cleanup`
// callbacks run (LIFO) — §22.5.1 "Timer primitives lifetime" — then the body runs
// with a FRESH `meta` object in a fresh task (an earlier run still suspended never
// resumes — the newest run wins, as a `<request>`'s). A throw in the body (a trap
// or anything else) is reported and ends that run only: the mount proceeds
// (impl#1 logs it and goes on). Disposing the scope clears the timers, then runs
// the cleanups, then unsubscribes.
//
// `meta.emit(html)` is impl#1's gate, verbatim (`_scrml_meta_emit_insert`, above).
// The gate finds the block's placeholder in the PAGE (`[data-scrml-meta="id"]`) and
// judges the page `<form>` around it — so it must not run while the placeholder is
// still in a detached render (a mount builds its tree first, then inserts it). An
// emit made then is held, in order, and handed to the gate in a microtask, after
// the insert (each later one replacing the earlier, as §22.5.1 says; a refused one
// is reported and writes nothing). Fail closed: if the placeholder is still not in
// the page then, the gate's own rule applies (it writes into a fresh span appended
// to `<body>`, outside any form).
//
// Timer ids (`meta.interval` / `meta.timeout`) are strings the run's own registry
// keys — a clear with an id this block did not register (another block's, or a
// forged one) finds nothing and is a no-op (§22.5.1); never a host handle.
//
// s482 r1 (review of #2067) —
// CYCLES (MED-2). Two blocks that each `meta.set` the cell the other `meta.get`s
// would re-run each other forever (the page hung). impl#1 re-runs a block
// SYNCHRONOUSLY inside the write that changed its dependency, and drops a re-run of
// a block that is still running (its re-entrancy guard) — so a change a block's own
// run caused, directly or through the runs it set off, never re-runs it. Here a
// re-run is queued for the flush, so the same rule is carried as the run's CAUSE:
// every run knows the blocks whose runs led to it (`chain`), and a change made
// during it never re-runs a block on that chain. Two such blocks settle as impl#1's
// do (probed: `x` = 2). And as impl#1, a block runs at most MAX_RUNS (100;
// `globalThis.__scrml_max_meta_runs` overrides) times in one flush: past that it
// logs impl#1's message (`[scrml] meta effect <id> exceeded <n> re-runs — possible
// infinite loop`) and skips the run; the next flush counts afresh.
// STALE HELD EMITS (MED-3). An emit made once the placeholder is in the page drops
// the emits still held for the microtask: the newer one wins, never an older replay.
// DEPENDENCIES ONLY WHILE RUNNING (LOW-1). A `meta.get` in a timer or cleanup
// callback, or after the body's run has ended, reads the cell and subscribes
// nothing (impl#1 tracks only during the run).
// ---------------------------------------------------------------------------
// The blocks whose runs are making the current change (null: no block is running).
let metaChain = null;

function metaMaxRuns() {
  const n = globalThis.__scrml_max_meta_runs;
  return typeof n === "number" && n > 0 ? n : 100;
}

class MetaEffect {
  constructor(scope, ph, scopeId, body) {
    this.ph = ph;
    this.scopeId = scopeId;
    this.body = body;
    this.disposed = false;
    this.running = false;
    this.sources = new Set();
    this.tasks = new Set();
    this.cleanups = [];
    this.timers = new Map();
    this.nextTimer = 0;
    this.discharging = false;
    this.pending = [];
    this.cause = new Set();                          // the blocks whose runs queued this one's re-run
    this.maxRuns = metaMaxRuns();
    this.flushSeq = -1;
    this.flushRuns = 0;
    stats.effects++;
    scope.own(() => this.dispose());
    this.run();
  }
  markStale() {
    // a change the run itself made (a `meta.set` of a cell it `meta.get`s) never re-runs it
    if (this.disposed || this.running) return;
    // a change this block's own run set off (through the blocks it re-ran) never re-runs it
    if (metaChain !== null) {
      if (metaChain.has(this)) return;
      for (const m of metaChain) this.cause.add(m);
    }
    queue.add(this);
    if (batchDepth === 0) flush();
  }
  settled(task) { if (task.pending === 0) this.tasks.delete(task); }
  /** Clear the timers (LIFO), then run the cleanups (LIFO) — §22.5.1. */
  discharge() {
    const live = [...this.timers.values()];
    this.timers.clear();
    for (let i = live.length - 1; i >= 0; i--) {
      if (live[i].kind === "interval") clearInterval(live[i].handle);
      else clearTimeout(live[i].handle);
    }
    const cs = this.cleanups;
    this.cleanups = [];
    this.discharging = true;
    try {
      for (let i = cs.length - 1; i >= 0; i--) {
        try { batch(() => cs[i]()); } catch (err) { reportLater(err); }
      }
    } finally {
      this.discharging = false;
    }
  }
  run() {
    if (this.disposed || this.running) return;
    const chain = this.cause;
    this.cause = new Set();
    chain.add(this);
    if (flushing) {
      if (this.flushSeq !== flushSeq) { this.flushSeq = flushSeq; this.flushRuns = 0; }
      this.flushRuns++;
      if (this.flushRuns > this.maxRuns) {
        if (this.flushRuns === this.maxRuns + 1) {
          console.error("[scrml] meta effect " + this.scopeId + " exceeded " + this.maxRuns + " re-runs — possible infinite loop");
        }
        return;
      }
    }
    const savedChain = metaChain;
    metaChain = chain;
    try {
      this.runNow();
    } finally {
      metaChain = savedChain;
    }
    if (batchDepth === 0) flush();
  }
  runNow() {
    this.discharge();
    unsubscribe(this);
    for (const t of this.tasks) t.cancel();
    this.tasks.clear();
    const task = new Task(this);
    this.tasks.add(task);
    const saved = tracking;
    tracking = null;                                 // untracked, except inside meta$.get
    this.running = true;
    batchDepth++;
    try {
      this.body(task, this.metaObject());
    } catch (err) {
      reportLater(err);
    } finally {
      tracking = saved;
      this.running = false;
      batchDepth--;
      this.settled(task);
    }
  }
  /** A tracked read: `meta.get("x")` / a `meta.bindings.x` of a cell — a dependency only during the run. */
  tracked(read) {
    if (this.disposed || !this.running) return untrack(read);
    const saved = tracking;
    tracking = this;
    try { return read(); } finally { tracking = saved; }
  }
  emit(html) {
    if (this.disposed) return;
    if (this.ph && this.ph.isConnected) {
      this.pending = [];                             // an older held emit never replaces this one
      _scrml_meta_emit_insert(this.scopeId, html);
      return;
    }
    // the placeholder is still in a detached render: hand the emits to the gate after the insert
    this.pending.push(html);
    if (this.pending.length === 1) {
      queueMicrotask(() => {
        const hs = this.pending;
        this.pending = [];
        if (this.disposed) return;
        for (const h of hs) _scrml_meta_emit_insert(this.scopeId, h);
      });
    }
  }
  startTimer(kind, ms, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("meta." + kind + "(ms, callback): callback must be a function");
    }
    if (typeof ms !== "number" || !(ms >= 0) || ms === Infinity) {
      throw new TypeError("meta." + kind + "(ms, callback): ms must be a finite number >= 0, got " + ms);
    }
    const id = this.scopeId + "#" + kind + "#" + (++this.nextTimer);
    // registered by a cleanup (the run is being discharged) or after disposal: it would outlive
    // every clear, so it is never started (impl#1 S458 review F5)
    if (this.disposed || this.discharging) return id;
    const fire = () => {
      if (kind === "timeout") this.timers.delete(id);
      try { batch(() => callback()); } catch (err) { reportLater(err); }
    };
    const handle = kind === "interval" ? setInterval(fire, ms) : setTimeout(fire, ms);
    this.timers.set(id, { kind, handle });
    return id;
  }
  stopTimer(kind, id) {
    const entry = this.timers.get(id);
    // already cleared / already fired / another kind's id / another block's: a no-op (§22.5.1)
    if (entry === undefined || entry.kind !== kind) return;
    this.timers.delete(id);
    if (kind === "interval") clearInterval(entry.handle);
    else clearTimeout(entry.handle);
  }
  /** The `meta` object of one run (§22.5.1: "constructed fresh on each run"). */
  metaObject() {
    return Object.freeze({
      scopeId: this.scopeId,
      get: (read) => this.tracked(read),
      emit: (html) => this.emit(String(html)),
      cleanup: (fn) => {
        if (typeof fn !== "function") throw new TypeError("meta.cleanup(callback): callback must be a function");
        if (!this.disposed) this.cleanups.push(fn);
      },
      interval: (ms, fn) => this.startTimer("interval", ms, fn),
      timeout: (ms, fn) => this.startTimer("timeout", ms, fn),
      clearInterval: (id) => this.stopTimer("interval", id),
      clearTimeout: (id) => this.stopTimer("timeout", id),
    });
  }
  dispose() {
    if (this.disposed) return;
    this.discharge();
    this.disposed = true;
    this.cleanups = [];                              // one a cleanup registered while discharging never runs
    queue.delete(this);
    unsubscribe(this);
    for (const t of this.tasks) t.cancel();
    this.tasks.clear();
    this.pending = [];
    stats.effects--;
  }
}

/** A runtime `^{}` block (SPEC §22.5), owned by `scope`; `ph` its placeholder element. */
export function metaEffect(scope, ph, scopeId, body) {
  requireScope(scope, "a runtime ^{} block");
  new MetaEffect(scope, ph, scopeId, body);
}

export function on(scope, el, event, handler) {
  requireScope(scope, "a listener");
  const owner = new HandlerTasks();
  const h = (e) => {
    const task = new Task(owner);
    owner.tasks.add(task);
    try {
      batch(() => handler(task, e));
    } finally {
      owner.settled(task);
    }
  };
  el.addEventListener(event, h);
  stats.listeners++;
  scope.own(() => { el.removeEventListener(event, h); owner.cancelAll(); stats.listeners--; });
}

/**
 * A two-way bind (§5.4): the element's `prop` (`value` / `checked`) shows
 * `read()` and follows it; the element's input (`value`) / change (`checked`)
 * event hands the property's value to `write` — the compiled, contract-checked
 * write of that value to the same place. A write that lands the value the
 * element already shows changes nothing (no caret jump).
 *
 * `surface` (§55.7) — the validity record of the bound field, when it has
 * one: the bind's change and the element's first focus-out mark it
 * `touched`, and a gated form finds it through this element (§55.17.3).
 */
export function bind(scope, el, prop, read, write, surface) {
  requireScope(scope, "a bind");
  hole(scope, () => {
    const v = read();
    const shown = prop === "checked" ? v === true : display(v);
    if (el[prop] !== shown) el[prop] = shown;
  }, () => { el[prop] = prop === "checked" ? false : ""; });
  on(scope, el, prop === "checked" ? "change" : "input", () => {
    write(el[prop]);
    if (surface) surface.touch();
  });
  if (surface) {
    boundSurface.set(el, surface);
    on(scope, el, "focusout", () => surface.touch());
    scope.own(() => { if (boundSurface.get(el) === surface) boundSurface.delete(el); });
  }
}

/**
 * A conditional view (§5.6 scope tree: conditional arm). Only the arm TESTS are
 * tracked by this effect; each arm renders untracked into its OWN child scope,
 * so reads inside an arm have their own effects and are never dropped when the
 * chosen arm is unchanged (the dpa-053 M4/M5 root cause, dpa-051 §3.6).
 */
export function cond(scope, anchor, arms) {
  let current = -1;
  let armScope = null;
  hole(scope, () => {
    let idx = -1;
    for (let i = 0; i < arms.length; i++) if (arms[i].test()) { idx = i; break; }
    if (idx === current) return;
    untrack(() => {
      if (armScope) armScope.dispose();
      armScope = null;
      current = idx;
      if (idx >= 0) {
        armScope = scope.child();
        arms[idx].render(armScope, anchor);
      }
    });
  }, () => {
    // a test that threw shows NO arm — not the arm it showed before, and not a later `else`
    if (armScope) armScope.dispose();
    armScope = null;
    current = -1;                                    // no arm is shown
  });
}

/**
 * s469 — a Tier-0 `${ for … lift … }` (SPEC §17.4, §49.6.2). `build` runs the
 * loop TRACKED and returns its rows — `(scope, anchor) => …` render thunks, in
 * the order their `lift`s ran. The rows render UNTRACKED, each into the one
 * child scope of this run, before the marker; their own holes keep their own
 * effects. When a cell the loop read changes, the old rows are torn down and
 * the loop re-runs (no key: §17.4b keyed reconciliation is not built).
 */
export function gather(scope, anchor, build) {
  let rowsScope = null;
  hole(scope, () => {
    const rows = build();
    untrack(() => {
      if (rowsScope) rowsScope.dispose();
      rowsScope = scope.child();
      for (const r of rows) r(rowsScope, anchor);
    });
  }, () => {
    if (rowsScope) rowsScope.dispose();
    rowsScope = null;
  });
}

/**
 * s474 — a KEYED Tier-0 loop (SPEC §17.4b: "When a `key` expression is
 * declared, the compiler SHALL generate keyed reconciliation: elements are
 * matched by key identity across updates, preserving DOM state (focus,
 * animation, scroll position) for elements whose key persists"). `build` runs
 * the loop TRACKED, as `gather`'s does; each iteration first evaluates its key
 * once (`loopKey`), and each lift appends a `keyRow` naming that iteration.
 * A row's identity is (key, its template, its place among its iteration's lifts of that
 * template). On a re-run a row whose identity persists keeps its DOM nodes and
 * its scope — it is MOVED if its position changed, and its cells (the loop's
 * locals the row's markup reads) are set to the iteration's new values; a row
 * whose identity is new renders; a row whose identity left is disposed. A key
 * two iterations share is a trap (§17.4b: the key "must produce a value that
 * is unique within the collection").
 */
export function gatherKeyed(scope, anchor, build) {
  let rows = [];
  hole(scope, () => {
    const lifted = build();
    untrack(() => { rows = reconcileKeyed(scope, anchor, rows, lifted); });
  }, () => {
    for (const r of rows) r.scope.dispose();
    rows = [];
  });
}

/**
 * s474 — one iteration's key (§17.4b), evaluated once per iteration. `per`
 * counts the iteration's lifts PER TEMPLATE (#1700 review F3): a row's place is
 * its place among the lifts of its own template, so a conditional lift of
 * another template earlier in the body never shifts it (its DOM state
 * persists with its key, §17.4b).
 */
export function loopKey(key) {
  return { key, lifts: 0, per: new Map() };
}

/** s474 — a lifted row of a keyed loop: template `tpl`, the row's snapshot `vals`, its render. */
export function keyRow(it, tpl, vals, render) {
  const ord = it.per.get(tpl) || 0;
  it.per.set(tpl, ord + 1);
  it.lifts++;
  return { it, ord, tpl, vals, render };
}

/** s474 — a primitive value lifted in a keyed loop: a text row whose text follows its cell. */
export function keyTextRow(it, v) {
  return keyRow(it, -1, [v], textCellRow);
}

function textCellRow(scope, anchor, cell) {
  const t = document.createTextNode("");
  anchor.parentNode.insertBefore(t, anchor);
  scope.own(() => { if (t.parentNode) t.parentNode.removeChild(t); });
  hole(scope, () => { t.data = display(cell.get()); }, () => { t.data = ""; });
}

function reconcileKeyed(scope, anchor, oldRows, lifted) {
  // old rows by key, then by (place, template)
  const byKey = new Map();
  oldRows.forEach((r, i) => {
    let at = byKey.get(r.key);
    if (!at) { at = []; byKey.set(r.key, at); }
    at.push({ row: r, index: i });
  });
  const iterOf = new Map();
  const next = [];
  const kept = new Set();
  for (const l of lifted) {
    const k = l.it.key;
    const owner = iterOf.get(k);
    if (owner === undefined) iterOf.set(k, l.it);
    else if (owner !== l.it) throw new Error(`for … key: duplicate key ${String(k)} — two iterations share it (§17.4b: a key is unique within the collection)`);
    const cands = byKey.get(k);
    const old = cands ? cands.find((c) => c.row.ord === l.ord && c.row.tpl === l.tpl) : undefined;
    if (old) {
      kept.add(old.row);
      old.row.cells.forEach((c, j) => c.set(l.vals[j]));
      next.push({ row: old.row, oldIndex: old.index });
    } else {
      next.push({ row: null, lift: l, oldIndex: -1 });
    }
  }
  // Dispose rows whose identity left.
  for (const r of oldRows) if (!kept.has(r)) r.scope.dispose();
  // Rows on the longest increasing run of old positions stay put; others move.
  const stay = new Set(lis(next.map((n) => n.oldIndex)));
  const out = new Array(next.length);
  const created = [];
  let before = anchor;
  try {
    for (let i = next.length - 1; i >= 0; i--) {
      const n = next[i];
      let row = n.row;
      if (!row) {
        const l = n.lift;
        const rowScope = scope.child();
        created.push(rowScope);
        const start = document.createComment("row");
        const end = document.createComment("/row");
        before.parentNode.insertBefore(start, before);
        before.parentNode.insertBefore(end, before);
        const cells = l.vals.map((v) => new Cell(v));
        row = { key: l.it.key, ord: l.ord, tpl: l.tpl, scope: rowScope, cells, start, end };
        rowScope.own(removeRange(start, end));
        l.render(rowScope, end, ...cells);
      } else if (!stay.has(i)) {
        moveRange(row, before);
      }
      out[i] = row;
      before = row.start;
    }
  } catch (err) {
    disposeCreated(created);
    throw err;
  }
  return out;
}

/**
 * s480 r1 (#2008 review F1) — a row's render threw (a non-trap throw out of a
 * hole in the row; since s480-trap-attr-hole an `rt.attr` trap is held at its
 * own element and no longer reaches here): every row this run created is disposed (its DOM, effects and
 * listeners) before the throw reaches the list's hole, whose blank then
 * disposes the rows it already held — a trapped list hole shows NO rows
 * (§19.17, s480 item 20), and a later recovering run starts from none.
 */
function disposeCreated(created) {
  for (const s of created) s.dispose();
}

/** s469 — a Tier-0 row of text: a primitive value lifted in the loop (§17.4). */
export function textRow(v) {
  const text = display(v);
  return (scope, anchor) => {
    const t = document.createTextNode(text);
    anchor.parentNode.insertBefore(t, anchor);
    scope.own(() => { if (t.parentNode) t.parentNode.removeChild(t); });
  };
}

/** Place use-site slot content (§66.15.2), if any. */
export function slot(scope, anchor, fill) {
  if (fill) fill(scope, anchor);
}

// Longest increasing subsequence of `arr` (ignoring -1), as indices into arr.
// Reused from impl#1 runtime-template.js `_scrml_lis` (a scope-clean leaf).
function lis(arr) {
  const len = arr.length;
  if (len === 0) return [];
  const tails = [];
  const pred = new Array(len);
  for (let i = 0; i < len; i++) {
    if (arr[i] === -1) continue;
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[tails[mid]] < arr[i]) lo = mid + 1; else hi = mid;
    }
    if (lo > 0) pred[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const result = new Array(tails.length);
  let k = tails[tails.length - 1];
  for (let i = result.length - 1; i >= 0; i--) { result[i] = k; k = pred[k]; }
  return result;
}

/** A cleanup removing the DOM range `start`..`end` (a row's markers and content). */
function removeRange(start, end) {
  return () => {
    let x = start;
    while (x) {
      const nx = x === end ? null : x.nextSibling;
      if (x.parentNode) x.parentNode.removeChild(x);
      x = nx;
    }
  };
}

function moveRange(row, before) {
  const parent = before.parentNode;
  let n = row.start;
  for (;;) {
    const next = n.nextSibling;
    parent.insertBefore(n, before);
    if (n === row.end) break;
    n = next;
  }
}

/**
 * A keyed list (§17.7, §66.7.3). Each row OWNS a scope and a cell holding its
 * item; `render(rowScope, itemCell, rowAnchor)` renders the row. Rows are
 * matched by `key(item, index)`; a surviving row keeps its scope (and the
 * instances in it) and is MOVED; a removed row's scope is disposed, which
 * disposes its instances' effects, listeners and timers.
 */
export function each(scope, anchor, src, key, render) {
  let rows = [];
  hole(scope, () => {
    const items = src();
    untrack(() => { rows = reconcile(scope, anchor, rows, items, key, render); });
  }, () => {
    for (const r of rows) r.scope.dispose();
    rows = [];
  });
}

function reconcile(scope, anchor, oldRows, items, key, render) {
  const byKey = new Map(oldRows.map((r, i) => [r.key, { row: r, index: i }]));
  const next = [];
  const seen = new Set();
  items.forEach((item, i) => {
    const k = key ? key(item, i) : i;
    if (seen.has(k)) throw new Error(`<each>: duplicate key ${String(k)}`);
    seen.add(k);
    const old = byKey.get(k);
    if (old) {
      old.row.item.set(item);
      next.push({ row: old.row, oldIndex: old.index });
    } else {
      next.push({ row: null, item, key: k, oldIndex: -1 });
    }
  });
  // Dispose rows that left the collection.
  for (const r of oldRows) if (!seen.has(r.key)) r.scope.dispose();
  // Rows on the longest increasing run of old positions stay put; others move.
  const stay = new Set(lis(next.map((n) => n.oldIndex)));
  const out = new Array(next.length);
  const created = [];
  let before = anchor;
  try {
    for (let i = next.length - 1; i >= 0; i--) {
      const n = next[i];
      let row = n.row;
      if (!row) {
        const rowScope = scope.child();
        created.push(rowScope);
        const start = document.createComment("row");
        const end = document.createComment("/row");
        before.parentNode.insertBefore(start, before);
        before.parentNode.insertBefore(end, before);
        row = { key: n.key, scope: rowScope, item: new Cell(n.item), start, end };
        // The cleanup is built OUTSIDE this function: a closure here would capture
        // reconcile's whole environment (`byKey`, `next`, `items` — O(rows)) for
        // the row's lifetime, so N rows added one at a time retained O(N²) objects.
        rowScope.own(removeRange(start, end));
        render(rowScope, row.item, end);
      } else if (!stay.has(i)) {
        moveRange(row, before);
      }
      out[i] = row;
      before = row.start;
    }
  } catch (err) {
    disposeCreated(created);
    throw err;
  }
  return out;
}

// =============================================================================
// The §57 wire codec — RUNTIME half (arc unit Uc). Moved here from
// slice-codec/runtime/codec.js by s451 (U5) so a compiled program reaches it
// through its one runtime module: `persist=` encodes and decodes with it
// (§6.14.2 rule 2). slice-codec/runtime/codec.js re-exports this section.
//
//
// Encodes and decodes VALUES against a wire descriptor: the JS literal that
// codec.scrml (`wireTableJs`) resolves from a Core type at compile time:
//
//   table = { defs: [def…], root: ty }
//   def   = { k: "struct", name, fields: [{ name, ty }] }
//         | { k: "enum", name, variants: [{ name, fields: [{ name, ty }] }] }   (fields [] = a unit variant)
//   ty    = { k: "int" | "num" | "str" | "bool" } | { k: "maybe", inner: ty }
//         | { k: "seq", elem: ty, bound: { k: "free" | "fixed" } | { k: "bounded", min, max } }
//         | { k: "ref", def: index into defs }
//
// Runtime values are the bootstrap's (print.scrml): Int/Num = number, Str =
// string, Bool = boolean, a struct = a plain object keyed by declared field
// names, a unit enum value = its tag string, a payload enum value =
// `{ variant: "V", data: [v0, …] }` (payload POSITIONAL in declared field
// order — Ue DESIGN §5, print.scrml `variantValueJs`), a sequence = an array,
// and `not` = `null` (§42.8; `undefined` is treated as `not`, §42.9).
//
// SPEC — what this file implements (quoted in docs/changes/s446-bootstrap-uc-codec/progress.md):
//   §57.2  envelope `{"__scrml_absent": true}` — "exactly one own property named
//          `__scrml_absent` whose value is the boolean `true`".
//   §57.3  the encoder emits the envelope for absence in a `T | not` position,
//          the plain value otherwise (no wrapping of presence).
//          The encoder is STRICT by default: it encodes only values that inhabit
//          the type, so `encode` ok ⇒ `decode` of its output ok and equal — with
//          ONE exception: a `number` `-0` encodes as `0` (JSON has no negative
//          zero), so it decodes as `0`. Not normalised here: the wire treatment
//          of `-0` is unruled (SPEC question Q6, progress.md). A null/undefined
//          at a NON-`T | not` position, a sequence hole, a length outside a
//          `Bounded` range, or a struct value with an own enumerable key the
//          type does not declare is a "value" failure (the decoder refuses an
//          extra key too, so the two directions are symmetric).
//          Option flags are read as OWN properties only (a polluted
//          `Object.prototype` cannot switch them on), inside the guarded region
//          (a throwing opts object is a failure, not a throw).
//          §57.3's server-function-RETURN sentence — "For declared return types
//          that are NOT `T | not` … the encoder continues to use raw JSON `null`
//          for any JS-host `null` that may slip through" — is the explicit
//          opt-in `{ hostNullPassthrough: true }` (for U1's return position
//          only): a null/undefined at a non-`T | not` position then encodes as
//          raw `null`, which the decoder (correctly) refuses.
//   §57.4  dual-decoder: a `T | not` position accepts the envelope AND raw `null`;
//          "Any envelope shape other than the two admitted forms … SHALL be
//          treated as a malformed payload"; "SHALL NOT silently coerce".
//   §57.5  canonical-only decoding (raw `null` malformed) — selectable with
//          `{ canonicalOnly: true }`; the default is the v0.x dual-decoder.
//   §57.8  (S451 R8; s454) "An enum value whose variant carries NO payload SHALL
//          be encoded as the variant name, a JSON string"; "An enum value whose
//          variant carries a payload SHALL be encoded as a JSON object with
//          exactly two own properties: `"variant"` … and `"data"`, a JSON object
//          whose keys are the variant's DECLARED field names". The runtime's
//          positional `data` array maps to/from the keyed wire object through
//          the descriptor's field list. Decoding is exact in both directions:
//          an unknown variant, a missing / extra / ill-typed field, a unit
//          variant written as an object (or a payload variant as a bare string),
//          or any top-level key besides `variant` / `data` is "malformed".
//          `decodeError` reads the §57.8 / §19.9.1 `fail` envelope (the same
//          `variant` / `data` plus `"__scrml_error": true` and `"type"`; `data`
//          is `{}` for a unit variant) into the same runtime value.
//   §6.14.2 r3 decode against the current type AND its contract; never coerced —
//          a failure is a VALUE the caller maps to "take the default" (U5) or to
//          its deserialization-error path (U1, §57.4).
//
// Results never throw on ANY input value: `{ ok: true, value }` / `{ ok: true, wire }`
// or `{ ok: false, error: { kind, path, reason } }`, `kind` one of:
//   "malformed" — decode: the JSON does not have the type's shape (§57.4)
//   "contract"  — decode: the shape fits but a type contract fails (a §66.12 length bound)
//   "parse"     — `decodeText` only: the text is not JSON
//   "value"     — encode: the runtime value does not inhabit the type
// A throw while reading the input (a getter, a Proxy trap, a cycle or hostile
// nesting overflowing the stack) becomes a failure of the operation's kind.
// The ONE thing that throws is a `CodecDefect`: a broken DESCRIPTOR, which is a
// compiler bug, not bad input.
// =============================================================================

export const ABSENT_KEY = "__scrml_absent";

/** A malformed descriptor (a compiler defect) — the only throw out of this module. */
export class CodecDefect extends Error {}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// A JSON-shaped object: not an array, and a plain prototype (Object.prototype,
// or null) — a Date, Map, class instance, … is not a struct value.
const isPlainObject = (x) => {
  if (x === null || typeof x !== "object" || Array.isArray(x)) return false;
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
};

/** §57.2: an object with exactly one own property, `__scrml_absent`, whose value is `true`. */
export function isAbsenceEnvelope(x) {
  if (!isPlainObject(x)) return false;
  const keys = Object.keys(x);
  return keys.length === 1 && keys[0] === ABSENT_KEY && x[ABSENT_KEY] === true;
}

/** A fresh envelope (never shared, so a caller mutating one cannot poison the next). */
function envelope() {
  return { [ABSENT_KEY]: true };
}

function fail(kind, path, reason) {
  return { ok: false, error: { kind, path, reason } };
}

/** Define an own data property (a field named `__proto__` must not set the prototype). */
function setField(o, name, v) {
  Object.defineProperty(o, name, { value: v, enumerable: true, writable: true, configurable: true });
}

function defOf(table, ty) {
  const d = table.defs[ty.def];
  if (d === undefined) throw new CodecDefect(`codec: descriptor ref ${ty.def} names no def`);
  return d;
}

function describe(table, ty) {
  switch (ty.k) {
    case "int": return "int";
    case "num": return "number";
    case "str": return "string";
    case "bool": return "boolean";
    case "maybe": return describe(table, ty.inner) + " | not";
    case "seq": return describe(table, ty.elem) + "[]";
    case "ref": return defOf(table, ty).name;
    default: throw new CodecDefect(`codec: unknown descriptor kind ${JSON.stringify(ty.k)}`);
  }
}

// -----------------------------------------------------------------------------
// Encode — value → JSON-safe value.
// -----------------------------------------------------------------------------

function enc(table, ty, v, path, opts) {
  if (ty.k === "maybe") {
    // §57.3: absence in a `T | not` position is the canonical envelope.
    if (v === null || v === undefined) return { ok: true, wire: envelope() };
    return enc(table, ty.inner, v, path, opts);
  }
  if (v === null || v === undefined) {
    // §57.3 bullet 5 (server-fn return only, opt-in): a slipped JS-host null stays raw `null`.
    if (opts.hostNullPassthrough) return { ok: true, wire: null };
    return fail("value", path, `${show(v)} where ${describe(table, ty)} (no absence) is expected`);
  }
  switch (ty.k) {
    case "int":
      if (typeof v === "number" && Number.isInteger(v)) return { ok: true, wire: v };
      return fail("value", path, `expected an int, got ${show(v)}`);
    case "num":
      if (typeof v !== "number") return fail("value", path, `expected a number, got ${show(v)}`);
      // JSON has no NaN/Infinity (JSON.stringify would write `null`, i.e. absence on decode).
      if (!Number.isFinite(v)) return fail("value", path, `${v} has no JSON form`);
      return { ok: true, wire: v };
    case "str":
      if (typeof v === "string") return { ok: true, wire: v };
      return fail("value", path, `expected a string, got ${show(v)}`);
    case "bool":
      if (typeof v === "boolean") return { ok: true, wire: v };
      return fail("value", path, `expected a boolean, got ${show(v)}`);
    case "seq": {
      if (!Array.isArray(v)) return fail("value", path, `expected a sequence, got ${show(v)}`);
      const out = [];
      for (let i = 0; i < v.length; i++) {
        const r = enc(table, ty.elem, v[i], `${path}[${i}]`, opts);
        if (!r.ok) return r;
        out.push(r.wire);
      }
      // §66.12: a value outside its `Bounded` range does not inhabit the type.
      if (ty.bound.k === "bounded" && (out.length < ty.bound.min || out.length > ty.bound.max)) {
        return fail("value", path, `length ${out.length} is outside ${ty.bound.min}..${ty.bound.max}`);
      }
      return { ok: true, wire: out };
    }
    case "ref": {
      const d = defOf(table, ty);
      if (d.k === "enum") return encEnum(table, d, v, path, opts);
      if (!isPlainObject(v)) return fail("value", path, `expected a ${d.name}, got ${show(v)}`);
      // An undeclared own key is refused, not dropped — the decoder refuses it too.
      const declared = new Set(d.fields.map((f) => f.name));
      for (const k of Object.keys(v)) {
        if (!declared.has(k)) return fail("value", keyPath(path, k), `${d.name} has no field ${keyText(k)}`);
      }
      const out = {};
      for (const f of d.fields) {
        if (!hasOwn(v, f.name)) return fail("value", path, `${d.name} value has no field ${f.name}`);
        const r = enc(table, f.ty, v[f.name], `${path}.${f.name}`, opts);
        if (!r.ok) return r;
        setField(out, f.name, r.wire);
      }
      return { ok: true, wire: out };
    }
    default:
      throw new CodecDefect(`codec: unknown descriptor kind ${JSON.stringify(ty.k)}`);
  }
}

// The variant of enum def `d` named `name` (a string compared, never a key
// looked up — a foreign `"__proto__"` / `"toString"` names nothing), or undefined.
function variantOf(d, name) {
  if (!Array.isArray(d.variants)) throw new CodecDefect(`codec: enum descriptor ${JSON.stringify(d.name)} has no variants list`);
  if (typeof name !== "string") return undefined;
  return d.variants.find((x) => x.name === name);
}

// §57.8: a unit variant is its name; a payload variant `{ variant, data: [v0, …] }`
// becomes `{"variant": "V", "data": {<declared field>: <encoded value>, …}}`.
function encEnum(table, d, v, path, opts) {
  if (typeof v === "string") {
    const u = variantOf(d, v);
    if (u === undefined) return fail("value", path, `${d.name} has no variant ${show(v)}`);
    if (u.fields.length > 0) return fail("value", path, `${d.name}.${u.name} carries a payload; a bare name is not a value of it`);
    return { ok: true, wire: v };
  }
  if (!isPlainObject(v)) return fail("value", path, `expected a ${d.name} variant, got ${show(v)}`);
  for (const k of Object.keys(v)) {
    if (k !== "variant" && k !== "data") return fail("value", keyPath(path, k), `a ${d.name} value has no key ${keyText(k)}`);
  }
  // OWN properties only, as the decoder reads them — an inherited `variant` /
  // `data` (a polluted Object.prototype) is not part of the value.
  if (!hasOwn(v, "variant")) return fail("value", `${path}.variant`, `missing the variant name of a ${d.name} value`);
  const p = variantOf(d, v.variant);
  if (p === undefined) return fail("value", `${path}.variant`, `${d.name} has no variant ${show(v.variant)}`);
  if (p.fields.length === 0) return fail("value", path, `${d.name}.${p.name} carries no payload; its value is the name ${JSON.stringify(p.name)}`);
  if (!hasOwn(v, "data")) return fail("value", `${path}.data`, `missing the payload of ${d.name}.${p.name}`);
  const data = v.data;
  if (!Array.isArray(data)) return fail("value", `${path}.data`, `expected the payload array of ${d.name}.${p.name}, got ${show(data)}`);
  if (data.length !== p.fields.length) {
    return fail("value", `${path}.data`, `${d.name}.${p.name} has ${p.fields.length} field(s), the payload holds ${data.length}`);
  }
  const out = {};
  for (let i = 0; i < p.fields.length; i++) {
    const f = p.fields[i];
    const r = enc(table, f.ty, data[i], `${path}.data.${f.name}`, opts);
    if (!r.ok) return r;
    setField(out, f.name, r.wire);
  }
  return { ok: true, wire: { variant: p.name, data: out } };
}

/**
 * Encode a runtime value against `table` → `{ ok, wire }` (a JSON-safe value) or a failure.
 * `opts.hostNullPassthrough` (default false): §57.3's server-fn-return raw-null rule.
 */
export function encode(table, value, opts) {
  return guarded("value", () => enc(table, table.root, value, "$", { hostNullPassthrough: flag(opts, "hostNullPassthrough") }));
}

// An option flag: `true` only as an OWN property whose value is `true` — never
// inherited (prototype pollution must not flip a fail-closed default). Called
// inside `guarded`, so a throwing getter / revoked Proxy as opts is a failure.
function flag(opts, name) {
  if (opts === null || opts === undefined) return false;
  return Object.hasOwn(opts, name) && opts[name] === true;
}

/** Encode to JSON text → `{ ok, text }` or a failure. */
export function encodeText(table, value, opts) {
  const r = encode(table, value, opts);
  if (!r.ok) return r;
  return { ok: true, text: JSON.stringify(r.wire) };
}

// -----------------------------------------------------------------------------
// Decode — JSON value → runtime value (type-directed, fail-closed, no coercion).
// -----------------------------------------------------------------------------

function dec(table, ty, w, path, opts) {
  if (ty.k === "maybe") {
    if (isAbsenceEnvelope(w)) return { ok: true, value: null };
    if (w === null) {
      // §57.4 dual-decoder (v0.x) admits raw null; §57.5 canonical-only refuses it.
      if (opts.canonicalOnly) return fail("malformed", path, "raw null is not the canonical absence envelope (§57.5)");
      return { ok: true, value: null };
    }
    // §57.4: no other object shape may stand for absence — an object that
    // carries the envelope key but is not exactly the envelope is malformed.
    if (isPlainObject(w) && hasOwn(w, ABSENT_KEY)) {
      return fail("malformed", path, `an object carrying ${ABSENT_KEY} that is not exactly the §57.2 envelope`);
    }
    return dec(table, ty.inner, w, path, opts);
  }
  if (w === null) return fail("malformed", path, `null where ${describe(table, ty)} (no absence) is expected`);
  if (isAbsenceEnvelope(w)) return fail("malformed", path, `the absence envelope where ${describe(table, ty)} (no absence) is expected`);
  switch (ty.k) {
    case "int":
      if (typeof w === "number" && Number.isInteger(w)) return { ok: true, value: w };
      return fail("malformed", path, `expected an int, got ${show(w)}`);
    case "num":
      if (typeof w === "number" && Number.isFinite(w)) return { ok: true, value: w };
      return fail("malformed", path, `expected a number, got ${show(w)}`);
    case "str":
      if (typeof w === "string") return { ok: true, value: w };
      return fail("malformed", path, `expected a string, got ${show(w)}`);
    case "bool":
      if (typeof w === "boolean") return { ok: true, value: w };
      return fail("malformed", path, `expected a boolean, got ${show(w)}`);
    case "seq": {
      if (!Array.isArray(w)) return fail("malformed", path, `expected a sequence, got ${show(w)}`);
      const out = [];
      for (let i = 0; i < w.length; i++) {
        const r = dec(table, ty.elem, w[i], `${path}[${i}]`, opts);
        if (!r.ok) return r;
        out.push(r.value);
      }
      // §66.12 length axis: only `bounded` constrains a value (§6.14.2 r3 "sequence bounds").
      if (ty.bound.k === "bounded" && (out.length < ty.bound.min || out.length > ty.bound.max)) {
        return fail("contract", path, `length ${out.length} is outside ${ty.bound.min}..${ty.bound.max}`);
      }
      return { ok: true, value: out };
    }
    case "ref": {
      const d = defOf(table, ty);
      if (d.k === "enum") return decEnum(table, d, w, path, opts);
      if (!isPlainObject(w)) return fail("malformed", path, `expected a ${d.name} object, got ${show(w)}`);
      const declared = new Set(d.fields.map((f) => f.name));
      for (const k of Object.keys(w)) {
        // A key the type does not declare is refused, not dropped (no coercion).
        if (!declared.has(k)) return fail("malformed", keyPath(path, k), `${d.name} has no field ${keyText(k)}`);
      }
      const out = {};
      for (const f of d.fields) {
        // A missing field is malformed even for a `T | not` field: §57.4 admits
        // only the envelope and raw null as absence, not omission.
        if (!hasOwn(w, f.name)) return fail("malformed", `${path}.${f.name}`, `missing field ${f.name} of ${d.name}`);
        const r = dec(table, f.ty, w[f.name], `${path}.${f.name}`, opts);
        if (!r.ok) return r;
        setField(out, f.name, r.value);
      }
      return { ok: true, value: out };
    }
    default:
      throw new CodecDefect(`codec: unknown descriptor kind ${JSON.stringify(ty.k)}`);
  }
}

// §57.8, read side. A string must name a UNIT variant; an object must be
// exactly `{ variant, data }` naming a PAYLOAD variant. Anything else is
// malformed — never coerced (§57.4).
function decEnum(table, d, w, path, opts) {
  if (typeof w === "string") {
    const u = variantOf(d, w);
    if (u === undefined) return fail("malformed", path, `${d.name} has no variant ${show(w)}`);
    if (u.fields.length > 0) return fail("malformed", path, `${d.name}.${u.name} carries a payload; its wire form is {"variant", "data"}, not a bare name (§57.8)`);
    return { ok: true, value: w };
  }
  if (!isPlainObject(w)) return fail("malformed", path, `expected a ${d.name} variant name or {"variant", "data"} object, got ${show(w)}`);
  for (const k of Object.keys(w)) {
    if (k !== "variant" && k !== "data") return fail("malformed", keyPath(path, k), `a ${d.name} value has no key ${keyText(k)} (§57.8: exactly "variant" and "data")`);
  }
  if (!hasOwn(w, "variant")) return fail("malformed", `${path}.variant`, `missing the variant name of a ${d.name} value`);
  const p = variantOf(d, w.variant);
  if (p === undefined) return noVariant(d, w.variant, path);
  if (p.fields.length === 0) {
    return fail("malformed", path, `${d.name}.${p.name} carries no payload; its wire form is the string ${JSON.stringify(p.name)} (§57.8)`);
  }
  if (!hasOwn(w, "data")) return fail("malformed", `${path}.data`, `missing the payload of ${d.name}.${p.name}`);
  const r = decPayload(table, d, p, w.data, `${path}.data`, opts);
  if (!r.ok) return r;
  return { ok: true, value: { variant: p.name, data: r.value } };
}

// The failure for a wire `variant` that names none of d's variants (decEnum, decError).
function noVariant(d, name, path) {
  if (typeof name !== "string") return fail("malformed", `${path}.variant`, `expected a ${d.name} variant name, got ${show(name)}`);
  return fail("malformed", `${path}.variant`, `${d.name} has no variant ${show(name)}`);
}

// A variant's `data` object (keys = its declared field names, exactly) → the
// positional payload array, in descriptor field order. Shared by decEnum and
// decodeError: "One decoder therefore reads a variant's payload the same way
// whether it arrived as a value or as an error" (§57.8).
function decPayload(table, d, p, data, path, opts) {
  if (!isPlainObject(data)) return fail("malformed", path, `expected the payload object of ${d.name}.${p.name}, got ${show(data)}`);
  const declared = new Set(p.fields.map((f) => f.name));
  for (const k of Object.keys(data)) {
    if (!declared.has(k)) return fail("malformed", keyPath(path, k), `${d.name}.${p.name} has no field ${keyText(k)}`);
  }
  const out = [];
  for (const f of p.fields) {
    // as for a struct: omission is not an admitted absence form (§57.4)
    if (!hasOwn(data, f.name)) return fail("malformed", `${path}.${f.name}`, `missing field ${f.name} of ${d.name}.${p.name}`);
    const r = dec(table, f.ty, data[f.name], `${path}.${f.name}`, opts);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return { ok: true, value: out };
}

const ERROR_KEY = "__scrml_error";

// The §57.8 / §19.9.1 `fail` envelope against enum def `d`: exactly the four
// own keys `__scrml_error` (=== true), `type` (=== d.name), `variant` (one of
// d's variants) and `data` (that variant's payload object; `{}` for a unit
// variant). An extra key is refused, as everywhere in this codec.
function decError(table, d, w, opts) {
  const path = "$";
  if (!isPlainObject(w)) return fail("malformed", path, `expected a ${ERROR_KEY} envelope object, got ${show(w)}`);
  for (const k of Object.keys(w)) {
    if (k !== ERROR_KEY && k !== "type" && k !== "variant" && k !== "data") {
      return fail("malformed", keyPath(path, k), `an error envelope has no key ${keyText(k)} (§57.8: ${ERROR_KEY}, type, variant, data)`);
    }
  }
  if (!hasOwn(w, ERROR_KEY) || w[ERROR_KEY] !== true) return fail("malformed", `${path}.${ERROR_KEY}`, `not an error envelope: ${ERROR_KEY} is not true`);
  if (!hasOwn(w, "type")) return fail("malformed", `${path}.type`, `missing the error type (expected ${JSON.stringify(d.name)})`);
  if (w.type !== d.name) return fail("malformed", `${path}.type`, `error type ${show(w.type)} is not the declared ${JSON.stringify(d.name)}`);
  if (!hasOwn(w, "variant")) return fail("malformed", `${path}.variant`, `missing the variant name of a ${d.name} error`);
  const p = variantOf(d, w.variant);
  if (p === undefined) return noVariant(d, w.variant, path);
  if (!hasOwn(w, "data")) return fail("malformed", `${path}.data`, `missing the payload of ${d.name}.${p.name} ({} for a variant with no fields)`);
  const r = decPayload(table, d, p, w.data, `${path}.data`, opts);
  if (!r.ok) return r;
  // the same runtime value a decoded enum VALUE has: a unit variant is its name
  if (p.fields.length === 0) return { ok: true, value: p.name };
  return { ok: true, value: { variant: p.name, data: r.value } };
}

/**
 * Decode a §57.8 `fail` error envelope (a parsed JSON value) against `table`,
 * whose root must be an enum ref (the callee's declared error type) →
 * `{ ok, value }` (the declared variant's runtime value) or a "malformed"
 * failure. `opts.canonicalOnly` as for `decode` (it governs `T | not`
 * payload fields). No call path uses this yet (U1b `rt.call` will).
 */
export function decodeError(table, wire, opts) {
  return guarded("malformed", () => {
    const root = table.root;
    if (root === null || typeof root !== "object" || root.k !== "ref") throw new CodecDefect("codec: decodeError needs a table whose root is an enum ref");
    const d = defOf(table, root);
    if (d.k !== "enum") throw new CodecDefect(`codec: decodeError against ${JSON.stringify(d.name)}, which is not an enum`);
    return decError(table, d, wire, { canonicalOnly: flag(opts, "canonicalOnly") });
  });
}

/**
 * Decode a parsed JSON value against `table` → `{ ok, value }` or a failure.
 * `opts.canonicalOnly` (default false): refuse raw `null` as absence (§57.5).
 */
export function decode(table, wire, opts) {
  return guarded("malformed", () => dec(table, table.root, wire, "$", { canonicalOnly: flag(opts, "canonicalOnly") }));
}

/** Decode JSON text → `{ ok, value }` or a failure (`kind: "parse"` for non-JSON text). */
export function decodeText(table, text, opts) {
  if (typeof text !== "string") return fail("parse", "$", `expected JSON text, got ${text === null ? "null" : typeof text}`);
  let wire;
  try {
    wire = JSON.parse(text);
  } catch (e) {
    return fail("parse", "$", `not JSON: ${message(e)}`);
  }
  return decode(table, wire, opts);
}

// -----------------------------------------------------------------------------
// s478 (s478-ruled-stdlib-data) — the §41.13 `parseVariant(json, EnumType)` intrinsic
// (S478 open-Qs ruling (user-voice) item 56: "build the intrinsic (§41.13 is normative; 8
// cases)"). The compiler lowers each call to Core Failable.FParse, printed as
// `rt.parseVariant(<EnumType's §57 table>, <ParseError's table>, json)`. Returns the decoded
// enum value (the runtime shape: a unit variant is its name, a payload variant `{ variant,
// data: [v0, …] }` positional in declared field order), or `failure(e)` with `e` a ParseError
// value built against `errTable` (field names → positions, so the stdlib's declaration order is
// read, never assumed). SPEC §41.13:
//   - "the JSON string failed `JSON.parse`, OR the input is `null`/non-object/non-string (not a
//     decodable object shape at all)" → Malformed(reason) — an array is not an object (§61.3 reads
//     it so too);
//   - "the input is an OBJECT that lacks a `tag` field" → MissingDiscriminator (a `tag` that is
//     not a string names no variant either, as impl#1 and the endpoint decode read it);
//   - "the JSON discriminator value does not match any variant name" → UnknownVariant(tag) —
//     names are compared, never looked up (a `"__proto__"` / `"toString"` tag names nothing);
//   - "a variant's payload field has the wrong type" → InvalidPayload(field, reason). STRICT
//     KEYS: an object key other than `tag` and the payload fields of the variant `tag` names is
//     InvalidPayload too — §61.3, whose body "decodes … via parseVariant": "The request body's
//     keys SHALL be exactly `tag` and payload fields of the variant `tag` names. A key that is
//     neither is a decode failure — `::InvalidPayload`"; §57 refuses an extra key everywhere
//     ("A key the type does not declare is refused, not dropped (no coercion)"). A missing field
//     is InvalidPayload. Each field decodes through the §57 codec (`decode`, canonical-only), no
//     coercion: `"lots"` is not an `int`.
// The `reason` texts are implementation freedom (the conformance cases assert the variant and
// `field`, never `reason`).
// -----------------------------------------------------------------------------
// S479 ruling (user-voice) §3.A item 5 — §61.3 "A repeated key": "A request body in which one
// JSON object — the body itself or any object nested in it — names the same key twice is a
// decode failure — `::Malformed` … Keys are compared after JSON string unescaping, so `"tag"`
// and `"t\u0061g"` are the same key." `JSON.parse` keeps the last of a repeated name silently
// (review #1940 (4): `{"tag":"Unit","tag":"I","n":3}` ran `I`, while a first-wins proxy saw
// `Unit`), so the text is scanned once more after it parses. S479 (#1962 ruling item 5): moved
// here from server-runtime.js (which re-exports it for the endpoint decode) so the standalone
// §41.13 `parseVariant` below refuses a repeated key in a string input as well.
//
// `text` is JSON that `JSON.parse` accepted, so the scan only tracks structure: string literals
// (skipped by their escapes; a `\` escapes exactly the next character, so `\"` never ends a
// string and `\\"` does), `{ [ } ] , :`. Each open object holds the set of its keys; a string
// read where an object expects a key (after `{` or after a `,` inside that object) is a key. A
// key with no `\` is its own text; one with escapes is decoded by `JSON.parse` of the literal,
// so every spelling of a name (`a`, `\/`, a surrogate pair) compares by its value. The
// stack is explicit, so a deeply nested body cannot overflow the call stack here. Returns the
// first repeated key, or `undefined`.
export function jsonRepeatedKey(text) {
  const stack = []; // per open container: a Set of keys (an object) or null (an array)
  let expectKey = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 0x22) {
      const start = i;
      let escaped = false;
      i++;
      while (i < n) {
        const d = text.charCodeAt(i);
        if (d === 0x5c) { escaped = true; i += 2; continue; }
        if (d === 0x22) break;
        i++;
      }
      i++; // past the closing quote
      if (expectKey) {
        const keys = stack[stack.length - 1];
        const key = escaped ? JSON.parse(text.slice(start, i)) : text.slice(start + 1, i - 1);
        if (keys.has(key)) return key;
        keys.add(key);
        expectKey = false;
      }
      continue;
    }
    if (c === 0x7b) { stack.push(new Set()); expectKey = true; }
    else if (c === 0x5b) { stack.push(null); expectKey = false; }
    else if (c === 0x7d || c === 0x5d) { stack.pop(); expectKey = false; }
    else if (c === 0x2c) expectKey = stack.length > 0 && stack[stack.length - 1] !== null;
    else if (c === 0x3a) expectKey = false;
    i++;
  }
  return undefined;
}

const pvOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const pvClip = (s) => (s.length > 64 ? s.slice(0, 64) + "…" : s);

// A ParseError value: variant `name` of `errTable`'s root enum, its payload from `byField`.
function pvError(errTable, name, byField) {
  const d = defOf(errTable, errTable.root);
  const v = d.k === "enum" ? variantOf(d, name) : undefined;
  if (v === undefined) throw new CodecDefect(`parseVariant: the error enum ${JSON.stringify(d.name)} has no variant ${JSON.stringify(name)} (§41.13 ParseError)`);
  if (v.fields.length === 0) return failure(v.name);
  const data = v.fields.map((f) => {
    if (!pvOwn(byField, f.name)) throw new CodecDefect(`parseVariant: ${d.name}.${v.name} has a field ${JSON.stringify(f.name)} the decode does not fill (§41.13 ParseError)`);
    return byField[f.name];
  });
  return failure({ variant: v.name, data });
}

export function parseVariant(table, errTable, json) {
  const d = defOf(table, table.root);
  if (d.k !== "enum") throw new CodecDefect(`parseVariant: ${JSON.stringify(d.name)} is not an enum descriptor (§41.13)`);
  let v = json;
  if (typeof json === "string") {
    try { v = JSON.parse(json); } catch (e) { return pvError(errTable, "Malformed", { reason: `not JSON: ${message(e)}` }); }
    // §41.13 "A repeated key" (S479, #1962 ruling item 5): "When the input is a string, a JSON
    // text in which one object … names the same key twice is a decode failure — `::Malformed`"
    // — the §61.3 endpoint rule, by the same detector.
    const rep = jsonRepeatedKey(json);
    if (rep !== undefined) return pvError(errTable, "Malformed", { reason: `the JSON text repeats the key '${pvClip(rep)}' in one object` });
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) return pvError(errTable, "Malformed", { reason: "expected a JSON object (or the JSON text of one) at the parseVariant boundary" });
  if (!pvOwn(v, "tag") || typeof v.tag !== "string") return pvError(errTable, "MissingDiscriminator", {});
  const variant = variantOf(d, v.tag);
  if (variant === undefined) return pvError(errTable, "UnknownVariant", { tag: v.tag });
  for (const k of Object.keys(v)) {
    if (k !== "tag" && !variant.fields.some((f) => f.name === k)) return pvError(errTable, "InvalidPayload", { field: k, reason: `'${pvClip(k)}' is not a payload field of variant '${variant.name}'` });
  }
  if (variant.fields.length === 0) return variant.name;
  const data = [];
  for (const f of variant.fields) {
    if (!pvOwn(v, f.name)) return pvError(errTable, "InvalidPayload", { field: f.name, reason: `payload field '${f.name}' of variant '${variant.name}' is missing` });
    const r = decode({ defs: table.defs, root: f.ty }, v[f.name], { canonicalOnly: true });
    if (!r.ok) return pvError(errTable, "InvalidPayload", { field: f.name, reason: `payload field '${f.name}' of variant '${variant.name}': ${r.error && r.error.reason ? r.error.reason : "it does not decode"}` });
    data.push(r.value);
  }
  return { variant: variant.name, data };
}

// Reading the input may throw: a recursive type admits unboundedly deep input
// (or, on encode, a cyclic value) that exhausts the stack, and a getter or a
// Proxy trap may throw. Each is a failure of the operation's `kind`, not a
// crash. A `CodecDefect` (a broken descriptor) is a compiler bug and propagates.
function guarded(kind, run) {
  try {
    return run();
  } catch (e) {
    // `instanceof` on a thrown Proxy runs its traps, so classify defensively.
    let defect = false;
    let overflow = false;
    try {
      defect = e instanceof CodecDefect;
      overflow = e instanceof RangeError;
    } catch {
      // a hostile thrown value: neither
    }
    if (defect) throw e;
    if (overflow) return fail(kind, "$", "nesting too deep (or a cyclic value)");
    return fail(kind, "$", `reading the input threw: ${message(e)}`);
  }
}

// An error's message, without trusting the thrown thing (it may be any value).
function message(e) {
  try {
    return String(e instanceof Error ? e.message : e);
  } catch {
    return "an unprintable error";
  }
}

// A foreign object KEY in a failure (path and reason): a short plain identifier
// verbatim (`$.data.zzz`); anything else — long, control characters, punctuation —
// through `show`'s bounded (40-char), JSON-escaped form (`$["KKKK…"]`). A failure
// never carries an unbounded or raw foreign key.
const PLAIN_KEY = /^[A-Za-z_$][A-Za-z0-9_$]{0,39}$/;
function keyText(k) {
  return PLAIN_KEY.test(k) ? k : show(k);
}
function keyPath(path, k) {
  return PLAIN_KEY.test(k) ? `${path}.${k}` : `${path}[${show(k)}]`;
}

function show(x) {
  if (x === undefined) return "undefined";
  if (typeof x === "string") return JSON.stringify(x.length > 40 ? x.slice(0, 40) + "…" : x);
  if (Array.isArray(x)) return "an array";
  if (x === null) return "null";
  if (typeof x === "object") return "an object";
  return String(x);
}

// =============================================================================
// `persist="local" | "session"` + `key=` (SPEC §6.14) — browser-persisted
// cells. The compiler emits `persisted(inst$.scope, <default thunk>, store,
// key, <wire table>)` for a persisted program cell, and `unpersist(cell)`
// after the Write of a reset of one.
//
//   r1  RESTORE AT CONSTRUCTION — the cell is a seed (`seeded`) whose value is
//       read from storage when the seed settles: at the end of the outermost
//       construction, before any render, inside a storage guard. It is not a
//       write: no observer exists yet and none is notified — so no `<effect>`
//       and no `reset-on=` reset fires (O-061-6, closed S449).
//   r2  CODEC — the §57 codec above, against the descriptor the compiler
//       resolved from the cell's type.
//   r3  DECODE FIRST, DEFAULT ON FAILURE — an absent key, unavailable storage
//       (a getter or a read that throws), text that is not JSON, a shape the
//       type does not have, or a contract failure (a §66.12 length bound) all
//       give the DEFAULT (the initializer, evaluated); nothing is coerced.
//       §55 validators are not consulted, and `touched` is not set.
//   r4  WRITE ON CHANGE — a change of the cell queues ONE store into the
//       writing batch's flush (render effects and stores drain together); the
//       store encodes the cell's value at that point, so a batch that writes
//       twice stores once, the latest value (write timing is O-061-7, OPEN).
//   r5  CROSS-TAB SYNC — "local" only: a `storage` event for this key, from
//       another document, is decoded under r3 (a failure, or a removed key,
//       gives the default) and applied with `set` — a change like any other,
//       so `<effect>`s run (§6.7.4 "whichever writer changed that state (… a
//       cross-tab `persist=` sync …)"). It is not written back to storage.
//       (The compiler refuses a "local" cell whose contract refuses a
//       whole-value write, and a "local" cell as a `reset-on=` trigger —
//       O-061-5 is OPEN.)
//   r6  A STORE THAT FAILS (quota, unavailable storage, an unencodable value)
//       never throws into user code. It sets the record's `failed` flag; the
//       synthesized status property §6.14.2 r6 asks for has no name yet
//       (O-061-1), so nothing a program can read reflects it.
//   r9  A RESET REMOVES THE KEY — `unpersist` runs after the reset's Write:
//       it cancels the store that Write queued and removes the key, so the
//       next load takes the CURRENT default.
// =============================================================================
const persistedCells = new WeakMap();

/** The Web Storage area of `store` — reading the global may itself throw (a blocked origin). */
function storageArea(store) {
  return store === "local" ? globalThis.localStorage : globalThis.sessionStorage;
}

/** §6.14.2 r3: the stored value of `key`, decoded — or null (take the default). Never throws. */
function readStored(store, key, wire) {
  let text = null;
  try {
    const area = storageArea(store);
    if (area === null || area === undefined) return null;
    text = area.getItem(key);
  } catch {
    return null;
  }
  if (text === null) return null;
  const r = decodeText(wire, text);
  return r.ok ? r : null;
}

class Persisted {
  constructor(scope, cell, init, store, key, wire) {
    this.cell = cell;
    this.init = init;
    this.store = store;
    this.key = key;
    this.wire = wire;
    this.disposed = false;
    this.applying = false;
    // r6: the last store failed (no synthesized property reads it yet — O-061-1).
    this.failed = false;
    cell.observers.add(this);
    let onStorage = null;
    if (store === "local" && typeof window !== "undefined") {
      onStorage = (e) => this.sync(e);
      window.addEventListener("storage", onStorage);
    }
    scope.own(() => {
      this.disposed = true;
      queue.delete(this);
      cell.observers.delete(this);
      persistedCells.delete(cell);
      if (onStorage !== null) window.removeEventListener("storage", onStorage);
    });
  }
  markStale() {
    // a cross-tab value is not written back (r5)
    if (this.disposed || this.applying) return;
    queue.add(this);
    if (batchDepth === 0) flush();
  }
  /** r4: store the cell's current value (run from the writing batch's flush). */
  run() {
    const enc = encodeText(this.wire, this.cell.peek());
    if (!enc.ok) { this.failed = true; return; }
    try {
      storageArea(this.store).setItem(this.key, enc.text);
      this.failed = false;
    } catch {
      this.failed = true;
    }
  }
  /** r9: cancel the queued store and remove the key. */
  forget() {
    queue.delete(this);
    try {
      storageArea(this.store).removeItem(this.key);
    } catch {
      this.failed = true;
    }
  }
  /** r5: another document changed (or removed, or cleared) this key. */
  sync(e) {
    if (this.disposed) return;
    if (e.key !== null && e.key !== this.key) return;
    let mine = false;
    try { mine = e.storageArea === storageArea("local"); } catch { mine = false; }
    if (!mine) return;
    const text = e.key === null ? null : e.newValue;
    const r = text === null ? null : decodeText(this.wire, text);
    const v = r !== null && r.ok ? r.value : untrack(this.init);
    this.applying = true;
    try { batch(() => this.cell.set(v)); } finally { this.applying = false; }
  }
}

/**
 * A `persist=` cell (§6.14.2): seeded with its stored value decoded against
 * `wire`, else with `init()`; written on change; "local" synced across tabs.
 * Owned by `scope` (the instance's): its listener and observer go with it.
 */
export function persisted(scope, init, store, key, wire) {
  requireScope(scope, "a persisted cell");
  if (store !== "local" && store !== "session") throw new Error(`persist= storage ${JSON.stringify(store)} is not "local" or "session" (§6.14.1, E-PERSIST-STORAGE-UNKNOWN)`);
  const c = seeded(() => {
    const r = readStored(store, key, wire);
    return r !== null ? r.value : init();
  });
  persistedCells.set(c, new Persisted(scope, c, init, store, key, wire));
  return c;
}

/** §6.14.2 r9: after a reset's Write — remove `cell`'s storage key instead of storing the reset value. */
export function unpersist(cell) {
  const p = persistedCells.get(cell);
  if (p === undefined) throw new Error("unpersist of a cell that is not persisted (check.scrml C17)");
  p.forget();
}

/** The persistence record of `cell` (tests, devtools): { store, key, failed } or null. */
export function persistOf(cell) {
  const p = persistedCells.get(cell);
  return p === undefined ? null : { store: p.store, key: p.key, failed: p.failed };
}

// ---------------------------------------------------------------------------
// s454 (U1b) — THE CLIENT HALF OF A CALL TO A SERVER FUNCTION (SPEC §19.9.10,
// §57.4 / §57.5 / §57.8; design Items 2.4 and 3).
//
// `call(route, args, task)` → a Promise that RESOLVES — never rejects — with
// the call's outcome: the decoded success value, or a Failure whose error is
// either a variant of the callee's declared enum (decoded from its §57.8
// `fail` envelope) or `Transport(t)` with `t` a `ServerCallError` value built
// HERE, on the client (§19.9.10: "Never sent by the server"; "No variant SHALL
// carry server-written text"). Every row of the classification is a value;
// nothing is coerced into a success (§57.4 "SHALL NOT silently coerce"):
//
//   2xx  200…299 but 204, a body that decodes STRICTLY (canonicalOnly — R10)
//        against the declared return type          → the value
//        (the design table names 200; ANY 2xx other than 204 is a success per HTTP,
//        so 201…299 with a decodable body are accepted as one — a reading, flagged)
//   204  for a function that yields no value       → success (no value: null)
//   2xx  anything else — a body for a no-value function, 204 for one that
//        returns a value, text that is not JSON, a body that does not decode,
//        a `__scrml_error` envelope on a 2xx status  → Transport(Malformed)
//   non-2xx  an object with own `__scrml_error`: decoded strictly against the
//        callee's declared enum (`type` equal to its name, a known `variant`,
//        `data` strict per §57.8)                  → that declared variant
//   non-2xx  an envelope failing any check, or a callee not declared `!`
//                                                  → Transport(Malformed)
//   4xx  not an envelope                           → Transport(Refused(status))
//   5xx  not an envelope                           → Transport(ServerFault(status))
//   (other statuses — 1xx / 3xx reaching the client: not a route's answer)
//                                                  → Transport(Malformed)
//   `fetch` rejects, the body cannot be read, or the DEADLINE passes before an
//   answer is read                                 → Transport(Unreachable)
//
// THE DEADLINE (§19.9.10 S454): "The client runtime SHALL apply a deadline to
// every client call of a server function. A call that has not produced a
// response when its deadline passes SHALL fail with `Unreachable`". The VALUE is
// RULED (S454 "your recs on both, then go on F8"): "The deadline is 30 seconds,
// fixed" — not configurable. SERVER_CALL_DEADLINE_MS is that ruled value, one
// named constant.
//
// ABORT (§6.7.7.1, design §2.3): nothing aborts an in-flight call. A call whose
// task was cancelled (teardown) still settles here; its continuation is
// dropped by `suspend`. `task` is accepted for the READ-abort slot U3 may use.
//
// Runtime value shapes (Ue DESIGN §5): a unit variant is its tag string, a
// payload variant `{ variant, data: [positional] }`; the transport wrapper is
// `{ variant: "Transport", data: [<ServerCallError value>] }` (design Item 1 B).
// ---------------------------------------------------------------------------
export const SERVER_CALL_DEADLINE_MS = 30000;

const transportFailure = (sce) => failure({ variant: "Transport", data: [sce] });
const unreachable = () => transportFailure("Unreachable");
const refused = (status) => transportFailure({ variant: "Refused", data: [status] });
const serverFault = (status) => transportFailure({ variant: "ServerFault", data: [status] });
const malformed = (reason) => transportFailure({ variant: "Malformed", data: [reason] });

// A codec failure `{ kind, path, reason }` as Malformed's reason — written from
// the client's own check (the codec bounds anything it quotes).
const codecReason = (what, err) => `${what}: malformed at ${err.path}: ${err.reason}`;

/**
 * s473 — §5.2 "Data never moves the document base (S473)": the URL scrml's own
 * server-function call is sent to. A path-absolute route path given to `fetch`
 * is resolved against `document.baseURI`, which a `<base href>` moves — a
 * static one as much as a data one — so the call (its POST body and its
 * `X-CSRF-Token`) would go wherever the base points (Chromium-verified, gap
 * g-boot-base-href-from-data-retargets-server-calls-s473). The path is resolved
 * against the document's EFFECTIVE origin instead, never its base URL:
 *   - an `http:` / `https:` document: its own URL (`location.href`);
 *   - an `about:` document (`about:srcdoc` — an app inside `<iframe srcdoc>` —
 *     or an `about:blank` its creator opened): the origin it inherits
 *     (`globalThis.origin`), when that is not opaque (`"null"`) — #1637 review F1;
 *   - anything else (an opaque origin, `file:`, `data:`, a sandboxed `about:`
 *     document) has no http(s) origin to send to.
 * The result must be `http:` / `https:` and keep that origin (a `//host/…`,
 * `data:` or `javascript:` path does not — "null" never equals "null" here,
 * #1637 review F2). Throws — the caller settles the call as Unreachable, no
 * request made — when it does not. With no document at all (`location` absent,
 * no `document`) nothing resolves against a `<base>`, and the path is used as
 * given.
 */
function ownOriginUrl(path) {
  const loc = globalThis.location;
  if (loc === undefined || loc === null) {
    if (globalThis.document) throw new Error("scrml: a document with no location — the call has no origin to go to");
    return path;
  }
  let here = new URL(String(loc.href));
  if (here.protocol === "about:") {
    const inherited = typeof globalThis.origin === "string" ? globalThis.origin : "null";
    if (inherited === "null") throw new Error("scrml: the document has no origin a server call can go to");
    here = new URL(inherited + "/");
  }
  if (!isHttpUrl(here) || here.origin === "null") throw new Error("scrml: the document has no http(s) origin a server call can go to");
  const u = new URL(String(path), here);
  if (!isHttpUrl(u) || u.origin !== here.origin) throw new Error("scrml: a server call's route leaves the document's origin");
  return u.href;
}

function isHttpUrl(u) {
  return u.protocol === "http:" || u.protocol === "https:";
}

export function call(route, args, task) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    // s454 fix round F3 — resource hygiene ONLY: when the deadline passes the call has already FAILED
    // (Unreachable); aborting the fetch stops holding the socket (the abort also errors a body read in
    // progress — no separate `body.cancel()`: the body is locked by `text()`, and cancelling a locked
    // stream returns a REJECTED promise, an unhandled rejection; re-review N1).
    // s475 (S5a) — the SAME controller is the §6.7.7.1 supersede / teardown abort, for a READ
    // request's task only (Task.onAbort is a no-op on every other task, which keeps discard-only:
    // a WRITE's transport "runs to completion"). The abort settles the call at once — on a task
    // that is already cancelled, so `suspend` drops the value: no continuation, no `error`, no
    // host-error report (rule 4: "An aborted fetch SHALL NOT set `<#id>.error`, and SHALL NOT be
    // treated as a failure settle"). It covers every transport of the call — the CSRF retry
    // (`send(1)`) shares the controller, and a retry after the abort is never sent (`settled`).
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let unAbort = () => {};
    const settle = (v) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      unAbort();
      resolve(v);
    };
    if (task && controller && typeof task.onAbort === "function") {
      unAbort = task.onAbort(() => {
        if (settled) return;
        settle(unreachable());
        try { controller.abort(); } catch { /* best effort */ }
      });
      if (settled) return;            // the task was cancelled before the call began: nothing is sent
    }
    timer = setTimeout(() => {
      if (settled) return;
      settle(unreachable());
      try { if (controller) controller.abort(); } catch { /* best effort */ }
    }, SERVER_CALL_DEADLINE_MS);
    // the request: a JSON ARRAY of the arguments, each encoded against its parameter's type (Item 3.1)
    let body;
    try {
      const wire = [];
      for (let i = 0; i < args.length; i++) {
        const r = encode(route.params[i], args[i]);
        if (!r.ok) {
          // a value that does not inhabit its declared type — a compiler defect, reported, and the call fails as a value
          reportHostError(new Error(`scrml: argument ${i + 1} of the call to ${route.path} does not encode (${r.error.reason})`));
          settle(malformed(`the request could not be encoded (argument ${i + 1})`));
          return;
        }
        wire.push(r.wire);
      }
      body = JSON.stringify(wire);
    } catch (e) {
      reportHostError(e);
      settle(malformed("the request could not be encoded"));
      return;
    }
    // s468 (U1c) — §39.2.3 baseline double-submit CSRF: every request carries the
    // `scrml_csrf` cookie's value as `X-CSRF-Token` (the server compares the two).
    // A request made before the cookie exists is refused (403, not an envelope)
    // with a cookie planted to retry with: the call is retried ONCE with it, and
    // only the final answer is classified (U1b design Item 3.2 "if it does, the
    // retry is inside rt.call"). No retry when the token did not change.
    const send = (attempt) => {
      const tok = csrfToken();
      const headers = { "Content-Type": "application/json" };
      if (tok !== "") headers[CSRF_HEADER] = tok;
      let pending;
      try {
        const init = { method: "POST", headers, body };
        if (controller) init.signal = controller.signal;
        pending = globalThis.fetch(ownOriginUrl(route.path), init);
      } catch {
        settle(unreachable());
        return;
      }
      Promise.resolve(pending).then(
        (resp) => {
          let status;
          try { status = resp.status; } catch { settle(unreachable()); return; }
          Promise.resolve()
            .then(() => resp.text())
            .then((text) => {
              if (settled) return;
              if (attempt === 0 && status === 403 && !isErrorEnvelopeText(text)) {
                const fresh = csrfToken();
                if (fresh !== "" && fresh !== tok) { send(1); return; }
              }
              settle(classifySafely(route, status, text));
            }, () => settle(unreachable()));
        },
        () => settle(unreachable()),
      );
    };
    send(0);
  });
}

// s473 (Lane B) — the page's `<db>` cells (SPEC §8.1.3; RULED S472 "`<db>` body +
// client reads", items 1–2): each cell's value is loaded on the SERVER, per
// request, by its parameterless load route, and the page WAITS for every one
// before the program instance is built (so a cell's type stays `T`). One call
// at a time, in program order (each is an ordinary `call` — the CSRF pair, the
// deadline, the strict decode against the cell's declared type). The answer is
// `{ ok, values }`: `values[i]` the decoded value of `routes[i]`. When a load
// fails the page is NOT mounted (ok = false) and the failure is reported by its
// ServerCallError variant only — never a reason text, which is the only part
// that could quote anything the server sent.
// s479 (s479-records; SPEC §8.1.3 "A failed load", RULED S479 §3.B item 23 —
// "a program-level default failure view, not `@x.error`"): in place of the
// program, the page shows the default failure view (loadFailedView). INTERIM:
// the author override slot comes with the §52 load slice.
export async function loadDbCells(routes) {
  const values = [];
  for (const r of routes) {
    const v = await call(r, [], null);
    if (failed(v)) {
      reportHostError(new Error(`scrml: a <db> cell's server load failed (${loadFailureName(v)}) — the page is not mounted`));
      loadFailedView();
      return { ok: false, values: [] };
    }
    values.push(v);
  }
  return { ok: true, values };
}

// The program-level default failure view (§8.1.3): one element where the
// program would have mounted (the end of <body>), with fixed text — it quotes
// nothing the server sent (no reason, no status, no body). Its two attributes
// are constants set through the reflected properties (`role`, `dataset`): the
// runtime keeps one `setAttribute`, the guarded data write in `attr`
// (compiler/tests/unit/bootstrap-url-guard-verbatim.test.js).
export const LOAD_FAILED_TEXT = "This page could not load its data.";
function loadFailedView() {
  const d = globalThis.document;
  if (!d || !d.body) return;
  const el = d.createElement("p");
  el.role = "alert";
  el.dataset.scrmlLoadFailed = "";
  el.textContent = LOAD_FAILED_TEXT;
  d.body.appendChild(el);
}

// `Transport(Unreachable)`, `Transport(ServerFault(500))`, `Transport(Malformed)` — names and a status only.
function loadFailureName(f) {
  const e = f.error;
  if (e === null || typeof e !== "object" || e.variant !== "Transport" || !Array.isArray(e.data)) return "a failure";
  const t = e.data[0];
  if (typeof t === "string") return `Transport(${t === "Unreachable" ? t : "?"})`;
  if (t === null || typeof t !== "object") return "Transport";
  if (t.variant === "Refused" || t.variant === "ServerFault") {
    const s = Array.isArray(t.data) ? t.data[0] : undefined;
    return `Transport(${t.variant}(${Number.isInteger(s) ? s : "?"}))`;
  }
  return t.variant === "Malformed" ? "Transport(Malformed)" : "Transport";
}

// s468 (U1c): the double-submit pair (server-runtime.js checks it).
export const CSRF_COOKIE = "scrml_csrf";
export const CSRF_HEADER = "X-CSRF-Token";

// The `scrml_csrf` cookie's value ("" — none, or no document).
function csrfToken() {
  const d = globalThis.document;
  if (!d) return "";
  let jar;
  try { jar = String(d.cookie ?? ""); } catch { return ""; }
  for (const part of jar.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === CSRF_COOKIE) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return ""; }
    }
  }
  return "";
}

function isErrorEnvelopeText(text) {
  const j = parseJson(text);
  return j.ok && isErrorEnvelope(j.value);
}

// s454 fix round F1 — `classify` throws only on a COMPILER defect (a CodecDefect: a descriptor of an
// unknown kind, an error table whose root is not an enum). Reported once, and the call settles NOW as a
// value — never an unhandled rejection, never a hang to the deadline mislabelled Unreachable.
function classifySafely(route, status, text) {
  try {
    return classify(route, status, text);
  } catch (e) {
    reportHostError(e);
    return malformed("the answer could not be classified (a compiler defect in the route's descriptor)");
  }
}

function parseJson(text) {
  try { return { ok: true, value: JSON.parse(text) }; } catch { return { ok: false, value: undefined }; }
}

function isErrorEnvelope(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x) && Object.prototype.hasOwnProperty.call(x, ERROR_KEY);
}

// One response, classified by the table above. Pure (tested directly).
export function classify(route, status, text) {
  if (typeof status !== "number" || !Number.isInteger(status)) return unreachable();
  if (status >= 200 && status <= 299) {
    if (route.result === null) {
      if (status === 204 && (text === "" || text === undefined || text === null)) return null;
      if (status === 204) return malformed("a 204 answer with a body");
      return malformed(`a ${status} answer for a function that yields no value (its answer is 204, no body)`);
    }
    if (status === 204) return malformed("a 204 (no value) answer, for a function that returns a value");
    const j = parseJson(text);
    if (!j.ok) return malformed(`the ${status} answer is not JSON`);
    if (isErrorEnvelope(j.value)) return malformed(`an error envelope on a ${status} (success) status`);
    const r = decode(route.result, j.value, { canonicalOnly: true });
    if (!r.ok) return malformed(codecReason("the answer", r.error));
    return r.value;
  }
  const j = parseJson(text);
  if (j.ok && isErrorEnvelope(j.value)) {
    if (route.error === null) return malformed("an error envelope from a function not declared `!`");
    const r = decodeError(route.error, j.value, { canonicalOnly: true });
    if (!r.ok) return malformed(codecReason("the error envelope", r.error));
    return failure(r.value);
  }
  if (status >= 400 && status <= 499) return refused(status);
  if (status >= 500 && status <= 599) return serverFault(status);
  return malformed(`an unexpected status ${status}`);
}

// ---------------------------------------------------------------------------
// s478 (s478-boot-channel; ops: s478-boot-channel-ops) — SPEC §38 `<channel>`: the CLIENT half.
// The compiler emits one `rt.channel(scope, desc)` per channel (print.scrml channelBoot):
// `desc.name` (the route `/_scrml_ws/<name>`, §38.1), `desc.reconnect` (ms; 0 = none,
// §38.3.1), `desc.cells` — per channel cell its sync key, its signal, its §57 wire table,
// `ops` (the §38.4.2 op kinds it syncs — analyze chSyncOps) and `edges` (a `rule=` field's
// edge table, else null) — and the `onclient:*` hooks (`open` / `close` / `error`, §38.10,
// each `null` or a function called with no argument).
//   §38.4.2 (RULED S478 "op-based channel sync"): "A local write to a channel-declared cell
//   SHALL send one frame per edit, naming the narrowest op … Edits are sent in the order the
//   writes happen" — the cell's op sink (`Cell.sync`, called by `land` at each committed
//   write) sends `{ __type: "__sync", __key, __op, __val }`. A `rule=` field sends every write
//   as `transition`. An edit the cell does not sync as its own op (a part write of a `replace`
//   cell) is sent as `replace` — the whole new value (INTERIM, g-boot-channel-op-residue-s478).
//   "The sender applies its own edit first … The edit is then PENDING on the sender until the
//   relay's copy of it comes back" — the relay echoes every frame to every subscriber, the
//   sender included (S478 open-Qs ruling (user-voice), item 50; see `unit` below).
//   "The receiver SHALL, before it applies a frame, check: (1) … `__op` is an op its declared
//   grants admit; (2) the payload decodes canonically against its type; (3) the edit, applied
//   to the cell's CURRENT value, keeps every invariant a local write of the same edit is
//   checked against" — `receive`. "A refused frame … SHALL NOT be applied, in whole or in part,
//   and SHALL be reported to the developer … The connection stays open."
//   §38.10.4: "Sync of channel-scoped cells (§38.4) is suspended when the connection is closed
//   and resumes when it reopens: a write made while the connection is closed is not sent (nor
//   queued), and on reopening the client rebuilds its channel cells from the relay's frame log".
// ---------------------------------------------------------------------------
const CHANNEL_EDITS = new Set(["append", "prepend", "pop", "shift"]);

/** A tape cell's element table, or null when the cell's type is not a tape (§57 table shape). */
function elemTable(table) {
  return table !== null && table.root.k === "seq" ? { defs: table.defs, root: table.root.elem } : null;
}

/**
 * A tape table's length axis (§66.12.2 "fixed · bounded · free"): [min, max] for a bounded tape,
 * "fixed" for a tape with no `free` / bound grant (§66.12.1: its length is fixed — no edit may
 * change it, E-WRITE-INVARIANT locally), null for a free one. #1937 fix r1 (HIGH-1): a fixed tape
 * was read as unbounded, so a forged `pop` emptied it on every receiver.
 */
function lengthBound(table) {
  const b = table.root.bound;
  if (b === null || typeof b !== "object" || b.k === "fixed") return "fixed";
  return b.k === "bounded" ? [b.min, b.max] : null;
}

// S478 open-Qs ruling (user-voice), items 50–53 (s478-ruled-channel-sync2) — §38.4.2:
//   "Ordering — relay order … Each client keeps two things for the channel's cells: the CONFIRMED
//   value … and its PENDING edits … The value a client shows is the confirmed value with its
//   pending edits re-applied on top, in order, each checked against the value before it" —
//   `conf`, `pending`, `unit` (restore → apply → record → re-apply). "A frame with `__own: true`
//   is the client's oldest pending edit coming back … if it does not name the same cell, op and
//   payload as that oldest pending edit, or there is no pending edit, the stream is broken".
//   "Re-applying a pending edit makes that edit again and nothing else" — `rebaseSet` (no
//   `reset-on=` rule, no op sink). "Applying a relayed frame — the client's own included — makes
//   the writes it causes" — `apply` writes through `Cell.set`.
//   "A write made while applying a received frame — a `reset-on=` reset, an edge effect — is local
//   and is not sent … 'While applying' covers the whole received unit … up to and including the
//   flush" — `applying` is held across the whole `batch(…)` call of a unit, its flush included.
//   "The frame log … ONE replay message … The client SHALL set every channel cell back to its
//   initial value, drop its pending edits, and apply the logged frames … as ONE unit" — the first
//   message of every connection. "A client given an incomplete replay SHALL NOT show the channel
//   as in sync: it applies no frame from the replay, applies and sends no frame of the channel from
//   then on, does not reconnect the channel, reports …, and runs `onclient:error`" — `stopped`.
//   "a `__seq` that is not one more than the last one it applied, as a broken stream: it applies
//   nothing more from that connection and closes it" — `broken`.
//   "The report is rate-limited per channel: … at most 5 refused frames of one channel in any
//   10-second window, then one line" — `refused`.
const CHANNEL_REPORTS = 5;
const CHANNEL_REPORT_WINDOW_MS = 10000;

/**
 * A rebase write of a channel cell (§38.4.2: restoring the confirmed value, re-applying a pending
 * edit): the value and its observers, never a `reset-on=` rule (it makes that edit again and
 * nothing else) and never the op sink (it is not a new edit).
 */
function rebaseSet(cell, v) {
  cell.peek();
  if (Object.is(v, cell.value)) return;
  cell.value = v;
  for (const o of [...cell.observers]) if (!(o instanceof ResetOn)) o.markStale();
}

// §38.4.3 (S478 fix r1, MED-3): "A conforming client paces its frames to the bound; an honest
// client SHALL NOT be closed by it." The client mirrors the relay's token bucket (`desc.limits`)
// with a margin — a bucket of `burst` less 5% (at least 1) refilled at 95% of `rate` — so frames
// that arrive bunched (network jitter) still find a token at the relay. A frame that finds no
// token is QUEUED, never sent past the bucket, and the queue drains in order as tokens refill.
// A queued `replace` of a cell is superseded by a later `replace` of the same cell when no other
// frame of that cell is queued between them (the receiver's value after the later one does not depend
// on it, and no frame sent is judged on a value its sender did not make it on — lossless: the last
// value wins; S480, #1987 r2 review M-pre); every other queued op is sent, in order. A new connection starts with a full bucket (the
// relay's does, §38.4.3); a close drops the frames still queued (§38.10.4: sync is suspended
// while closed) and returns how many. Self-contained, so a resend on reconnect can go through
// `push` and be paced like any edit.
//   io: { now() → ms, later(fn, ms) → handle, cancel(handle), send(text, ref), superseded?(ref) }
// Integration (#1941 × #1942, S478): each queued frame carries the caller's `ref` (#1941's pending
// entry); `send(text, ref)` is told which frame went on the wire, and `superseded(ref)` which queued
// `replace` a later one superseded — that frame is never sent, so the caller drops its pending
// entry rather than wait for an echo that cannot come. `close()` returns how many were dropped.
// S480 r2 (#1987 review NEW-2), §38.4.3 "Over a rate bound": the pacer also keeps the frames it SENT
// and the relay has not answered (`flight`, in send order; the relay answers a connection's frames in
// the order it reads them). `answered(applied)` — the oldest unanswered frame was relayed (`applied`)
// or refused by the relay's fold (dropped, as before). `refused()` — it was refused UNREAD, over a rate
// bound: applied nowhere and numbered never, so sending it again cannot duplicate it. The pacer slows
// down (`starve`) and RE-SENDS it, paced, in its original order: it holds every queued frame back
// until the frames sent after the refused one are answered (none can be recalled), then puts the
// refused frames back at the HEAD of the queue, oldest first. A refused frame whose order against a
// frame sent after it CANNOT be kept — that later frame was relayed, and the two do not commute — is
// dropped (`io.dropped(ref)`), as every rate-refused frame was before: re-sending it would reorder the
// edits. Two frames commute when they are of different cells and neither cell's write resets another
// cell (`io.coupled(ref)`, `reset-on=`). A refused frame of a cell whose later `replace` (relayed, or
// still to be sent) sets its value outright is superseded (`io.superseded(ref)`): the newest value
// wins, as for a queued one — unless its cell's write resets another cell, or (still to be sent) a
// frame of its cell that is re-sent sits between them (S480, #1987 r2 review L1). `io.resend(ref, text)`
// gives the text a re-sent frame goes on the wire with (its `__seen` renewed), or null to drop it.
//   io (optional, S480 r2): dropped(ref), coupled(ref) → bool, resend(ref, text) → text | null
export function channelPacer(limits, io) {
  const lim = limits !== null && typeof limits === "object" ? limits : {};
  const pos = (v, d) => (Number.isSafeInteger(v) && v >= 1 ? v : d);
  const burst = pos(lim.burst, 100);
  const rate = pos(lim.rate, 50) * 0.95;
  const cap = Math.max(1, burst - Math.ceil(burst / 20));
  let tokens = cap;
  let at = io.now();
  let q = [];
  let flight = [];          // sent, unanswered — and refused unread (`retry`), awaiting a re-send
  let held = false;         // a refused frame waits for the frames sent after it to be answered
  let timer = null;
  let open = false;
  const coupled = (f) => typeof io.coupled === "function" && io.coupled(f.ref) === true;
  const commute = (a, b) => a.key !== b.key && !coupled(a) && !coupled(b);
  const supersedes = (later, f) => later.key === f.key && later.op === "replace" && !coupled(f);
  // S480 (#1987 r2 review M-pre, L1), §38.4.3: `f` is superseded only by the NEXT frame of its cell
  // after it (`after`, in send order), and only when that one is a `replace`. A later `replace` with
  // another frame of the cell between them does not supersede `f`: that frame (an `append`, say) was
  // made and checked on the value `f` set, and dropping `f` would have the relay judge it on the value
  // before — refused, and an honest client closed `1008` ("unexplained since __seen").
  const supersededBy = (f, after) => {
    const g = after.find((h) => h.key === f.key);
    return g !== undefined && supersedes(g, f);
  };
  function drop(f, superseded) {
    if (superseded) { if (typeof io.superseded === "function") io.superseded(f.ref); }
    else if (typeof io.dropped === "function") io.dropped(f.ref);
  }
  function pump() {
    timer = null;
    if (!open || held) return;
    const t = io.now();
    if (t > at) tokens = Math.min(cap, tokens + ((t - at) * rate) / 1000);
    at = t;
    while (q.length > 0 && tokens >= 1) {
      tokens -= 1;
      const f = q.shift();
      f.retry = false;
      flight.push(f);
      io.send(f.text, f.ref);
    }
    if (q.length > 0) timer = io.later(pump, Math.max(1, Math.ceil(((1 - tokens) * 1000) / rate)));
  }
  // Every frame sent after the refused ones is answered: re-queue the refused ones, oldest first, at
  // the head of the queue — before every frame queued after them, which none of them was sent after
  function release() {
    if (!held || flight.some((f) => !f.retry)) return;
    const back = [];
    for (let i = 0; i < flight.length; i++) {
      const f = flight[i];
      if (supersededBy(f, flight.slice(i + 1).concat(q))) { drop(f, true); continue; }
      const text = typeof io.resend === "function" ? io.resend(f.ref, f.text) : f.text;
      if (typeof text !== "string") continue;            // the caller dropped it
      f.text = text;
      back.push(f);
    }
    flight = [];
    held = false;
    q = back.concat(q);
    if (timer === null) pump();
  }
  return {
    // A new connection (idempotent while open): a full bucket, then the queue, if any.
    open() {
      if (open) return;
      open = true;
      tokens = cap;
      at = io.now();
      pump();
    },
    // The connection closed: the frames still queued, and the refused ones awaiting a re-send, are
    // dropped (§38.10.4); returns how many.
    close() {
      open = false;
      if (timer !== null) { io.cancel(timer); timer = null; }
      const n = q.length + flight.filter((f) => f.retry).length;
      q = [];
      flight = [];
      held = false;
      return n;
    },
    // S479 (s479-channel-follow), §38.4.3: the relay refused a frame of this connection unread, over a
    // rate bound — "the client SHALL then slow down": its bucket is emptied, so the next frame waits
    // for a token's refill. Frames still queued keep their order. S480 r1 (#1987 review MED-1): a refused
    // frame spends no relay token, so the relay's bucket is at 0 or more when it refuses; an emptied
    // client bucket refilling at 95% of `rate` stays behind the relay's, which refills at `rate`.
    starve() {
      tokens = 0;
      at = io.now();
    },
    // S480 r2: the oldest unanswered frame was answered — relayed (`applied`), or refused by the relay's
    // fold. Returns its `ref` (undefined: no frame was unanswered). A relayed one is checked against
    // each refused frame sent before it: superseded, dropped (their order cannot be kept), or kept.
    answered(applied) {
      const i = flight.findIndex((f) => !f.retry);
      if (i < 0) return undefined;
      const f = flight[i];
      flight.splice(i, 1);
      if (applied) {
        flight = flight.filter((r) => {
          if (!r.retry) return true;
          if (supersedes(f, r)) { drop(r, true); return false; }
          if (!commute(r, f)) { drop(r, false); return false; }
          return true;
        });
      }
      release();
      return f.ref;
    },
    // S480 r2: the oldest unanswered frame was refused unread, over a rate bound: slow down, and re-send
    // it (above). Returns its `ref` (undefined: no frame was unanswered).
    refused() {
      tokens = 0;
      at = io.now();
      const f = flight.find((g) => !g.retry);
      if (f === undefined) return undefined;
      f.retry = true;
      held = true;
      release();
      return f.ref;
    },
    // Queue one frame of the cell `key` (op `op`); false (not queued) while the connection is not open.
    push(key, op, text, ref) {
      if (!open) return false;
      // a queued `replace` of the cell is superseded only when it is the LAST queued frame of the cell
      // (S480, #1987 r2 review M-pre: no frame of the cell between it and this one, above)
      if (op === "replace") {
        let j = q.length - 1;
        while (j >= 0 && q[j].key !== key) j--;
        if (j >= 0 && q[j].op === "replace") {
          const [f] = q.splice(j, 1);
          if (typeof io.superseded === "function") io.superseded(f.ref);
        }
      }
      q.push({ key, op, text, ref, retry: false });
      if (timer === null) pump();
      return true;
    },
    pending() { return q.length; },
    isOpen() { return open; },
  };
}

// The UTF-8 byte length of `s` is over `max` (a channel frame's size bound, §38.4.3).
function utf8Over(s, max) {
  if (s.length > max) return true;
  if (s.length * 3 <= max) return false;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3;
    if (n > max) return true;
  }
  return false;
}

/**
 * §38.4.2 receiver check (3): the edit `op` / `val` applied to `cur`, the cell's CURRENT value —
 * `{ next }`, or why it is refused (a string). `c`: `{ key, table, edges }` (a channel cell's desc).
 * Pure: it writes nothing. The client applies a relayed frame, and re-applies a pending edit, through
 * it. The JUDGEMENT is `channelJudge`, which the relay's fold (server-runtime.js `channelSockets`,
 * S479 — §38.4.2 "The relay's fold") calls too, so the relay refuses exactly what a receiver would;
 * the relay then applies an edit it accepts to its own fold IN PLACE (it owns that value — s479 fix
 * r1, MED-1: a copy per frame made one frame cost the tape's length), where a client builds the new
 * value here.
 */
export function channelStep(c, cur, op, val) {
  const why = channelJudge(c, cur, op, val);
  if (why !== null) return why;
  if (op === "replace" || op === "transition") return { next: val };
  if (op === "append") return { next: [...cur, val] };
  if (op === "prepend") return { next: [val, ...cur] };
  const left = Math.max(0, cur.length - val);
  return { next: op === "pop" ? cur.slice(0, left) : cur.slice(cur.length - left) };
}

// A tape the relay's fold holds in place of an array (server-runtime.js `FoldTape`) says so with this
// key and has a `length` — all `channelJudge` reads of a tape.
export const CHANNEL_TAPE = Symbol.for("scrml.channel.foldTape");

/**
 * §38.4.2 receiver check (3), the judgement alone: null when the edit `op` / `val` applies to `cur`
 * (the cell's CURRENT value), else why it is refused (a string). It never writes `cur`; of a tape it
 * reads only that it is one and its length. The client (through `channelStep`) and the relay's fold
 * both judge by it — one rule, never two copies.
 */
export function channelJudge(c, cur, op, val) {
  if (op === "replace") return null;
  if (op === "transition") {
    try { checkEdge({ peek: () => cur }, c.edges, val); } catch (e) { return `a \`transition\` of @${c.key} its rule= graph forbids from the current variant (${e && e.message ? e.message : e})`; }
    return null;
  }
  if (!Array.isArray(cur) && !(cur !== null && typeof cur === "object" && cur[CHANNEL_TAPE] === true)) return `an \`${op}\` of @${c.key}, which does not hold a tape`;
  const bound = lengthBound(c.table);
  if (bound === "fixed") return `an \`${op}\` of @${c.key}, a fixed-length tape (no edit may change its length, §66.12.1–§66.12.2)`;
  if (op === "append" || op === "prepend") {
    if (bound !== null && cur.length + 1 > bound[1]) return `an \`${op}\` of @${c.key} past its length bound ${bound[0]}..=${bound[1]}`;
    return null;
  }
  if (op !== "pop" && op !== "shift") return `an op \`${op}\` the bootstrap does not apply`;
  const left = Math.max(0, cur.length - val);
  if (bound !== null && left < bound[0]) return `a \`${op}\` of @${c.key} below its length bound ${bound[0]}..=${bound[1]}`;
  return null;
}

// S479 (s479-channel-follow) — ruling:user-voice-scrml.md S479 "⭐ RULED — the rest of S478 hand-off
// §3.B", item 5: "`reconnect=` is the initial delay, doubling with ±20% jitter to a 30 s cap; reset on
// open; `0` disables. A fixed delay reconnects every client in lockstep after a server restart." §38.7:
// the wait before reconnect attempt `n` (0 for the first after an open) is `min(cap, initial × 2^n)`,
// scaled by a factor drawn uniformly from [0.8, 1.2]; the cap is 30 s, or the initial delay itself when
// that is larger (an author's own delay is never shortened). `random` returns a number in [0, 1).
export const CHANNEL_RECONNECT_CAP_MS = 30000;
export function channelBackoff(initial, n, random) {
  const cap = Math.max(CHANNEL_RECONNECT_CAP_MS, initial);
  const base = Math.min(cap, initial * 2 ** Math.min(n, 30));
  return Math.round(base * (0.8 + 0.4 * random()));
}

// The relay's own close codes (§38.4.3) — a close the author must see, not a silent drop.
const RELAY_CLOSES = new Map([
  [1003, "it sent a binary frame"],
  [1007, "it sent a frame that is not JSON, or does not decode"],
  [1008, "it sent a frame the relay refused, or frames past the channel's rate limit"],
  [1009, "it sent a frame over the channel's frame-size bound"],
]);

export function channel(scope, desc) {
  requireScope(scope, "a channel");
  const g = globalThis;
  const byKey = new Map();
  for (const c of desc.cells) byKey.set(c.key, c);
  // the initial values (a subscribing client starts from them, §38.4.2 "The frame log") and the
  // confirmed value of each cell; the pending edits ({ c, op, val, wire }), oldest first
  const init = new Map();
  for (const c of desc.cells) init.set(c, c.cell.peek());
  const conf = new Map(init);
  const chanCells = new Set(desc.cells.map((c) => c.cell));
  let pending = [];
  // S480 r2: the `__seen` of this connection's last frame the relay READ (relayed, or refused by its
  // fold) — the relay's floor for the next one's (§38.4.2 "The frame")
  let floorSeen = 0;
  // #1941 fix r1 (MED-1): the edits made on a connection that is open (or opening) but whose replay
  // has not been applied — §38.4.2 "held"; re-applied on the rebuilt value and sent after the replay
  let held = [];
  let seq = 0;              // the last sequence number applied on this connection
  let live = false;         // this connection's replay has been applied
  let stopped = false;      // a truncated frame log: the channel is out of sync for good
  let ws = null;
  let timer = null;
  let retries = 0;          // reconnect attempts since the last open (§38.7 backoff)
  let disposed = false;
  let applying = false;
  let windowFrom = 0;
  let reports = 0;
  const report = (msg) => { try { g.console.error(`scrml channel ${desc.name}: ${msg}`); } catch { /* nothing to do */ } };
  const warn = report;
  function refused(why) {
    const now = Date.now();
    if (now - windowFrom >= CHANNEL_REPORT_WINDOW_MS) { windowFrom = now; reports = 0; }
    reports += 1;
    if (reports <= CHANNEL_REPORTS) report(`refused ${why}`);
    else if (reports === CHANNEL_REPORTS + 1) report(`further refused frames are not reported for ${CHANNEL_REPORT_WINDOW_MS / 1000} s (at most ${CHANNEL_REPORTS} per window, §38.4.2)`);
  }
  const hook = (f) => { if (typeof f === "function") batch(() => { f(); }); };
  const url = () => (g.location.protocol === "https:" ? "wss:" : "ws:") + "//" + g.location.host + "/_scrml_ws/" + desc.name;
  const has = (c, op) => Array.isArray(c.ops) && c.ops.includes(op);
  const lim = desc.limits !== null && typeof desc.limits === "object" ? desc.limits : {};
  const maxFrame = Number.isSafeInteger(lim.maxFrame) && lim.maxFrame >= 1 ? lim.maxFrame : 65536;
  const pacer = channelPacer(desc.limits, {
    now: () => (g.performance !== undefined && typeof g.performance.now === "function" ? g.performance.now() : Date.now()),
    later: (f, ms) => g.setTimeout(f, ms),
    cancel: (h) => g.clearTimeout(h),
    send: (text, p) => {
      if (ws === null || ws.readyState !== 1) return;
      ws.send(text);
      if (p !== undefined && p !== null) { p.sent = true; p.retry = false; }
    },
    // a queued `replace` superseded by a later one is never sent: it stops being pending (#1941 × #1942)
    superseded: (p) => { const i = pending.indexOf(p); if (i >= 0) pending.splice(i, 1); },
    // S480 r2 (#1987 review NEW-2), §38.4.3: a frame refused unread over a rate bound is re-sent, paced
    // (`channelPacer`). One whose order against a later relayed edit cannot be kept is dropped: it stops
    // being pending (the caller's received unit rebases the shown value) and is reported.
    dropped: (p) => {
      const i = pending.indexOf(p);
      if (i >= 0) pending.splice(i, 1);
      refused(`this client's own edit of @${p.c.key}, unread by the relay (over a rate bound, §38.4.3) — not re-sent: a later edit it does not commute with was relayed first`);
    },
    // a write of the cell resets another cell (`reset-on=`): its edits do not commute with others
    coupled: (p) => p !== undefined && p !== null && [...p.c.cell.observers].some((o) => o instanceof ResetOn),
    // a re-sent frame's `__seen`: at least the relay's floor for this connection (the `__seen` of its
    // last frame the relay read, `floorSeen`) and at most that of every frame queued after it
    resend: (p, text) => (p === undefined || p === null ? text : frameText(p, Math.max(p.seen, floorSeen))),
  });

  // A relayed frame's shape (§38.4.2 "The relayed frame"): exactly __type, __seq, __key, __op,
  // __val, __own. Anything else is a broken stream, not a refusal.
  function relayedShape(v) {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
    const keys = Object.keys(v);
    if (keys.length !== 6) return false;
    for (const k of ["__type", "__seq", "__key", "__op", "__val", "__own"]) if (!hasOwn(v, k)) return false;
    return v.__type === "__sync" && Number.isSafeInteger(v.__seq) && v.__seq >= 1 && typeof v.__key === "string" && typeof v.__op === "string" && typeof v.__own === "boolean";
  }

  // Receiver checks (1) and (2) of §38.4.2, and the fixed-length check the type alone decides:
  // the edit { c, op, val } or why it is refused.
  function edit(v) {
    const c = byKey.get(v.__key);
    if (c === undefined) return "a __sync for a cell this channel does not declare";
    const op = v.__op;
    if (!has(c, op)) return `a \`${op}\` of @${c.key}, whose grants do not admit it`;
    if (op === "replace" || op === "transition") {
      const d = decode(c.table, v.__val, { canonicalOnly: true });
      if (!d.ok) return `a \`${op}\` of @${c.key} whose value does not decode`;
      if (op === "transition" && (c.edges === null || c.edges === undefined)) return `a \`transition\` of @${c.key}, which has no rule= graph`;
      return { c, op, val: d.value };
    }
    if (CHANNEL_EDITS.has(op)) {
      const et = elemTable(c.table);
      if (et === null) return `an \`${op}\` of @${c.key}, which does not hold a tape`;
      if (lengthBound(c.table) === "fixed") return `an \`${op}\` of @${c.key}, a fixed-length tape (no edit may change its length, §66.12.1–§66.12.2)`;
      if (op === "append" || op === "prepend") {
        const d = decode(et, v.__val, { canonicalOnly: true });
        if (!d.ok) return `an \`${op}\` of @${c.key} whose element does not decode`;
        return { c, op, val: d.value };
      }
      const n = v.__val;
      if (!Number.isSafeInteger(n) || n < 1) return `a \`${op}\` of @${c.key} whose count is not an int ≥ 1`;
      return { c, op, val: n };
    }
    return `an op \`${op}\` the bootstrap does not apply`;
  }

  // Receiver check (3): the edit applied to `cur` (the cell's CURRENT value) — { next } or why refused.
  // ONE function with the relay's fold (server-runtime.js `channelSockets`, S479): `channelStep`.
  const step = channelStep;

  // One relayed frame applied to the cells (which hold the confirmed value), as the local write of
  // the same edit would be — `Cell.set`, so the writes it causes (`reset-on=`) are made too.
  function apply(v, own) {
    const e = edit(v);
    const why = typeof e === "string" ? e : step(e.c, e.c.cell.peek(), e.op, e.val);
    if (typeof why === "string") { refused(own ? `this client's own edit (a concurrent edit came first in relay order): ${why}` : why); return; }
    try { e.c.cell.set(why.next); } catch (err) { report(`applying a \`${e.op}\` of @${e.c.key} failed: ${err && err.message ? err.message : err}`); }
  }

  // Two values of a channel cell are the same value (its §57 wire form; a rebuilt tape is a new array)
  function same(c, a, b) {
    if (Object.is(a, b)) return true;
    const ea = encode(c.table, a);
    const eb = encode(c.table, b);
    return ea.ok && eb.ok && JSON.stringify(ea.wire) === JSON.stringify(eb.wire);
  }

  // One received unit (a relayed frame, or a whole replay): restore the confirmed value, apply,
  // record the new confirmed value, re-apply the pending edits — one batch, `applying` held across it.
  //   #1941 fix r1 (MED-2), §38.4.2: "A `reset-on=` reset of a cell that is NOT a channel cell is
  //   made when, and only when, the value the client SHOWS of a trigger changes across the received unit" —
  //   such a reset is not made inside the unit (`resetGuard`); at its end, one whose trigger's shown
  //   value changed is made (still `applying`, so a channel write it causes stays local). A
  //   channel cell's own reset is made as the frame is applied, as before: that keeps it convergent.
  //   `after` (the replay's held edits) runs in the same batch, after the pending edits.
  function unit(fn, after) {
    const shown = new Map();
    for (const c of desc.cells) shown.set(c.cell, c);
    const before = new Map();
    for (const c of desc.cells) before.set(c, c.cell.peek());
    const guard = { cells: chanCells, deferred: new Set() };
    applying = true;
    try {
      batch(() => {
        const outer = resetGuard;
        resetGuard = guard;
        try {
          for (const c of desc.cells) rebaseSet(c.cell, conf.get(c));
          fn();
          for (const c of desc.cells) conf.set(c, c.cell.peek());
          for (const p of pending) {
            const s = step(p.c, p.c.cell.peek(), p.op, p.val);
            if (typeof s !== "string") rebaseSet(p.c.cell, s.next);
          }
          if (after !== undefined) after();
        } finally {
          resetGuard = outer;
        }
        for (const r of guard.deferred) {
          if (r.disposed) continue;
          if (r.triggers.some((t) => { const c = shown.get(t); return c !== undefined && !same(c, before.get(c), t.peek()); })) pendingResets.add(r);
        }
        drainResets();
      });
    } finally {
      applying = false;
    }
  }

  // A replay's `__base` (S479, §38.4.2 "The frame log"): `{ seq, cells }` (`cells` null: the initial
  // values; else a Map from each channel cell to its decoded value), or why the stream is broken.
  function baseOf(b, last) {
    if (b === null) return { seq: 0, cells: null };
    if (typeof b !== "object" || Array.isArray(b) || Object.keys(b).length !== 2 || !Number.isSafeInteger(b.__seq) || b.__seq < 0 || b.__seq > last
      || b.__cells === null || typeof b.__cells !== "object" || Array.isArray(b.__cells)) {
      return "a replay whose __base is not {__seq, __cells}";
    }
    if (Object.keys(b.__cells).length !== desc.cells.length) return "a replay whose __base does not hold exactly the channel's cells";
    const cells = new Map();
    for (const c of desc.cells) {
      if (!hasOwn(b.__cells, c.key)) return `a replay whose __base has no @${c.key}`;
      const d = decode(c.table, b.__cells[c.key], { canonicalOnly: true });
      if (!d.ok) return `a replay whose __base value of @${c.key} does not decode`;
      cells.set(c, d.value);
    }
    return { seq: b.__seq, cells };
  }

  // S480 r2: the oldest pending edit the relay has not answered — the first SENT one that is not a
  // rate-refused edit awaiting its re-send (`retry`); pending order is send order. -1: none.
  function answerable() {
    return pending.findIndex((p) => p.sent === true && p.retry !== true);
  }

  // A message on connection `s`: "" or why the stream is broken.
  function receive(text) {
    if (typeof text !== "string") return "a non-text frame";
    let v;
    try { v = JSON.parse(text); } catch { return "a frame that is not JSON"; }
    if (!live) {
      if (v === null || typeof v !== "object" || Array.isArray(v) || Object.keys(v).length !== 5 || v.__type !== "__replay"
        || typeof v.__complete !== "boolean" || !Number.isSafeInteger(v.__seq) || v.__seq < 0 || !hasOwn(v, "__base") || !Array.isArray(v.__frames)) {
        return "a connection whose first frame is not the relay's __replay {__type, __complete, __seq, __base, __frames}";
      }
      if (!v.__complete) return "TRUNCATED";
      // S479 (s479-channel-relay-fold), §38.4.2 "The frame log": `__base` is null (the log starts at
      // sequence 0, from the cells' initial values) or the relay's COMPACTION BASE — `{ __seq: k,
      // __cells: { <key>: <value> } }`, the relay's fold after frame k, one value per channel cell, each
      // decoded canonically against its type — and the frames are then numbered k + 1 to `__seq`.
      const start = baseOf(v.__base, v.__seq);
      if (typeof start === "string") return start;
      const frames = v.__frames;
      if (frames.length !== v.__seq - start.seq) return `a replay of ${frames.length} frames from ${start.seq} that says it ends at ${v.__seq}`;
      for (let i = 0; i < frames.length; i++) {
        const n = start.seq + i + 1;
        if (!relayedShape(frames[i]) || frames[i].__seq !== n || frames[i].__own !== false) return `a replay whose frame ${i + 1} is not the relayed frame numbered ${n}`;
      }
      live = true;
      seq = v.__seq;
      pending = [];
      for (const c of desc.cells) conf.set(c, start.cells === null ? init.get(c) : start.cells.get(c));
      const early = held;
      held = [];
      unit(() => { for (const f of frames) apply(f, false); }, () => resendHeld(early));
      return "REPLAYED";
    }
    // S479 (s479-channel-relay-fold), §38.4.2 "The relay's fold": `{ __type: "__refused", __key, __op,
    // __val, __why }` — the relay's fold refused this client's OLDEST pending edit (a concurrent edit
    // came first in relay order): it was relayed to no one and took no sequence number. It stops being
    // pending and is not shown (as its own copy refused at the confirmed value would be), and it is
    // reported. It must name that oldest pending edit, or the stream is broken.
    if (v !== null && typeof v === "object" && !Array.isArray(v) && v.__type === "__refused") {
      // S479 (s479-channel-follow), §38.4.3 "Over a rate bound": `{ __type: "__refused", __why }` — the
      // relay refused this connection's next frame UNREAD (over its connection's or its address's frame
      // bucket): relayed to no one, numbered never. The relay reads frames in the order they were sent,
      // so it is this client's oldest pending edit, which must have been SENT (a queued one has not
      // reached the relay). S480 r2 (#1987 review NEW-2): it was applied nowhere and numbered never, so
      // the client RE-SENDS it, paced — it stays pending and shown, the client slows down, and the pacer
      // sends it again in its original order (`channelPacer` `refused`) — so an honest client loses no
      // edit to a rate bound. Only this 2-key shape is a rate refusal (a fold refusal names its edit).
      if (Object.keys(v).length === 2 && typeof v.__why === "string") {
        const i = answerable();
        if (i < 0) return "a rate __refused with no sent pending edit";
        const p = pending[i];
        p.retry = true;
        let ref;
        unit(() => { ref = pacer.refused(); });
        if (ref !== p) return "a rate __refused the pacer cannot match to its oldest unanswered frame";
        refused(`this client's own edit, unread by the relay (over a rate bound, §38.4.3) — re-sent, paced: ${v.__why.slice(0, 300)}`);
        return "";
      }
      if (Object.keys(v).length !== 5 || !hasOwn(v, "__key") || !hasOwn(v, "__op") || !hasOwn(v, "__val") || typeof v.__why !== "string") {
        return "a __refused that is not exactly {__type, __key, __op, __val, __why} or {__type, __why}";
      }
      const p = pending[answerable()];
      if (p === undefined || p.c.key !== v.__key || p.op !== v.__op || JSON.stringify(p.wire) !== JSON.stringify(v.__val)) {
        return "a __refused that is not this client's oldest pending edit";
      }
      floorSeen = p.seen;
      unit(() => { pending.splice(pending.indexOf(p), 1); pacer.answered(false); });
      refused(`this client's own edit, by the relay (a concurrent edit came first in relay order): ${v.__why.slice(0, 300)}`);
      return "";
    }
    if (!relayedShape(v)) return "a frame that is not exactly {__type, __seq, __key, __op, __val, __own}";
    if (v.__seq !== seq + 1) return `a frame numbered ${v.__seq} after ${seq}`;
    let mine;
    if (v.__own) {
      mine = pending[answerable()];
      if (mine === undefined || mine.c.key !== v.__key || mine.op !== v.__op || JSON.stringify(mine.wire) !== JSON.stringify(v.__val)) {
        return "an own frame that is not this client's oldest pending edit";
      }
      floorSeen = mine.seen;
    }
    seq = v.__seq;
    unit(() => {
      if (mine !== undefined) pending.splice(pending.indexOf(mine), 1);
      apply(v, v.__own);
      // S480 r2: the refused frames sent before it are checked against it (superseded, dropped, kept)
      if (mine !== undefined) pacer.answered(true);
    });
    return "";
  }

  // The op sink of one cell: the frame of one committed write (§38.4.2), or nothing.
  // #1937 fix r1 (MED-1): the op sent is the grant the write used — never a relabel. A `rule=`
  // field's write is a `transition` when `rt.transition` made it (tagged) or when it follows an
  // edge of the graph from the value it replaced (a statically checked move, printed as a plain
  // set); any other write of it (not a move) is reported and not sent, because every receiver
  // would refuse it (§66.13.2) and the clients would diverge silently.
  function isMove(c, prev, to) {
    if (c.edges === null || c.edges === undefined) return false;
    const probe = { peek: () => prev };
    try { checkEdge(probe, c.edges, to); return true; } catch { return false; }
  }
  function sink(c) {
    return (o, prev) => {
      if (applying || stopped) return;                 // a write made while applying a received unit is not sent
      let op;
      let val;
      if (has(c, "transition")) {
        if (!(o !== null && o.k === "transition") && !isMove(c, prev, c.cell.value)) {
          warn(`@${c.key} — a write that is not a move along its rule= graph (§66.13.2) — not synced`);
          return;
        }
        op = "transition";
      } else if (o !== null && has(c, o.k)) {
        op = o.k;
        val = o.val;
      } else if (has(c, "replace")) {
        op = "replace";
      } else {
        warn(`@${c.key} — a write this cell does not sync as an op (${o === null ? "a whole-value write" : o.k}) — not synced`);
        return;
      }
      if ((op === "pop" || op === "shift") && val === 0) return;   // nothing was removed
      let wire;
      if (op === "replace" || op === "transition") {
        val = c.cell.value;
        const e = encode(c.table, val);
        if (!e.ok) { warn(`@${c.key} does not encode — not synced`); return; }
        wire = e.wire;
      } else if (op === "append" || op === "prepend") {
        const et = elemTable(c.table);
        const e = et === null ? { ok: false } : encode(et, val);
        if (!e.ok) { warn(`@${c.key}'s element does not encode — not synced`); return; }
        wire = e.wire;
      } else {
        wire = val;
      }
      // §38.10.4: not sent while the connection is closed. #1941 fix r1 (MED-1): on a connection
      // that is open (or opening) but whose replay is not applied yet, the edit is HELD (§38.4.2) —
      // sending it now would number it after the log the replay is about to rebuild from
      if (ws === null || ws.readyState > 1) return;
      if (!live) { held.push({ c, op, val, wire }); return; }
      send({ c, op, val, wire });
    };
  }

  // The ONE place an edit goes on the wire (the op sink, and the held edits after a replay): it
  // becomes pending and is handed to the pacer (§38.4.3, #1942), which sends it as the bucket
  // allows — so the sink path and `resendHeld` are paced alike. `p.sent` turns true when the pacer
  // puts it on the wire; a queued `replace` a later `replace` of the same cell supersedes is never
  // sent, and its pending entry is removed (`superseded`), so no echo is waited for. Pending order
  // is still send order: the queue is FIFO, and a supersede only removes an entry.
  //   §38.4.3: "A conforming client never sends a frame over the frame-size bound. An edit whose
  //   frame would be over it is not sent; the client reports it" — it is not pending either, so the
  //   next received unit's rebase drops it from the shown value (it never reaches a peer). Returns
  //   whether the edit was queued.
  //   S479 (s479-channel-follow), §38.4.2 "The frame": `__seen` is the last sequence number this client
  //   had applied when it made the edit — `seq` now: an edit is sent (queued) in the step that makes it,
  //   and a held edit in the unit that re-applies it on the replay's value — so the relay can tell
  //   whether any frame it relayed after that could explain a refusal (§38.4.2 "The relay's fold").
  function frameText(p, seen) {
    return JSON.stringify({ __type: "__sync", __key: p.c.key, __op: p.op, __val: p.wire, __seen: seen });
  }
  function send(p) {
    p.seen = seq;
    p.retry = false;
    const text = frameText(p, seq);
    if (utf8Over(text, maxFrame)) { warn(`@${p.c.key} — an edit whose frame is over the channel's ${maxFrame}-byte frame-size bound (§38.4.3) — not synced`); return false; }
    if (!pacer.isOpen()) pacer.open();
    p.sent = false;
    pending.push(p);
    if (!pacer.push(p.c.key, p.op, text, p)) { pending.pop(); return false; }
    return true;
  }

  // §38.4.2 (#1941 fix r1, MED-1): "after the replay is applied, each held edit, in order, is
  // re-applied on top of the rebuilt value, checked as a pending edit is, and sent — it is then
  // pending — in the same unit as the replay … A held edit that no longer passes on the rebuilt
  // value is not shown, not sent, and reported".
  function resendHeld(early) {
    for (const p of early) {
      const s = step(p.c, p.c.cell.peek(), p.op, p.val);
      if (typeof s === "string") { warn(`an edit made before the channel's history arrived no longer applies to it — not sent: ${s}`); continue; }
      if (send(p)) rebaseSet(p.c.cell, s.next);
    }
  }

  function connect() {
    timer = null;
    if (disposed || stopped) return;
    const s = new g.WebSocket(url());
    ws = s;
    live = false;
    seq = 0;
    floorSeen = 0;
    let ok = true;
    held = [];
    // §38.4.3 (#1942): the pacer opens with the connection (a full bucket, as the relay's is). No
    // frame is pushed to it before the replay is applied (the edits until then are HELD, §38.4.2).
    s.onopen = () => {
      if (ws !== s) return;
      retries = 0;                                      // §38.7: the backoff is reset on open
      pacer.open();
    };
    // #1941 fix r1 (MED-1), §38.10.2: "the handler SHALL run when the connection's replay message
    // has been applied … a connection given an incomplete replay … runs `onclient:error`, not
    // `onclient:open`" — so a channel write it makes is sent, not undone by the replay
    s.onmessage = (ev) => {
      if (ws !== s || !ok) return;
      const why = receive(ev.data);
      if (why === "REPLAYED") { hook(desc.open); return; }
      if (why === "") return;
      ok = false;
      if (why === "TRUNCATED") {
        stopped = true;
        report("the relay's frame log for this channel was truncated at its bound (§38.4.2), so this client cannot rebuild the channel's state — sync of the channel is stopped; its cells keep the values they had");
        hook(desc.error);
      } else {
        report(`closed the connection: ${why}`);
      }
      try { s.close(); } catch { /* already closing */ }
    };
    s.onerror = () => { if (ws === s) hook(desc.error); };
    s.onclose = (ev) => {
      if (ws !== s) return;
      ws = null;
      live = false;
      held = [];                                        // never sent: dropped, as a write while closed is
      // §38.4.3 (#1942): the frames still queued are dropped (§38.10.4) — and so are their pending
      // entries (#1941): a frame never sent has no relayed copy to wait for. The sent ones stay
      // pending until the replay of the next connection drops them (§38.4.2 "The frame log").
      const dropped = pacer.close();
      // S480 r2: a rate-refused edit awaiting its re-send was applied nowhere: dropped with the queue
      pending = pending.filter((p) => p.sent === true && p.retry !== true);
      // S478 fix r1 (MED-3a): a relay close (§38.4.3) is reported, naming why — never silent
      const code = ev !== null && typeof ev === "object" ? ev.code : undefined;
      if (RELAY_CLOSES.has(code)) {
        const reason = typeof ev.reason === "string" && ev.reason !== "" ? ` ("${ev.reason}")` : "";
        warn(`the relay closed this client's connection with ${code}${reason}: ${RELAY_CLOSES.get(code)} (§38.4.3) — an edit it refused was not relayed to the other clients`);
      }
      if (dropped > 0) warn(`${dropped} edit${dropped === 1 ? "" : "s"} not yet sent were dropped when the connection closed (§38.10.4: sync is suspended while it is closed; an edit refused over a rate bound and awaiting its re-send counts as not yet sent)`);
      hook(desc.close);
      // §38.7 (S479 ruled §3.B item 5): `reconnect=` is the INITIAL delay; each attempt with no open
      // between doubles it, ±20% jitter, up to the 30 s cap (`channelBackoff`); `0` disables
      if (!disposed && !stopped && desc.reconnect > 0) timer = g.setTimeout(connect, channelBackoff(desc.reconnect, retries++, () => g.Math.random()));
    };
  }
  for (const c of desc.cells) c.cell.sync = sink(c);
  scope.own(() => {
    disposed = true;
    pacer.close();
    for (const c of desc.cells) c.cell.sync = null;
    if (timer !== null) g.clearTimeout(timer);
    const s = ws;
    ws = null;
    if (s !== null) { try { s.close(); } catch { /* already closing */ } }
  });
  connect();
}
