// request.runtime.test.js — s475: the request machine of the slice runtime
// (`rt.requestOn`; Core View.Request — SPEC §6.7.7 `<request>`, §13.9.2 a
// pending cell "means exactly a plain cell initialized to `not`, plus a
// `<request>`"), exercised directly with loads the test settles by hand.
// Each test names the runtime mutation that turns it RED.

import { describe, test, expect } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import * as rt from "./runtime/runtime.js";

if (!globalThis.document) GlobalRegistrator.register();

const tick = () => new Promise((r) => setTimeout(r, 0));

/** The full `<#id>` signal set (r1, F3: all four or none). */
function sigs(init = {}) {
  return {
    loading: rt.cell(init.loading ?? false),
    data: rt.cell(init.data ?? null),
    error: rt.cell(init.error ?? null),
    stale: rt.cell(init.stale ?? false),
  };
}

/** A promise the test settles by hand. */
function held() {
  let resolve, reject;
  const p = new Promise((a, b) => { resolve = a; reject = b; });
  return { p, resolve, reject };
}

/**
 * A request whose k-th run waits on `hosts[k]` and writes the settled value
 * to `target` — the shape print.scrml requestJs emits:
 * `(task$) => ({ on: <load>, then: (x) => { <the one Write> } })`.
 */
function loader(target, hosts, runs) {
  return () => {
    const mine = runs.length;
    runs.push(mine);
    return { on: hosts[mine].p, then: (v) => { target.set(v); } };
  };
}

describe("§6.7.7 mount", () => {
  test("runs the load on mount; the target is written only when it settles", async () => {
    // mutation RED: requestOn not running on mount (mount default false)
    const scope = rt.root.child();
    const users = rt.cell(null);                        // a pending cell: `not` until the load settles
    const runs = [];
    const hosts = [held()];
    rt.requestOn(scope, users, [], loader(users, hosts, runs));
    expect(runs).toEqual([0]);
    expect(users.peek()).toBe(null);                     // nothing written while in flight
    hosts[0].resolve(["ann"]);
    await tick();
    expect(users.peek()).toEqual(["ann"]);
    scope.dispose();
  });

  test("`mount: false` (§6.7.7.3 a provably-writing request) does not run on mount; a dependency change runs it", async () => {
    // mutation RED: ignoring opts.mount
    const scope = rt.root.child();
    const dep = rt.cell(0);
    const target = rt.cell(null);
    const runs = [];
    const hosts = [held()];
    rt.requestOn(scope, target, [dep], loader(target, hosts, runs), { mount: false });
    expect(runs).toEqual([]);
    dep.set(1);
    expect(runs).toEqual([0]);
    scope.dispose();
  });

  test("signals on mount: loading true, error `not`, stale false on first load; settle → loading/stale false, data = value", async () => {
    // mutation RED: settle() not clearing loading
    const scope = rt.root.child();
    const target = rt.cell(null);
    const state = sigs({ error: "old", stale: true });
    const { loading, data, error, stale } = state;
    const hosts = [held()];
    rt.requestOn(scope, target, [], loader(target, hosts, []), { state });
    expect([loading.peek(), error.peek(), stale.peek()]).toEqual([true, null, false]);
    hosts[0].resolve(7);
    await tick();
    expect([loading.peek(), data.peek(), error.peek(), stale.peek(), target.peek()]).toEqual([false, 7, null, false, 7]);
    scope.dispose();
  });
});

