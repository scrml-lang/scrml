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
    const loading = rt.cell(false), data = rt.cell(null), error = rt.cell("old"), stale = rt.cell(true);
    const hosts = [held()];
    rt.requestOn(scope, target, [], loader(target, hosts, []), { loading, data, error, stale });
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
    const loading = rt.cell(false);
    const hosts = [held()];
    rt.requestOn(scope, target, [], loader(target, hosts, []), { loading });
    expect(rt.stats.depEffects).toBeGreaterThan(0);
    scope.dispose();
    hosts[0].resolve("late");
    await tick();
    expect(target.peek()).toBe("kept");
    expect(loading.peek()).toBe(true);                   // nothing of the dead run is applied
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
    const data = rt.cell(null), stale = rt.cell(false), loading = rt.cell(false);
    const hosts = [held(), held()];
    rt.requestOn(scope, target, [dep], loader(target, hosts, []), { data, stale, loading });
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
  test("with an error signal: a failure keeps the target and data, sets error; the next run resets error (EC-1)", async () => {
    // mutation RED: settle() running `then` on a Failure when an error signal exists
    const scope = rt.root.child();
    const dep = rt.cell(0);
    const target = rt.cell(null);
    const data = rt.cell(null), error = rt.cell(null), loading = rt.cell(false);
    const hosts = [held(), held(), held()];
    rt.requestOn(scope, target, [dep], loader(target, hosts, []), { data, error, loading });
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

  test("without an error signal (§13.9.5 a pending cell): the body's own handling runs — `then` sees the failure", async () => {
    // mutation RED: settle() swallowing a Failure when no error signal exists
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
    expect(() => rt.requestOn(scope, c, [], body, { loading: d })).toThrow(/`loading` signal must be a mutable cell/);
    const dead = rt.root.child();
    dead.dispose();
    expect(() => rt.requestOn(dead, c, [], body)).toThrow(/live owning scope/);
    scope.dispose();
  });
});
