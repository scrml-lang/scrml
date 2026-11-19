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

  test("INTERIM — a data-bound ATTRIBUTE that traps still ends the mount (an absent `sandbox` is the less safe state; g-boot-mount-trap-attr-hole-unruled-s480)", () => {
    document.body.innerHTML = '<iframe id="f"></iframe>';
    const s = new rtm.Scope(rtm.root);
    const trap = () => { throw new rtm.ScrmlTrap("E-INDEX-OUT-OF-RANGE-RT", "index 5 is out of range for a tape of length 2 (t.scrml:1)", {}); };
    expect(() => rtm.attr(s, $("#f"), "sandbox", trap)).toThrow(/E-INDEX-OUT-OF-RANGE-RT/);
    s.dispose();
  });
});
