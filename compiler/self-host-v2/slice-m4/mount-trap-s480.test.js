// mount-trap-s480.test.js — s480-runtime item 20 (g-boot-mount-trap-blanks-page-s476).
//
// Ruling (user-voice-scrml.md S479 "⭐ RULED — the rest of S478 hand-off §3.B", item 20):
//   "**g-boot-mount-trap-blanks-page-s476** — Rec (PERMANENT): the trap unit is the effect,
//    not the mount — the failing hole renders nothing, the trap is reported once, the rest of
//    the mount proceeds. One §19.17 sentence."
//
// Before s480 one trap in one text hole (an adopter's `round(NaN, .HalfUp)` in a derived
// summary) aborted the whole mount: the view was never inserted, inputs included. Each test
// below compiles scrml source with the bootstrap, runs it in happy-dom against the bootstrap
// runtime, and observes the DOM. Security half: a hole whose effect traps renders NOTHING —
// an `if=` gate whose test traps shows no arm (neither the gated arm nor its `else`), a
// `show=` element is hidden, a loop shows no rows — on the mount and on a later re-run (where
// the base kept the arm it showed before: fail-open).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";
import * as rtm from "../slice-m1/runtime/runtime.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => { expectNoPageErrors(); });

const clean = (src) => {
  const r = frontEnd(mods, [{ path: "t.scrml", src }]);
  expect(r.diags.filter((d) => d.severity === "Error").map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
let k = 0;
const $ = (sel) => document.querySelector(sel);
const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);

// The trap's report goes to `reportError` (the browser's logging path, §19.6.8 B5); captured here.
async function withReports(fn) {
  const reported = [];
  const saved = globalThis.reportError;
  globalThis.reportError = (e) => reported.push(e);
  try { await fn(reported); } finally { globalThis.reportError = saved; }
  return reported;
}
const codesOf = (reported) => reported.map((e) => e.code);

// `@xs[@i]` traps (E-INDEX-OUT-OF-RANGE-RT) while @i is out of range; `in`/`out` move it.
const prog = (view) => `<program>
    <xs:int[]=([10, 20])/>
    let <i:int=5/>
    let <name:string="ann"/>
    function into() { @i = 1; }
    function out() { @i = 7; }
    <main>
        <button onclick=into()>in</button>
        <button onclick=out()>out</button>
        <p id="before">before</p>
${view}
        <p id="after">after \${@name}</p>
        <input id="in" bind:value=@name/>
    </main>
</program>
`;

describe("§19.17 (s480): a trap in one hole at mount — the hole renders nothing, the rest mounts", () => {
  test("a text hole that traps at mount: the view is inserted, other holes and the input work, one report", async () => {
    const reported = await withReports(async () => {
      await loadProgram(clean(prog(`        <p id="hole">v=\${@xs[@i]}</p>`)).core, "s480mt-" + k++);
    });
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    expect(reported[0]).toBeInstanceOf(Error);
    expect(String(reported[0].message)).toContain("t.scrml:");       // the report names its source location
    expect($("#before").textContent).toBe("before");
    expect($("#hole").textContent).toBe("v=");                          // the hole renders nothing
    expect($("#after").textContent).toBe("after ann");
    expect($("#in").value).toBe("ann");
    // the rest of the page is live
    const later = await withReports(async () => {
      $("#in").value = "bob";
      $("#in").dispatchEvent(new window.Event("input", { bubbles: true }));
      expect($("#after").textContent).toBe("after bob");
      // the hole recovers when its value exists, and blanks again (one report) when it traps again
      click(btn("in"));
      expect($("#hole").textContent).toBe("v=20");
      click(btn("out"));
      expect($("#hole").textContent).toBe("v=");
    });
    expect(codesOf(later)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
  });

  test("an `if=` gate whose test traps shows NO arm — neither the gated arm nor its `else` — at mount and on a re-run", async () => {
    const reported = await withReports(async () => {
      await loadProgram(clean(prog(`        <p id="secret" if=(@xs[@i] == 20)>SECRET</p>\n        <p id="other" else>OTHER</p>`)).core, "s480mt-" + k++);
    });
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    expect($("#secret")).toBeNull();
    expect($("#other")).toBeNull();
    expect($("#after").textContent).toBe("after ann");
    const later = await withReports(async () => {
      click(btn("in"));                                                 // the gate's test holds: the arm shows
      expect($("#secret").textContent).toBe("SECRET");
      click(btn("out"));                                                // the test traps: the arm it showed is REMOVED
      expect($("#secret")).toBeNull();
      expect($("#other")).toBeNull();
    });
    expect(codesOf(later)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
  });

  test("a `show=` element whose test traps is hidden, at mount and on a re-run", async () => {
    await withReports(async () => {
      await loadProgram(clean(prog(`        <p id="shown" show=(@xs[@i] == 20)>SHOWN</p>`)).core, "s480mt-" + k++);
    });
    expect($("#shown").style.display).toBe("none");
    const later = await withReports(async () => {
      click(btn("in"));
      expect($("#shown").style.display).toBe("");
      click(btn("out"));
      expect($("#shown").style.display).toBe("none");
    });
    expect(codesOf(later)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
  });

  test("an `<each>` whose source traps shows no rows; the rows come back when it reads", async () => {
    const view = `        <ul id="rows"><each in=(@xs.filter(v => v <= @xs[@i])) as r><li>\${r}</li></each></ul>`;
    const reported = await withReports(async () => {
      await loadProgram(clean(prog(view)).core, "s480mt-" + k++);
    });
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    expect($("#rows").querySelectorAll("li").length).toBe(0);
    expect($("#after").textContent).toBe("after ann");
    await withReports(async () => {
      click(btn("in"));
      expect([...$("#rows").querySelectorAll("li")].map((li) => li.textContent)).toEqual(["10", "20"]);
      click(btn("out"));
      expect($("#rows").querySelectorAll("li").length).toBe(0);
    });
  });

  test("a Tier-0 loop whose body traps shows no rows — not even the rows lifted before the trap", async () => {
    const view = "        <ul id=\"rows\">${ for (x of @xs) { lift <li>${x}</li>; if (@xs[@i] > 0) { lift <li>more</li>; } } }</ul>";
    // the first iteration lifts <li>10</li>, then reads @xs[@i]: at mount (@i = 5) that traps
    const reported = await withReports(async () => {
      await loadProgram(clean(prog(view)).core, "s480mt-" + k++);
    });
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    expect($("#rows").querySelectorAll("li").length).toBe(0);
    expect($("#after").textContent).toBe("after ann");
    const later = await withReports(async () => {
      click(btn("in"));
      expect([...$("#rows").querySelectorAll("li")].map((li) => li.textContent)).toEqual(["10", "more", "20", "more"]);
      click(btn("out"));
      expect($("#rows").querySelectorAll("li").length).toBe(0);
    });
    expect(codesOf(later)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
  });
});

describe("§19.17 (s480): the runtime's hole containment, unit level", () => {
  test("a host file's trap (stdlib/math/host.js shape: an Error named ScrmlTrap with a code) is contained like the runtime's own", async () => {
    document.body.innerHTML = '<p id="u"><!--h--></p>';
    const c = new rtm.Cell(Number.NaN);
    const s = new rtm.Scope(rtm.root);
    const reported = await withReports(async () => {
      rtm.text(s, $("#u").firstChild, () => {
        const v = c.get();
        if (Number.isNaN(v)) { const e = new Error("E-INT-CONVERSION-RT: round(NaN) has no int value"); e.name = "ScrmlTrap"; e.code = "E-INT-CONVERSION-RT"; throw e; }
        return v;
      });
    });
    expect(codesOf(reported)).toEqual(["E-INT-CONVERSION-RT"]);
    expect($("#u").textContent).toBe("");
    rtm.batch(() => c.set(2));
    expect($("#u").textContent).toBe("2");
    s.dispose();
  });

  test("a throw that is NOT a trap (a bootstrap defect) still propagates — after the hole is blanked", () => {
    document.body.innerHTML = '<p id="u"><!--h--></p>';
    const c = new rtm.Cell(1);
    const s = new rtm.Scope(rtm.root);
    rtm.text(s, $("#u").firstChild, () => { if (c.get() === 2) throw new TypeError("defect"); return c.get(); });
    expect($("#u").textContent).toBe("1");
    expect(() => rtm.batch(() => c.set(2))).toThrow(/defect/);
    expect($("#u").textContent).toBe("");
    s.dispose();
  });

  test("INTERIM — a TOP-LEVEL data-bound ATTRIBUTE that traps still ends the mount (an absent `sandbox` is the less safe state; g-boot-mount-trap-attr-hole-unruled-s480; inside a hole it blanks that hole — below)", () => {
    document.body.innerHTML = '<iframe id="f"></iframe>';
    const s = new rtm.Scope(rtm.root);
    const trap = () => { throw new rtm.ScrmlTrap("E-INDEX-OUT-OF-RANGE-RT", "index 5 is out of range for a tape of length 2 (t.scrml:1)", {}); };
    expect(() => rtm.attr(s, $("#f"), "sandbox", trap)).toThrow(/E-INDEX-OUT-OF-RANGE-RT/);
    s.dispose();
  });
});

// s480 r1 (#2008 review F1) — a ROW's render that throws (an `rt.attr` trap inside the row)
// unwinds into the list's hole. Before r1, `reconcile` / `reconcileKeyed` built rows as
// `scope.child()` and handed them to the list only after the whole loop, so the hole's blank
// never saw the rows created before the throw: they stayed in the DOM (partial rows at mount),
// their effects and listeners leaked, and a recovering run rendered next to them (duplicates).
// A trapped list hole shows NO rows and disposes every row its failed run created.
describe("§19.17 (s480 r1): a trap inside a list ROW blanks the whole list, leaks nothing", () => {
  const lis = () => [...$("#rows").querySelectorAll("li")].map((li) => li.textContent);

  test("`<each>` — a row attribute that traps at mount: no rows, one report; recovery renders exactly its rows", async () => {
    const view = "        <ul id=\"rows\"><each in=([@i, 0, 1]) as r><li title=(@xs[r])>row${r}</li></each></ul>";
    const reported = await withReports(async () => {
      await loadProgram(clean(prog(view)).core, "s480mt-" + k++);
    });
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    expect(lis()).toEqual([]);                       // base: the rows rendered after the trapping one stayed
    expect($("#rows").innerHTML).not.toContain("row");
    expect($("#after").textContent).toBe("after ann");
    const later = await withReports(async () => {
      click(btn("in"));
      expect(lis()).toEqual(["row1", "row0", "row1"]); // base: 5 <li> (the 2 stale rows + 3 new)
    });
    expect(codesOf(later)).toEqual([]);
  });

  test("`<each>` — a row attribute that traps on a RE-RUN: no stale or partial rows; recovery renders exactly its rows", async () => {
    const view = "        <ul id=\"rows\"><each in=(@i == 1 ? [0, 9, 1, 0] : [0]) as r><li title=(@xs[r])>row${r}</li></each></ul>";
    await withReports(async () => {
      await loadProgram(clean(prog(view)).core, "s480mt-" + k++);
    });
    expect(lis()).toEqual(["row0"]);
    const later = await withReports(async () => {
      click(btn("in"));                               // row 9 traps
      expect(lis()).toEqual([]);
      click(btn("out"));
      expect(lis()).toEqual(["row0"]);
    });
    expect(codesOf(later)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
  });

  test("keyed Tier-0 `for … key` — a row attribute that traps: no rows at mount and on a re-run; recovery exact", async () => {
    const view = "        <ul id=\"rows\">${ for (const r of (@i == 1 ? [0, 1] : [@i, 0, 1]) key r) { lift <li title=(@xs[r])>k${r}</li>; } }</ul>";
    const reported = await withReports(async () => {
      await loadProgram(clean(prog(view)).core, "s480mt-" + k++);
    });
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    expect(lis()).toEqual([]);
    const later = await withReports(async () => {
      click(btn("in"));
      expect(lis()).toEqual(["k0", "k1"]);
      click(btn("out"));                              // [7, 0, 1]: rows 0 and 1 kept, row 7 traps
      expect(lis()).toEqual([]);
      click(btn("in"));
      expect(lis()).toEqual(["k0", "k1"]);
    });
    expect(codesOf(later)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
  });

  test("unkeyed Tier-0 `for` (gather) — a row attribute that traps: no rows at mount and on a re-run; recovery exact", async () => {
    const view = "        <ul id=\"rows\">${ for (r of (@i == 1 ? [0, 1] : [@i, 0, 1])) { lift <li title=(@xs[r])>g${r}</li>; } }</ul>";
    const reported = await withReports(async () => {
      await loadProgram(clean(prog(view)).core, "s480mt-" + k++);
    });
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    expect(lis()).toEqual([]);
    const later = await withReports(async () => {
      click(btn("in"));
      expect(lis()).toEqual(["g0", "g1"]);
      click(btn("out"));
      expect(lis()).toEqual([]);
      click(btn("in"));
      expect(lis()).toEqual(["g0", "g1"]);
    });
    expect(codesOf(later)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
  });

  // Unit level: every row scope the failed run created is disposed (its cleanups — DOM,
  // effects, listeners — ran), so nothing outlives the blank.
  const trapAt = (bad) => (v) => { if (v === bad) throw new rtm.ScrmlTrap("E-INDEX-OUT-OF-RANGE-RT", "index " + v + " is out of range (t.scrml:1)", {}); };
  function harness(mount) {
    document.body.innerHTML = '<ul id="rows"><!--a--></ul>';
    const s = new rtm.Scope(rtm.root);
    const live = new Set();
    const rowRender = (scope, anchor, v) => {
      const li = document.createElement("li");
      li.textContent = String(v);
      anchor.parentNode.insertBefore(li, anchor);
      live.add(li);
      scope.own(() => { live.delete(li); if (li.parentNode) li.parentNode.removeChild(li); }); // its DOM, listeners, effects
      trapAt(9)(v);
    };
    const items = new rtm.Cell([1, 9, 2]);
    mount(s, $("#rows").firstChild, items, rowRender);
    return { s, live, items };
  }
  const settle = async (items, s, live) => {
    const reported = await withReports(async () => {
      expect(live.size).toBe(0);                     // base: the rows created before the trap stayed live
      expect(lis()).toEqual([]);
      rtm.batch(() => items.set([1, 2]));
      expect(lis()).toEqual(["1", "2"]);
      expect(live.size).toBe(2);
      rtm.batch(() => items.set([2, 9, 3, 1]));
      expect(live.size).toBe(0);
      expect(lis()).toEqual([]);
      rtm.batch(() => items.set([3]));
      expect(lis()).toEqual(["3"]);
      expect(live.size).toBe(1);
    });
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    s.dispose();
    expect(live.size).toBe(0);
  };

  test("unit: `each` disposes every row its failed run created", async () => {
    let h;
    const first = await withReports(async () => {
      h = harness((s, a, items, render) => rtm.each(s, a, () => items.get(), (v) => v, (scope, cell, anchor) => render(scope, anchor, cell.get())));
    });
    expect(codesOf(first)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    await settle(h.items, h.s, h.live);
  });

  test("unit: `gatherKeyed` disposes every row its failed run created", async () => {
    let h;
    const first = await withReports(async () => {
      h = harness((s, a, items, render) => rtm.gatherKeyed(s, a, () => items.get().map((v) => rtm.keyRow(rtm.loopKey(v), 0, [v], (scope, anchor, cell) => render(scope, anchor, cell.get())))));
    });
    expect(codesOf(first)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    await settle(h.items, h.s, h.live);
  });

  test("unit: `gather` disposes every row its failed run created (pin: its rows scope exists before the rows render)", async () => {
    let h;
    const first = await withReports(async () => {
      h = harness((s, a, items, render) => rtm.gather(s, a, () => items.get().map((v) => (scope, anchor) => render(scope, anchor, v))));
    });
    expect(codesOf(first)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    await settle(h.items, h.s, h.live);
  });
});

// s480 r1 (#2008 review F2) — `rt.attr` is not a hole: a top-level trapping attribute ends the
// mount (the INTERIM test above), but one INSIDE a hole (an `if=` arm, an `<each>` row, a loop
// row) unwinds into that hole, which blanks — fail closed: the arm is not rendered at all.
describe("§19.17 (s480 r1): an attribute trap inside an `if=` arm blanks the arm", () => {
  test("`<iframe sandbox=(…trap…)>` inside an `if=` arm: the arm is not rendered, reported once; it renders when the value reads", async () => {
    const view = "        <div id=\"gate\" if=(@i > 0)><iframe id=\"f\" sandbox=(@xs[@i] == 20 ? \"\" : \"allow-scripts\") src=\"https://x.test/\"></iframe><p id=\"arm\">ARM</p></div>";
    const reported = await withReports(async () => {
      await loadProgram(clean(prog(view)).core, "s480mt-" + k++);
    });
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    expect($("#gate")).toBeNull();
    expect($("#f")).toBeNull();                       // no iframe without its sandbox
    expect($("#arm")).toBeNull();
    expect($("#after").textContent).toBe("after ann");
    const later = await withReports(async () => {
      click(btn("in"));
      expect($("#f").getAttribute("sandbox")).toBe("");
      expect($("#arm").textContent).toBe("ARM");
    });
    expect(codesOf(later)).toEqual([]);
  });
});
