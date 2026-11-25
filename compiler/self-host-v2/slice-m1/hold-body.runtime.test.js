// hold-body.runtime.test.js — s482 (lane s482-hold-body): the BODY HOLD of the slice runtime (`rt.runBody`).
//
// RULED S482, ruling:user-voice-scrml.md-S482-hold-until-body-ends — Q6 (b): "the runtime holds effect and
// request runs triggered during the body, running them after the body in trigger order" (owner: "yes, the
// runtime holds them"). SPEC §7.6 R5. Exercised directly: each test names the runtime mutation that turns it RED.

import { describe, test, expect } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import * as rt from "./runtime/runtime.js";

if (!globalThis.document) GlobalRegistrator.register();

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("§7.6 R5 — effect and request runs triggered during the body are held until it ends", () => {
  test("an effect whose dependency the body writes runs after the body, not at the write", () => {
    // mutation RED: drainQueues taking from effectQueue while bodyHold > 0
    const scope = rt.root.child();
    const a = rt.cell(0);
    const log = [];
    rt.runBody(() => {
      rt.effectOn(scope, [a], () => { log.push("effect"); });
      rt.batch(() => a.set(1));
      log.push("after-write");
    });
    expect(log).toEqual(["after-write", "effect"]);
    scope.dispose();
  });

  test("trigger order; an effect triggered twice runs once, at its first trigger's position", () => {
    // mutation RED: running held effects in registration order, or once per trigger
    const scope = rt.root.child();
    const a = rt.cell(0), b = rt.cell(0), c = rt.cell(0);
    const log = [];
    rt.runBody(() => {
      rt.effectOn(scope, [a], () => { log.push("a"); });
      rt.effectOn(scope, [b], () => { log.push("b"); });
      rt.effectOn(scope, [c], () => { log.push("c"); });
      c.set(1); a.set(1); b.set(1); c.set(2);
      expect(log).toEqual([]);
    });
    expect(log).toEqual(["c", "a", "b"]);
    scope.dispose();
  });

  test("a request's mount run is held, and runs in trigger order among the effects", async () => {
    // mutation RED: requestOn running its load where it stands (no hold)
    const scope = rt.root.child();
    const a = rt.cell(0), m = rt.cell(0);
    const log = [];
    rt.runBody(() => {
      rt.effectOn(scope, [a], () => { log.push("E"); });
      rt.requestOn(scope, m, [], () => { log.push("R"); return { on: 7, then: (v) => m.set(v) }; });
      a.set(1);
      expect(log).toEqual([]);
    });
    expect(log).toEqual(["R", "E"]);
    await tick();
    expect(m.peek()).toBe(7);
    scope.dispose();
  });

  test("after the body nothing is held: a write runs its effect at once", () => {
    // mutation RED: bodyHold left raised after runBody returns
    const scope = rt.root.child();
    const a = rt.cell(0);
    const log = [];
    rt.runBody(() => { rt.effectOn(scope, [a], () => { log.push(a.peek()); }); });
    a.set(3);
    expect(log).toEqual([3]);
    scope.dispose();
  });

  test("render effects still run during the body (a display shows its value where it stands)", () => {
    const scope = rt.root.child();
    const a = rt.cell(1);
    const seen = [];
    rt.runBody(() => {
      rt.effect(scope, () => { seen.push(a.get()); });
      a.set(2);
      expect(seen).toEqual([1, 2]);
    });
    scope.dispose();
  });

  test("a body that traps still releases the hold: the held runs run, the trap is the one thrown", () => {
    // mutation RED: no `finally` (the hold stays raised and every later effect is stranded)
    const scope = rt.root.child();
    const a = rt.cell(0);
    const log = [];
    expect(() => rt.runBody(() => {
      rt.effectOn(scope, [a], () => { log.push("E"); });
      a.set(1);
      throw new Error("trap");
    })).toThrow("trap");
    expect(log).toEqual(["E"]);
    a.set(2);
    expect(log).toEqual(["E", "E"]);
    scope.dispose();
  });

  test("a held run of a disposed scope does not run", () => {
    const scope = rt.root.child();
    const a = rt.cell(0);
    const log = [];
    rt.runBody(() => {
      rt.effectOn(scope, [a], () => { log.push("E"); });
      a.set(1);
      scope.dispose();
    });
    expect(log).toEqual([]);
  });
});

describe("§13.9.4 — a held run of a pending cell's load is dated at its trigger", () => {
  // A pending cell: target `pend` set (state null). "The most recently started write or load wins."
  test("a body write of the cell after the request's place still wins over the (held) load", async () => {
    // mutation RED: dating the held run when it runs (after the body) — the load would land over "z"
    const scope = rt.root.child();
    const who = rt.cell(null);
    let resolve;
    rt.runBody(() => {
      rt.requestOn(scope, who, [], () => ({ on: new Promise((r) => { resolve = r; }), then: (v) => who.set(v) }), { read: true });
      who.set("z");
    });
    resolve?.("loaded");   // s482 r1 (F4): the superseded held load is not issued at all
    await tick();
    expect(who.peek()).toBe("z");
    scope.dispose();
  });

  test("a held load a body write has superseded is not issued (no fetch for a discarded result)", async () => {
    // s482 r1 (F4) — mutation RED: Request.run issuing a held run whose start `pendOlder` already loses
    const scope = rt.root.child();
    const who = rt.cell(null);
    let fetches = 0;
    rt.runBody(() => {
      rt.requestOn(scope, who, [], () => { fetches++; return { on: Promise.resolve("loaded"), then: (v) => who.set(v) }; }, { read: true });
      who.set("z");
    });
    await tick();
    expect(fetches).toBe(0);
    expect(who.peek()).toBe("z");
    scope.dispose();
  });

  test("a body write of `not` after the request re-dates the load: it is issued once and lands", async () => {
    const scope = rt.root.child();
    const who = rt.cell(null);
    let fetches = 0;
    rt.runBody(() => {
      rt.requestOn(scope, who, [], () => { fetches++; return { on: Promise.resolve("loaded"), then: (v) => who.set(v) }; }, { read: true });
      who.set("z");
      who.set(null);
    });
    await tick();
    expect(fetches).toBe(1);
    expect(who.peek()).toBe("loaded");
    scope.dispose();
  });

  test("with no later write the held load lands", async () => {
    const scope = rt.root.child();
    const who = rt.cell(null);
    let resolve;
    rt.runBody(() => {
      rt.requestOn(scope, who, [], () => ({ on: new Promise((r) => { resolve = r; }), then: (v) => who.set(v) }), { read: true });
    });
    resolve("loaded");
    await tick();
    expect(who.peek()).toBe("loaded");
    scope.dispose();
  });
});