describe("§6.7.7 EC-2 supersede — the newest run wins", () => {
  test("a dependency change while a load is in flight: the older result is dropped, even when it settles last", async () => {
    // mutation RED: run() not cancelling the earlier tasks
    const scope = rt.root.child();
    const dep = rt.cell(0);
    const target = rt.cell(null);
    const runs = [];
    const hosts = [held(), held()];
    rt.requestOn(scope, target, [dep], loader(target, hosts, runs));
    dep.set(1);                                          // run 1 supersedes run 0
    expect(runs).toEqual([0, 1]);
    hosts[1].resolve("new");
    await tick();
    expect(target.peek()).toBe("new");
    hosts[0].resolve("old");                             // the superseded load settles LAST
    await tick();
    expect(target.peek()).toBe("new");                   // and is discarded (sequence guard)
    scope.dispose();
  });

  test("refetch() while loading (EC-4) supersedes the in-flight load", async () => {
    // mutation RED: refetch not going through run() (a second task alongside the first)
    const scope = rt.root.child();
    const target = rt.cell(null);
    const runs = [];
    const hosts = [held(), held()];
    const r = rt.requestOn(scope, target, [], loader(target, hosts, runs));
    r.refetch();
    expect(runs).toEqual([0, 1]);
    hosts[0].resolve("old");
    await tick();
    expect(target.peek()).toBe(null);
    hosts[1].resolve("new");
    await tick();
    expect(target.peek()).toBe("new");
    scope.dispose();
  });
});

describe("§6.7.7 EC-3 teardown — the mounted guard", () => {
  test("a load that settles after the owning scope is torn down writes nothing", async () => {
    // mutation RED: unregister() not cancelling the in-flight tasks
    const scope = rt.root.child();
    const target = rt.cell("kept");
    const state = sigs();
    const { loading } = state;
    const hosts = [held()];
    rt.requestOn(scope, target, [], loader(target, hosts, []), { state });
    expect(rt.stats.requests).toBeGreaterThan(0);
    expect(loading.peek()).toBe(true);
    scope.dispose();
    // s475 r1 (#1781 F3): teardown ends the run — loading / stale go false (§6.7.7 "`<#id>.stale`
    // SHALL be `true` iff … a fetch is in flight"); before r1 they stayed true for good
    expect(loading.peek()).toBe(false);
    expect(state.stale.peek()).toBe(false);
    hosts[0].resolve("late");
    await tick();
    expect(target.peek()).toBe("kept");                  // nothing of the dead run is applied
    expect(state.data.peek()).toBe(null);
    expect(loading.peek()).toBe(false);
  });

  test("teardown unregisters: a later dependency change starts no run", () => {
    // mutation RED: unregister() not removing the observer
    const scope = rt.root.child();
    const dep = rt.cell(0);
    const target = rt.cell(null);
    const runs = [];
    rt.requestOn(scope, target, [dep], loader(target, [held(), held()], runs), { mount: false });
    scope.dispose();
    dep.set(1);
    expect(runs).toEqual([]);
  });
});

describe("§6.7.7 re-execution / §13.9.4 keep-stale", () => {
  test("during a reload the target and data keep their last value; stale is true; the new value lands on settle", async () => {
    // mutation RED: run() clearing the target / data at the start of a run
    const scope = rt.root.child();
    const dep = rt.cell("core");
    const target = rt.cell(null);
    const state = sigs();
    const { data, stale, loading } = state;
    const hosts = [held(), held()];
    rt.requestOn(scope, target, [dep], loader(target, hosts, []), { state });
    hosts[0].resolve(3);
    await tick();
    dep.set("infra");                                    // reload
    expect([target.peek(), data.peek(), stale.peek(), loading.peek()]).toEqual([3, 3, true, true]);
    hosts[1].resolve(5);
    await tick();
    expect([target.peek(), data.peek(), stale.peek(), loading.peek()]).toEqual([5, 5, false, false]);
    scope.dispose();
  });
});

describe("§6.7.7 settled state (failure)", () => {
  test("with its state: a failure keeps the target and data, sets error; the next run resets error (EC-1)", async () => {
    // mutation RED: settle() running `then` on a Failure when the request has its state
    const scope = rt.root.child();
    const dep = rt.cell(0);
    const target = rt.cell(null);
    const state = sigs();
    const { data, error, loading } = state;
    const hosts = [held(), held(), held()];
    rt.requestOn(scope, target, [dep], loader(target, hosts, []), { state });
    hosts[0].resolve(1);
    await tick();
    dep.set(1);
    hosts[1].resolve(rt.failure({ variant: "Unreachable" }));
    await tick();
    expect(target.peek()).toBe(1);
    expect(data.peek()).toBe(1);
    expect(error.peek()).toEqual({ variant: "Unreachable" });
    expect(loading.peek()).toBe(false);
    dep.set(2);                                          // EC-1: a new run clears error, keeps data
    expect([error.peek(), data.peek(), loading.peek()]).toEqual([null, 1, true]);
    scope.dispose();
  });

  test("without state (§13.9.5 a pending cell): the body's own handling runs — `then` sees the failure", async () => {
    // mutation RED: settle() swallowing a Failure when the request has no state
    const scope = rt.root.child();
    const target = rt.cell(4);
    const hosts = [held()];
    rt.requestOn(scope, target, [], () => ({
      on: hosts[0].p,
      then: (v) => { target.set(rt.failed(v) ? null : v); },   // `!{ _ :> not }`: a failed load goes back to `not`
    }));
    hosts[0].resolve(rt.failure({ variant: "Unreachable" }));
    await tick();
    expect(target.peek()).toBe(null);
    scope.dispose();
  });
});

describe("requestOn guards", () => {
  test("the target, the deps and the signals are mutable cells; the scope is live", () => {
    const scope = rt.root.child();
    const d = rt.derived(scope, () => 1);
    const c = rt.cell(0);
    const body = () => ({ on: 1, then: () => {} });
    expect(() => rt.requestOn(scope, d, [], body)).toThrow(/target must be a mutable cell/);
    expect(() => rt.requestOn(scope, c, [d], body)).toThrow(/dependency must be a mutable cell/);
    expect(() => rt.requestOn(scope, c, [], body, { state: { ...sigs(), loading: d } })).toThrow(/`loading` signal must be a mutable cell/);
    // r1 (F3): all four signals or none
    expect(() => rt.requestOn(scope, c, [], body, { state: { loading: rt.cell(false) } })).toThrow(/`data` signal must be a mutable cell \(all four signals, or none\)/);
    const dead = rt.root.child();
    dead.dispose();
    expect(() => rt.requestOn(dead, c, [], body)).toThrow(/live owning scope/);
    scope.dispose();
  });
});

// ---------------------------------------------------------------------------
// s475 r1 — the adversarial review of #1771 (repros A1–A5, A11 from
// ~/.cache/scrml/review/s475-1771/adv.runtime.test.js), each RED on dfeeb6fc5.
// A request that re-triggers itself LIVELOCKS (A1/A2 on dfeeb6fc5): the
// guards below throw at registration, so these never loop on head.
// ---------------------------------------------------------------------------
describe("r1 F1 — a request never re-triggers itself (requestOn refuses it)", () => {
  const body = (t) => () => ({ on: 1, then: (v) => t.set(v) });

  test("A1: the target among the deps is refused", () => {
    const scope = rt.root.child();
    const t = rt.cell(0);
    expect(() => rt.requestOn(scope, t, [t], body(t))).toThrow(/target cannot be one of its dependencies/);
    expect(rt.stats.requests).toBe(0);
    scope.dispose();
  });

  test("A2: a signal among the deps is refused", () => {
    const scope = rt.root.child();
    const t = rt.cell(0);
    const state = sigs();
    expect(() => rt.requestOn(scope, t, [state.loading], body(t), { state })).toThrow(/`loading` signal cannot be one of its dependencies/);
    scope.dispose();
  });

  test("a signal that is the target, and two signals on one cell, are refused", () => {
    const scope = rt.root.child();
    const t = rt.cell(0);
    expect(() => rt.requestOn(scope, t, [], body(t), { state: { ...sigs(), data: t } })).toThrow(/`data` signal cannot be its target/);
    const shared = rt.cell(false);
    expect(() => rt.requestOn(scope, t, [], body(t), { state: { ...sigs(), loading: shared, stale: shared } })).toThrow(/`stale` signal shares its cell/);
    scope.dispose();
  });

  test("`mount: false` with no dependencies can never run — refused", () => {
    const scope = rt.root.child();
    const t = rt.cell(0);
    expect(() => rt.requestOn(scope, t, [], body(t), { mount: false })).toThrow(/can never run/);
    scope.dispose();
  });

  test("requests are counted apart from <effect>s", () => {
    const scope = rt.root.child();
    const before = { ...rt.stats };
    const t = rt.cell(null);
    rt.requestOn(scope, t, [], () => ({ on: held().p, then: (v) => t.set(v) }));
    expect([rt.stats.requests - before.requests, rt.stats.depEffects - before.depEffects]).toEqual([1, 0]);
    scope.dispose();
    expect(rt.stats.requests).toBe(before.requests);
  });
});

describe("r1 F4 — a host error ends the run: loading / stale reset, error untouched, nothing escapes", () => {
  function capture() {
    const errs = [];
    const prev = rt.setHostErrorReporter((e) => errs.push(e));
    return { errs, restore: () => rt.setHostErrorReporter(prev) };
  }

  test("A3: a throwing `then` — loading / stale go false; error stays `not`; the throw is reported", async () => {
    // mutation RED: settle() without its `finally`
    const scope = rt.root.child();
    const t = rt.cell(null);
    const state = sigs({ data: 1 });                     // prior data → stale is true while loading
    const { errs, restore } = capture();
    try {
      rt.requestOn(scope, t, [], () => ({ on: Promise.resolve(1), then: () => { throw new Error("boom"); } }), { state });
      expect([state.loading.peek(), state.stale.peek()]).toEqual([true, true]);
      await tick(); await tick();
      expect([state.loading.peek(), state.stale.peek(), state.error.peek()]).toEqual([false, false, null]);
      expect(errs.map((e) => e.message)).toEqual(["boom"]);
    } finally { restore(); scope.dispose(); }
  });

  test("A4: a load that rejects (a host error, not a failure) — loading / stale go false; error stays `not`", async () => {
    // mutation RED: suspend() not calling the owner's onLiveReject
    const scope = rt.root.child();
    const t = rt.cell(null);
    const state = sigs({ data: 1 });
    const { errs, restore } = capture();
    try {
      rt.requestOn(scope, t, [], () => ({ on: Promise.reject(new Error("x")), then: (v) => t.set(v) }), { state });
      await tick(); await tick();
      expect([state.loading.peek(), state.stale.peek(), state.error.peek(), t.peek()]).toEqual([false, false, null, null]);
      expect(errs.map((e) => e.message)).toEqual(["x"]);
    } finally { restore(); scope.dispose(); }
  });

  test("A4b: a SUPERSEDED run's rejection resets nothing (the newer run owns the signals)", async () => {
    const scope = rt.root.child();
    const dep = rt.cell(0), t = rt.cell(null);
    const state = sigs();
    const hs = [held(), held()];
    let k = 0;
    const { errs, restore } = capture();
    try {
      rt.requestOn(scope, t, [dep], () => { const h = hs[k++]; return { on: h.p, then: (v) => t.set(v) }; }, { state });
      dep.set(1);
      hs[0].reject(new Error("old"));
      await tick();
      expect(state.loading.peek()).toBe(true);
      expect(errs).toEqual([]);
      hs[1].resolve(2);
      await tick();
      expect([state.loading.peek(), t.peek()]).toEqual([false, 2]);
    } finally { restore(); scope.dispose(); }
  });

  test("A5: a body that throws synchronously (a Let initializer) — reported, loading false, and the author's write does not throw", async () => {
    // mutation RED: run() letting the body's throw unwind into drainQueues
    const scope = rt.root.child();
    const t = rt.cell(null), dep = rt.cell(0);
    const state = sigs();
    let bad = false;
    const { errs, restore } = capture();
    try {
      rt.requestOn(scope, t, [dep], () => { if (bad) throw new Error("let init"); return { on: 1, then: (v) => t.set(v) }; }, { state });
      await tick();
      bad = true;
      expect(() => dep.set(1)).not.toThrow();
      expect([state.loading.peek(), state.stale.peek(), state.error.peek()]).toEqual([false, false, null]);
      expect(errs.map((e) => e.message)).toEqual(["let init"]);
      bad = false;
      dep.set(2);                                        // the request still works after a host error
      await tick();
      expect(t.peek()).toBe(1);
    } finally { restore(); scope.dispose(); }
  });
});

describe("r1 F3 — stale is computed from `data` only (§6.7.7 Mount behavior step 4)", () => {
  test("A11: a target already holding a value (initial / optimistic) with no data yet — stale is false", () => {
    // mutation RED: stale computed from the target
    const scope = rt.root.child();
    const t = rt.cell("init");
    const state = sigs();
    rt.requestOn(scope, t, [], () => ({ on: held().p, then: (v) => t.set(v) }), { state });
    expect([state.loading.peek(), state.stale.peek()]).toEqual([true, false]);
    scope.dispose();
  });

  test("A9: an older run settling after a newer one changes nothing", async () => {
    const scope = rt.root.child();
    const dep = rt.cell(0), t = rt.cell(null);
    const state = sigs();
    const hs = [];
    rt.requestOn(scope, t, [dep], () => { const h = held(); hs.push(h); return { on: h.p, then: (v) => t.set(v) }; }, { state });
    dep.set(1);
    hs[1].resolve("new"); await tick();
    hs[0].resolve("old"); await tick();
    expect([t.peek(), state.data.peek(), state.loading.peek(), state.stale.peek()]).toEqual(["new", "new", false, false]);
    scope.dispose();
  });
});

describe("r1 — the rest of the review's runtime repros, on the all-four state", () => {
  test("A10 (EC-1): a failure, then refetch — error clears, data kept, stale true while loading", async () => {
    const scope = rt.root.child();
    const t = rt.cell(null);
    const state = sigs();
    const hs = [];
    const r = rt.requestOn(scope, t, [], () => { const h = held(); hs.push(h); return { on: h.p, then: (v) => t.set(v) }; }, { state });
    hs[0].resolve(1); await tick();
    r.refetch(); hs[1].resolve(rt.failure("Bad")); await tick();
    expect([t.peek(), state.data.peek(), state.error.peek(), state.loading.peek(), state.stale.peek()]).toEqual([1, 1, "Bad", false, false]);
    r.refetch();
    expect([state.error.peek(), state.loading.peek(), state.stale.peek(), state.data.peek()]).toEqual([null, true, true, 1]);
    scope.dispose();
  });

  test("A13: the target's write disposes the request's own scope mid-settle — the settle still completes", async () => {
    const outer = rt.root.child();
    const arm = outer.child();
    const t = rt.cell(null);
    const state = sigs();
    t.observers.add({ markStale() { arm.dispose(); } });
    rt.requestOn(arm, t, [], () => ({ on: Promise.resolve(3), then: (v) => t.set(v) }), { state });
    await tick();
    expect([t.peek(), state.loading.peek(), state.data.peek(), arm.disposed]).toEqual([3, false, 3, true]);
    outer.dispose();
  });

  test("A7: a thousand rapid dependency changes — the newest wins; nothing leaks", async () => {
    const before = rt.stats.requests;
    const scope = rt.root.child();
    const dep = rt.cell(0), t = rt.cell(null);
    const hosts = [];
    rt.requestOn(scope, t, [dep], () => { const h = held(); hosts.push(h); return { on: h.p, then: (v) => t.set(v) }; });
    for (let i = 1; i <= 1000; i++) dep.set(i);
    hosts.forEach((h, i) => h.resolve(i));
    await tick();
    expect(t.peek()).toBe(1000);
    scope.dispose();
    expect([rt.stats.requests, dep.observers.size]).toEqual([before, 0]);
  });
});

// s475 (S5a) — §6.7.7.1 rules 2 / 3 / 4: "a READ request's superseded transport SHALL be aborted. A
// WRITE request's superseded fetch SHALL be discarded … its transport SHALL NOT be aborted"; "An
// aborted fetch SHALL NOT set `<#id>.error`". The load is a real `rt.call` over a stub fetch that
// never answers by itself and records each request's `init.signal` (rejecting on abort, as a
// browser's fetch does).
describe("§6.7.7.1 — abort READS, discard WRITES (rt.call's AbortController ↔ Task.cancel)", () => {
  const route = { path: "/_scrml/call/1", params: [{ defs: [], root: { k: "int" } }], result: { defs: [], root: { k: "int" } }, error: null };
  function stubFetch() {
    const seen = [];
    const prev = globalThis.fetch;
    globalThis.fetch = (url, init) => new Promise((resolve, reject) => {
      const s = { signal: init.signal, answer: (n) => resolve(new Response(JSON.stringify(n), { status: 200 })) };
      seen.push(s);
      init.signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; reject(e); });
    });
    return { seen, restore: () => { globalThis.fetch = prev; } };
  }
  function setup(read) {
    if (globalThis.happyDOM && globalThis.location.protocol === "about:") globalThis.happyDOM.setURL("http://localhost/");
    const scope = rt.root.child();
    const dep = rt.cell(0), t = rt.cell(null), state = sigs();
    const opts = read ? { read: true, state } : { state };
    rt.requestOn(scope, t, [dep], (task) => ({ on: rt.call(route, [dep.peek()], task), then: (v) => t.set(v) }), opts);
    return { scope, dep, t, state };
  }
  const reportedDuring = async (fn) => {
    const reported = [];
    const prev = rt.setHostErrorReporter((e) => reported.push(e));
    try { await fn(); } finally { rt.setHostErrorReporter(prev); }
    return reported;
  };

  test("READ superseded: the older call's signal fires, no error is set; the newer answer lands", async () => {
    // mutation RED: `new Task(this)` in Request.run (the run's task not abortable) — discard-only
    const f = stubFetch();
    try {
      const reported = await reportedDuring(async () => {
        const { scope, dep, t, state } = setup(true);
        await tick();
        expect(f.seen.length).toBe(1);
        dep.set(1);
        await tick();
        expect(f.seen.length).toBe(2);
        expect([f.seen[0].signal.aborted, f.seen[1].signal.aborted]).toEqual([true, false]);
        expect([state.loading.peek(), state.error.peek()]).toEqual([true, null]);
        f.seen[1].answer(7);
        for (let i = 0; i < 10; i++) await tick();
        expect([t.peek(), state.loading.peek(), state.error.peek(), state.data.peek()]).toEqual([7, false, null, 7]);
        scope.dispose();
      });
      expect(reported).toEqual([]);
    } finally { f.restore(); }
  });

  test("READ torn down: the in-flight call's signal fires; loading / stale go false, error stays `not`", async () => {
    // mutation RED: Request.unregister not cancelling (aborting) its tasks
    const f = stubFetch();
    try {
      const { scope, t, state } = setup(true);
      await tick();
      scope.dispose();
      expect(f.seen[0].signal.aborted).toBe(true);
      await tick();
      expect([t.peek(), state.loading.peek(), state.stale.peek(), state.error.peek()]).toEqual([null, false, false, null]);
    } finally { f.restore(); }
  });

  test("WRITE (no `read`): superseded and torn down — never aborted; a late answer is discarded", async () => {
    // mutation RED: making every request's task abortable (`new Task(this, true)`)
    const f = stubFetch();
    try {
      const { scope, dep, t, state } = setup(false);
      await tick();
      dep.set(1);
      await tick();
      expect(f.seen.map((s) => s.signal.aborted)).toEqual([false, false]);
      f.seen[1].answer(2);
      for (let i = 0; i < 10; i++) await tick();
      f.seen[0].answer(1);                         // the superseded transport completes …
      for (let i = 0; i < 10; i++) await tick();
      expect([t.peek(), state.error.peek()]).toEqual([2, null]);   // … and is dropped
      dep.set(2);
      await tick();
      scope.dispose();
      expect(f.seen[2].signal.aborted).toBe(false);
    } finally { f.restore(); }
  });

  test("an effect's / handler's task is never abortable (Task.onAbort is a no-op there)", async () => {
    // only a READ request makes an abortable task; rt.call with no task (a <db> cell load) or an
    // ordinary task keeps its transport
    const f = stubFetch();
    try {
      if (globalThis.happyDOM && globalThis.location.protocol === "about:") globalThis.happyDOM.setURL("http://localhost/");
      const pending = rt.call(route, [1], null);
      await tick();
      expect(f.seen[0].signal.aborted).toBe(false);
      f.seen[0].answer(1);
      expect(await pending).toBe(1);
    } finally { f.restore(); }
  });
});
