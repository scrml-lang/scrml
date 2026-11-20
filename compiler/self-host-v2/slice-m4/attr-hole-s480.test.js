// attr-hole-s480.test.js — s480-trap-attr-hole (g-boot-mount-trap-attr-hole-unruled-s480).
//
// Ruling (user-voice-scrml.md S480 "⭐ RULED — what a trap renders when "nothing" is not safe
// (#2008, item 20 follow-up)"; ruling:user-voice-scrml.md-S480-trap-attr-hole):
//   1. "A trapped data-bound attribute: the element carrying it is the hole." — "the element is
//      replaced by a placeholder, the trap is reported once, and the element is restored on
//      recovery — on mount and on every re-run. Removing the element is the only state that is
//      safe for every attribute; the cost is that a trapped element loses focus, scroll and
//      input state when it comes back, which is acceptable on a trap path." — RULED yes (PERMANENT).
//   2. "A masking element whose test traps disappears, as item 20 rules." — RULED yes.
//
// Before: a top-level attribute trap ended the whole mount (nothing inserted); inside an `if=`
// arm / list row it blanked the enclosing hole; on a RE-RUN a trapping attribute kept its STALE
// previous value (fail-open for `href` / `src` / `sandbox`). Each compiled test below runs
// bootstrap-compiled scrml in happy-dom against the bootstrap runtime.

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
const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event("input", { bubbles: true })); };

async function withReports(fn) {
  const reported = [];
  const saved = globalThis.reportError;
  globalThis.reportError = (e) => reported.push(e);
  try { await fn(reported); } finally { globalThis.reportError = saved; }
  return reported;
}
const codesOf = (reported) => reported.map((e) => e.code);
const load = (src) => withReports(async () => { await loadProgram(clean(src).core, "s480ah-" + k++); });

// `@xs[@i]` traps (E-INDEX-OUT-OF-RANGE-RT) while @i is out of range: `@i` starts at 5;
// `in` sets it to 1 (reads 20), `zero` to 0 (reads 10), `two` to 2, `out` to 7.
const prog = (view, extra = "") => `<program>
    <xs:int[]=([10, 20])/>
    let <i:int=5/>
    let <name:string="ann"/>
    let <n:int=0/>
${extra}
    function into() { @i = 1; }
    function zero() { @i = 0; }
    function two() { @i = 2; }
    function out() { @i = 7; }
    function bump() { @n = @n + 1; }
    <main>
        <button onclick=into()>in</button>
        <button onclick=zero()>zero</button>
        <button onclick=two()>two</button>
        <button onclick=out()>out</button>
        <p id="before">before</p>
${view}
        <p id="after">after \${@name}</p>
        <p id="count">\${@n}</p>
        <input id="in" bind:value=@name/>
    </main>
</program>
`;

describe("S480 attr-hole: the element carrying a trapped attribute is the hole", () => {
  test("a top-level attribute trap at MOUNT: the element is replaced by a placeholder, the rest renders, one report", async () => {
    const reported = await load(prog(`        <div id="box"><a id="lnk" title=(@xs[@i])>LINK</a><span id="sib">sib</span></div>`));
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);  // base: the mount threw; nothing inserted
    expect($("#lnk")).toBeNull();
    expect($("#box").firstChild.nodeType).toBe(8);                   // the placeholder holds its place
    expect($("#sib").textContent).toBe("sib");
    expect($("#before").textContent).toBe("before");
    expect($("#after").textContent).toBe("after ann");
    type($("#in"), "bob");                                            // the rest of the page is live
    expect($("#after").textContent).toBe("after bob");
  });

  test("a RE-RUN trap removes the element — never left with its stale value — and recovery restores it in place with fresh values", async () => {
    await load(prog(`        <div id="box"><a id="lnk" title=(@xs[@i]) data-who=(@name)>LINK</a><span id="sib">sib</span></div>`));
    const later = await withReports(async () => {
      click(btn("in"));
      expect($("#lnk").getAttribute("title")).toBe("20");
      expect($("#box").firstChild).toBe($("#lnk"));
      click(btn("out"));                                              // base: kept title="20" (stale) and threw
      expect($("#lnk")).toBeNull();
      expect($("#box").querySelector("[title]")).toBeNull();
      type($("#in"), "bob");                                          // another attribute's value changes while it is out
      click(btn("zero"));
      expect($("#lnk").getAttribute("title")).toBe("10");
      expect($("#lnk").getAttribute("data-who")).toBe("bob");         // fresh, not the value it had when it left
      expect($("#box").firstChild).toBe($("#lnk"));                   // back in its own place
      expect($("#box").childNodes.length).toBe(2);                    // the placeholder is gone
    });
    expect(codesOf(later)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
  });

  test("`<iframe sandbox=…>`: no frame without its sandbox — at mount, on a re-run, and back with the fresh policy", async () => {
    const reported = await load(prog(`        <iframe id="f" sandbox=(@xs[@i] == 20 ? "" : "allow-scripts")></iframe>`));
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    expect(document.querySelector("iframe")).toBeNull();            // never inserted, never loaded
    const later = await withReports(async () => {
      click(btn("in"));
      expect($("#f").getAttribute("sandbox")).toBe("");
      click(btn("out"));                                              // base: the frame stayed with sandbox="" (stale)
      expect(document.querySelector("iframe")).toBeNull();
      click(btn("zero"));
      expect($("#f").getAttribute("sandbox")).toBe("allow-scripts");
    });
    expect(codesOf(later)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
  });

  test("an `href` that traps on a re-run: the link leaves (no stale target to follow)", async () => {
    await load(prog(`        <nav id="nav"><a id="go" href=(@xs[@i] == 20 ? "/twenty" : "/ten")>go</a></nav>`));
    const later = await withReports(async () => {
      click(btn("in"));
      expect($("#go").getAttribute("href")).toBe("/twenty");
      click(btn("out"));
      expect($("#go")).toBeNull();
      expect($("#nav").querySelector("a")).toBeNull();
      click(btn("zero"));
      expect($("#go").getAttribute("href")).toBe("/ten");
    });
    expect(codesOf(later)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
  });

  test("nested elements: each element with a trapped attribute is its own hole; holes inside an element that is out stay current", async () => {
    // outer reads @xs[@i] (traps at 2), inner reads @xs[@i - 1] (traps at 0: index -1)
    const view = `        <div id="outer" title=(@xs[@i])><span id="inner" title=(@xs[@i - 1])>in</span><b id="txt">\${@name}</b></div>`;
    await load(prog(view));
    const later = await withReports(async () => {
      click(btn("in"));                                               // both read
      expect($("#outer").getAttribute("title")).toBe("20");
      expect($("#inner").getAttribute("title")).toBe("10");
      click(btn("zero"));                                             // inner traps only
      expect($("#outer").getAttribute("title")).toBe("10");
      expect($("#inner")).toBeNull();
      expect($("#txt").textContent).toBe("ann");
      click(btn("two"));                                              // outer traps; inner reads (out with it)
      expect($("#outer")).toBeNull();
      type($("#in"), "cy");                                           // a text hole inside the element that is out
      click(btn("in"));
      expect($("#outer").getAttribute("title")).toBe("20");
      expect($("#inner").getAttribute("title")).toBe("10");
      expect($("#txt").textContent).toBe("cy");
    });
    expect(codesOf(later)).toEqual(["E-INDEX-OUT-OF-RANGE-RT", "E-INDEX-OUT-OF-RANGE-RT"]);
  });

  test("listeners inside the element are not duplicated (nor lost) by a trap and its recovery", async () => {
    await load(prog(`        <div id="box" title=(@xs[@i])><button onclick=bump()>bump</button></div>`));
    expect(btn("bump")).toBeUndefined();
    await withReports(async () => {
      click(btn("in"));
      click(btn("out"));
      click(btn("in"));
      click(btn("out"));
      click(btn("zero"));
      click(btn("bump"));
    });
    expect($("#count").textContent).toBe("1");
  });

  test("an attribute trap inside an `<each>` row holds out that row's element; the other rows render", async () => {
    const view = "        <ul id=\"rows\"><each in=([0, @i, 1]) as r><li title=(@xs[r])>r${r}</li></each></ul>";
    const reported = await load(prog(view));
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    expect([...$("#rows").querySelectorAll("li")].map((li) => li.textContent)).toEqual(["r0", "r1"]);
    await withReports(async () => { click(btn("in")); });
    expect([...$("#rows").querySelectorAll("li")].map((li) => li.textContent)).toEqual(["r0", "r1", "r1"]);
  });

  test("an attribute trap inside an `if=` arm holds out its element; the arm's other content renders", async () => {
    const view = `        <section id="arm" if=(@n == 0)><img id="pic" src=(@xs[@i] == 20 ? "/a.png" : "/b.png")/><p id="cap">caption</p></section>`;
    const reported = await load(prog(view));
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);  // base: the arm was not rendered
    expect($("#pic")).toBeNull();
    expect($("#cap").textContent).toBe("caption");
    await withReports(async () => { click(btn("in")); });
    expect($("#pic").getAttribute("src")).toBe("/a.png");
  });

  // r1 (review of #2017) — the reviewer's compiled repros. `@i` 1 → 7 (F1) and 1 → 2 → 0 (F2).
  // r3: a live element's writers write at their own place in the flush, as on base — `src` (first)
  // is written while the img is live, before `referrerpolicy` (second) traps; then the img leaves
  // with its policy kept (nothing removed, nothing written to it once it is out).
  test("r1 F1 compiled: `src` changes as `referrerpolicy` traps — src written live (base order), no policy removed, then out", async () => {
    await load(prog(`        <img id="p" src=(@i == 1 ? "/one" : "/other") referrerpolicy=(@xs[@i] == 20 ? "no-referrer" : "origin")/>`));
    const writes = [];
    let img = null;
    const later = await withReports(async () => {
      click(btn("in"));
      img = $("#p");
      expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
      logWrites(img, writes);
      click(btn("out"));
    });
    expect(writes).toEqual(["set src=/other connected=true"]);
    expect(img.isConnected).toBe(false);
    expect(img.getAttribute("src")).toBe("/other");
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(codesOf(later)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
  });

  test("r1 F2 compiled: a writer that re-traps during a recovery — nothing is written to the held img", async () => {
    await load(prog(`        <img id="p" title=(@xs[@i]) referrerpolicy=(@xs[@i - 1] == 10 ? "no-referrer" : "origin") src=(@i == 1 ? "/one" : "/other")/>`));
    const writes = [];
    let img = null;
    const later = await withReports(async () => {
      click(btn("in"));
      img = $("#p");
      logWrites(img, writes);
      click(btn("two"));                                              // title traps
      click(btn("zero"));                                             // title reads, referrerpolicy traps, src changes
      expect(writes).toEqual([]);                                     // base: set src=/other on a detached img, no policy
      expect(img.isConnected).toBe(false);
      click(btn("in"));
    });
    expect($("#p")).toBe(img);
    expect(img.getAttribute("src")).toBe("/one");
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(writes.every((w) => w.endsWith("connected=false"))).toBe(true);
    expect(codesOf(later)).toEqual(["E-INDEX-OUT-OF-RANGE-RT", "E-INDEX-OUT-OF-RANGE-RT"]);
  });
});

describe("S480 attr-hole item 2: a masking element whose test traps disappears (pin)", () => {
  test("a `show=` overlay whose test traps is hidden; the content it covered is in the page (a client condition is not a security boundary)", async () => {
    const view = `        <div id="secret">SECRET</div>\n        <div id="mask" show=(@xs[@i] > 0)>LOCKED</div>`;
    const reported = await load(prog(view));
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    expect($("#mask").style.display).toBe("none");
    expect($("#secret").textContent).toBe("SECRET");
  });

  test("an `if=` curtain whose test traps shows no arm", async () => {
    const view = `        <div id="curtain" if=(@xs[@i] > 0)>CURTAIN</div>`;
    const reported = await load(prog(view));
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    expect($("#curtain")).toBeNull();
  });
});

// Every setAttribute / removeAttribute on `el`, with whether it was in the page at the time.
function logWrites(el, log) {
  const sa = el.setAttribute.bind(el), ra = el.removeAttribute.bind(el);
  el.setAttribute = (n, v) => { log.push(`set ${n}=${v} connected=${el.isConnected}`); sa(n, v); };
  el.removeAttribute = (n) => { log.push(`remove ${n} connected=${el.isConnected}`); ra(n); };
}

describe("S480 attr-hole: runtime, unit level", () => {
  const trap = (code = "E-INDEX-OUT-OF-RANGE-RT") => new rtm.ScrmlTrap(code, "trap (t.scrml:1)", {});

  test("while another attribute holds the element out, nothing is written to it; all are written before it returns", async () => {
    document.body.innerHTML = '<div id="w"><img id="p"></div>';
    const img = $("#p");
    const s = new rtm.Scope(rtm.root);
    const ok = new rtm.Cell(true);
    const src = new rtm.Cell("/a.png");
    const order = [];
    const writes = [];
    const reported = await withReports(async () => {
      rtm.attr(s, img, "referrerpolicy", () => { if (!ok.get()) throw trap(); return "no-referrer"; });
      rtm.attr(s, img, "src", () => src.get());
      expect(img.getAttribute("src")).toBe("/a.png");
      logWrites(img, writes);
      rtm.batch(() => ok.set(false));                                // referrerpolicy traps: the img leaves
      expect($("#p")).toBeNull();
      expect(img.isConnected).toBe(false);
      // r1 F1: the blank holds the element ONLY — removing `referrerpolicy` from a live img is a
      // relevant mutation (a refetch without the policy); the stale value leaves with the element
      rtm.batch(() => src.set("/b.png"));                            // not written while out (a detached img fetches)
      expect(writes).toEqual([]);
      expect(img.getAttribute("src")).toBe("/a.png");
      rtm.batch(() => ok.set(true));
      // back, with every attribute fresh
      expect($("#p")).toBe(img);
      expect(img.getAttribute("src")).toBe("/b.png");
      expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
      order.push("done");
    });
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    expect(order).toEqual(["done"]);
    s.dispose();
  });

  // r1 (review of #2017) — F1: a live img whose `src` changes in the same flush in which its
  // `referrerpolicy` traps: no policy is removed from the live img. r3: the `src` writer (first)
  // writes while the img is live, as on base; once the policy traps, nothing more is written.
  test("r1 F1: a writer that traps in the same flush as a sibling's change — no removal; the element leaves", async () => {
    document.body.innerHTML = '<div id="w"><img id="p"></div>';
    const img = $("#p");
    const s = new rtm.Scope(rtm.root);
    const i = new rtm.Cell(1);
    const writes = [];
    const reported = await withReports(async () => {
      rtm.attr(s, img, "src", () => "/p" + i.get());
      rtm.attr(s, img, "referrerpolicy", () => { if (i.get() > 1) throw trap(); return "no-referrer"; });
      logWrites(img, writes);
      rtm.batch(() => i.set(2));
    });
    expect(writes).toEqual(["set src=/p2 connected=true"]);
    expect(img.isConnected).toBe(false);
    expect(img.getAttribute("src")).toBe("/p2");
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    s.dispose();
  });

  // F2: A recovers while B starts trapping and C changes, all in one flush. Nothing may be written
  // to the held img (base: C's `src=/p0` was written to a detached img with no referrerpolicy).
  test("r1 F2: a writer re-trapping during a recovery — no write to the held element, ever", async () => {
    document.body.innerHTML = '<div id="w"><img id="p"></div>';
    const img = $("#p");
    const s = new rtm.Scope(rtm.root);
    const i = new rtm.Cell(1);
    const xs = [10, 20];
    const writes = [];
    const reported = await withReports(async () => {
      rtm.attr(s, img, "title", () => { const v = xs[i.get()]; if (v === undefined) throw trap(); return v; });   // A traps at 2
      rtm.attr(s, img, "referrerpolicy", () => { if (i.get() < 1) throw trap(); return "no-referrer"; });          // B traps at 0
      rtm.attr(s, img, "src", () => "/p" + i.get());                                                              // C
      logWrites(img, writes);
      rtm.batch(() => i.set(2));
      expect(img.isConnected).toBe(false);
      rtm.batch(() => i.set(0));
      expect(img.isConnected).toBe(false);
      expect(writes).toEqual([]);
      rtm.batch(() => i.set(1));                                       // all read: written, then back
    });
    // r3: recovery (after the flush) writes only the values that differ from the img's attributes —
    // here none (back at i=1, the values it left with) — then the img returns
    expect(writes).toEqual([]);
    expect(img.getAttribute("title")).toBe("20");
    expect(img.getAttribute("src")).toBe("/p1");
    expect($("#p")).toBe(img);
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT", "E-INDEX-OUT-OF-RANGE-RT"]);
    s.dispose();
  });

  // F3: a non-trap throw from another writer in the flush that recovers a trapped writer is
  // attributed to the writer that threw: once it reads again the element comes back (base: the
  // recovering writer was marked trapped and the element stayed out until ITS input changed).
  test("r1 F3: a non-trap throw during a recovery stays with the writer that threw; the element comes back when it reads", async () => {
    document.body.innerHTML = '<div id="w"><a id="l"></a></div>';
    const a = $("#l");
    const s = new rtm.Scope(rtm.root);
    const i = new rtm.Cell(1);
    const j = new rtm.Cell(0);
    const reported = await withReports(async () => {
      rtm.attr(s, a, "title", () => { if (i.get() === 2) throw trap(); return "t" + i.get(); });
      rtm.attr(s, a, "href", () => { if (j.get() === 1) throw new TypeError("defect"); return "/x" + j.get(); });
      rtm.batch(() => i.set(2));
      expect(() => rtm.batch(() => { i.set(1); j.set(1); })).toThrow(/defect/);
      expect(a.isConnected).toBe(false);
      rtm.batch(() => j.set(0));                                       // only href's input changes
    });
    expect($("#l")).toBe(a);
    expect(a.getAttribute("title")).toBe("t1");
    expect(a.getAttribute("href")).toBe("/x0");
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    s.dispose();
  });

  test("two trapped attributes: the element returns only when both read", async () => {
    document.body.innerHTML = '<div id="w"><iframe id="f"></iframe></div>';
    const f = $("#f");
    const s = new rtm.Scope(rtm.root);
    const a = new rtm.Cell(false);
    const b = new rtm.Cell(false);
    const reported = await withReports(async () => {
      rtm.attr(s, f, "sandbox", () => { if (!a.get()) throw trap(); return ""; });
      rtm.attr(s, f, "allow", () => { if (!b.get()) throw trap(); return "fullscreen"; });
      expect($("#f")).toBeNull();
      rtm.batch(() => a.set(true));
      expect($("#f")).toBeNull();                                     // `allow` still traps
      rtm.batch(() => b.set(true));
      expect($("#f")).toBe(f);
      expect(f.getAttribute("sandbox")).toBe("");
      expect(f.getAttribute("allow")).toBe("fullscreen");
    });
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT", "E-INDEX-OUT-OF-RANGE-RT"]);
    s.dispose();
  });

  test("a throw that is NOT a trap holds the element out, then propagates", () => {
    document.body.innerHTML = '<div id="w"><a id="l"></a></div>';
    const s = new rtm.Scope(rtm.root);
    const c = new rtm.Cell(1);
    rtm.attr(s, $("#l"), "href", () => { if (c.get() === 2) throw new TypeError("defect"); return "/x"; });
    expect($("#l").getAttribute("href")).toBe("/x");
    expect(() => rtm.batch(() => c.set(2))).toThrow(/defect/);
    expect($("#l")).toBeNull();
    s.dispose();
  });

  test("disposing the scope while the element is out removes its placeholder (insert's cleanup)", async () => {
    document.body.innerHTML = '<div id="w"><!--a--></div>';
    const s = new rtm.Scope(rtm.root);
    const frag = document.createDocumentFragment();
    const el = document.createElement("a");
    el.id = "l";
    frag.appendChild(el);
    await withReports(async () => {
      rtm.attr(s, el, "title", () => { throw trap(); });
    });
    rtm.insert(s, frag, $("#w").firstChild);
    expect($("#w").childNodes.length).toBe(2);                      // placeholder + anchor
    s.dispose();
    expect($("#w").childNodes.length).toBe(1);                      // only the anchor
  });

  test("disposing the scope after recovery removes the element that came back (insert's cleanup)", async () => {
    document.body.innerHTML = '<div id="w"><!--a--></div>';
    const s = new rtm.Scope(rtm.root);
    const frag = document.createDocumentFragment();
    const el = document.createElement("a");
    el.id = "l";
    frag.appendChild(el);
    const c = new rtm.Cell(false);
    await withReports(async () => {
      rtm.attr(s, el, "title", () => { if (!c.get()) throw trap(); return "t"; });
    });
    rtm.insert(s, frag, $("#w").firstChild);
    rtm.batch(() => c.set(true));
    expect($("#l")).toBe(el);
    s.dispose();
    expect($("#l")).toBeNull();
    expect($("#w").childNodes.length).toBe(1);
  });
});

// r2 (re-review of #2017, 6817c0f34) — N1 (a regression on the NON-trapping path): deferring an
// element's writes until its LAST queued writer ran let a render effect queued between them (a
// `bind:value`) run against stale attributes. The element's other queued writers now run right
// after the first one, and the element is committed there — where an unheld write always landed.
// r3 (re-review of #2017, head 2bc19f9f6): the NON-trapping write path is the base's. Every bound
// attribute is written by its own writer at the writer's own place in the flush — no batching per
// element, no writer pulled forward, no write deferred — so every DOM write, and its order, is what
// origin/main does. Each test below pins the trace measured on origin/main (dfbcca30b). r1 deferred
// an element's writes to its last writer (a `bind:value` saw stale attributes); r2 pulled an
// element's later writers forward to its first, so they read a list row's cell before the keyed
// `<each>` re-render updated it — a value from a state that never existed was written to a live
// `<img src>` / `<iframe src>` (glitch*, red on 2bc19f9f6).
async function trace(src, steps, probe) {
  await load(src);
  const log = ["mount: " + probe()];
  const P = window.Element.prototype, N = window.Node.prototype;
  const sa = P.setAttribute, ra = P.removeAttribute, rc = N.replaceChild;
  const tag = (el) => el.id || el.tagName;
  P.setAttribute = function (n, v) { log.push(`  set ${tag(this)}.${n}=${v} conn=${this.isConnected}`); return sa.call(this, n, v); };
  P.removeAttribute = function (n) { log.push(`  remove ${tag(this)}.${n} conn=${this.isConnected}`); return ra.call(this, n); };
  N.replaceChild = function (a, b) { log.push(`  replace ${b.nodeName}->${a.nodeName}`); return rc.call(this, a, b); };
  const reported = await withReports(async () => {
    try { for (const s of steps) { click(btn(s)); log.push(s + ": " + probe()); } }
    finally { P.setAttribute = sa; P.removeAttribute = ra; N.replaceChild = rc; }
  });
  if (process.env.S480_MEASURE) console.log("TRACE", JSON.stringify(log));
  return { log, codes: codesOf(reported) };
}

// Measured on origin/main (dfbcca30b) with `S480_MEASURE=1` — the base's trace, write for write.
const BASE = {
  select: ["mount: z/0 a ta a", "  set o.value=b conn=true", "  set o.title=tb conn=true", "go: b/1 b tb b"],
  range: ["mount: 5 0 10", "  set r.max=100 conn=true", "  set r.min=1 conn=true", "go: 50 1 100"],
  broad: {
    number: ["mount: v=5 min=0 out=5", "  set n.max=100 conn=true", "  set n.step=5 conn=true", "  set n.min=50 conn=true", "go: v=55 min=50 out=55"],
    textarea: ["mount: v=abc ml=3", "  set t.maxlength=10 conn=true", "go: v=abcdefg ml=10"],
    checkbox: ["mount: checked=false value=a t=t0", "  set c.value=b conn=true", "  set c.title=t1 conn=true", "go: checked=true value=b t=t1"],
    details: ["mount: open=false t=t0", "  set d.title=t1 conn=true", "  set d.open= conn=true", "go: open=true t=t1"],
    selectmulti: ["mount: a:false,b:true", "  set oa.title=t1 conn=true", "  set ob.title=t1 conn=true", "  set oa.selected= conn=true", "  remove ob.selected conn=true", "go: a:true,b:false"],
  },
  multi: [
    "mount: 5 z/0 w0",
    "  set r.max=100 conn=true", "  set o.value=b conn=true", "  set a.href=/h1 conn=true", "  set a.title=w1 conn=true",
    "  set d1.alt=w1 conn=true", "  set d2.title=w1 conn=true", "  set r.min=1 conn=true", "  set o.title=tb conn=true",
    "  set d1.title=tb conn=true", "  set d2.alt=tb conn=true",
    "go: 50 b/1 w1",
  ],
};

describe("S480 attr-hole r3: the non-trapping write path is the base's (every write, in order)", () => {
  test("glitch: a keyed-row img's `src` is written once, from the settled state (red on 2bc19f9f6)", async () => {
    const r = await trace(`<program>
    type Row:struct = { id: int, url: string }
    let <label:string="L0"/>
    let <q:string="?a"/>
    <rows:Row[replace]=([{ id: 1, url: "/u0" }])/>
    function go() { @label = "L1"; @rows = [{ id: 1, url: "/u1" }]; @q = "?b"; }
    <main>
        <button onclick=go()>go</button>
        <ul><each in=@rows key=@.id as row><li><img alt=(@label) src=(row.url + @q)/></li></each></ul>
    </main>
</program>
`, ["go"], () => $("img").outerHTML);
    expect(r).toEqual({ codes: [], log: [
      'mount: <img alt="L0" src="/u0?a">',
      "  set IMG.alt=L1 conn=true",
      "  set IMG.src=/u1?b conn=true",
      'go: <img alt="L1" src="/u1?b">',
    ] });
  });

  test("glitch2: a token never goes to the row's OLD host (red on 2bc19f9f6)", async () => {
    const r = await trace(`<program>
    type Row:struct = { id: int, host: string }
    let <label:string="L0"/>
    let <tok:string="t0"/>
    <rows:Row[replace]=([{ id: 1, host: "https://old.example" }])/>
    function go() { @label = "L1"; @rows = [{ id: 1, host: "https://new.example" }]; @tok = "SECRET"; }
    <main>
        <button onclick=go()>go</button>
        <ul><each in=@rows key=@.id as row><li><img alt=(@label) src=(row.host + "/x?t=" + @tok)/></li></each></ul>
    </main>
</program>
`, ["go"], () => $("img").outerHTML);
    expect(r).toEqual({ codes: [], log: [
      'mount: <img alt="L0" src="https://old.example/x?t=t0">',
      "  set IMG.alt=L1 conn=true",
      "  set IMG.src=https://new.example/x?t=SECRET conn=true",
      'go: <img alt="L1" src="https://new.example/x?t=SECRET">',
    ] });
  });

  test("glitch3: no spurious trap from a row cell read before the re-render (red on 2bc19f9f6)", async () => {
    const r = await trace(`<program>
    type Row:struct = { id: int, i: int }
    let <label:string="L0"/>
    <xs:string[replace]=(["a", "b"])/>
    <rows:Row[replace]=([{ id: 1, i: 1 }])/>
    function go() { @label = "L1"; @rows = [{ id: 1, i: 0 }]; @xs = ["c"]; }
    <main>
        <button onclick=go()>go</button>
        <ul><each in=@rows key=@.id as row><li><iframe id="f" title=(@label) src=("/p" + @xs[row.i])></iframe></li></each></ul>
    </main>
</program>
`, ["go"], () => { const f = $("iframe"); return f ? f.outerHTML : "NO IFRAME"; });
    expect(r).toEqual({ codes: [], log: [
      'mount: <iframe id="f" title="L0" src="/pb"></iframe>',
      "  set f.title=L1 conn=true",
      "  set f.src=/pc conn=true",
      'go: <iframe id="f" title="L1" src="/pc"></iframe>',
    ] });
  });

  test("order: `<select bind:value>` selects an `<option>` by the `value` written in the same flush", async () => {
    const r = await trace(`<program>
    let <v:string="a"/>
    let <t:string="ta"/>
    let <sel:string="a"/>
    function go() { @v = "b"; @sel = "b"; @t = "tb"; }
    <main>
        <button onclick=go()>go</button>
        <select id="s" bind:value=@sel><option value="z">z</option><option id="o" value=(@v) title=(@t)>opt</option></select>
        <p id="out">\${@sel}</p>
    </main>
</program>
`, ["go"], () => `${$("#s").value}/${$("#s").selectedIndex} ${$("#o").getAttribute("value")} ${$("#o").getAttribute("title")} ${$("#out").textContent}`);
    expect(r).toEqual({ codes: [], log: BASE.select });
  });

  test("order: a range input's `bind:value` is judged against the `max` written in the same flush", async () => {
    const r = await trace(`<program>
    let <hi:int=10/>
    let <lo:int=0/>
    let <x:string="5"/>
    function go() { @hi = 100; @x = "50"; @lo = 1; }
    <main>
        <button onclick=go()>go</button>
        <input id="r" type="range" min=(@lo) max=(@hi) bind:value=@x/>
    </main>
</program>
`, ["go"], () => `${$("#r").value} ${$("#r").getAttribute("min")} ${$("#r").getAttribute("max")}`);
    expect(r).toEqual({ codes: [], log: BASE.range });
  });

  test("broad: number / textarea / checkbox / details / multi-select — every write in base order", async () => {
    const out = {};
    out.number = (await trace(`<program>
    let <lo:int=0/>
    let <hi:int=10/>
    let <st:int=1/>
    let <x:string="5"/>
    function go() { @hi = 100; @st = 5; @x = "55"; @lo = 50; }
    <main>
        <button onclick=go()>go</button>
        <input id="n" type="number" min=(@lo) max=(@hi) step=(@st) bind:value=@x/><p id="o">\${@x}</p>
    </main>
</program>
`, ["go"], () => `v=${$("#n").value} min=${$("#n").getAttribute("min")} out=${$("#o").textContent}`)).log;
    out.textarea = (await trace(`<program>
    let <m:int=3/>
    let <x:string="abc"/>
    function go() { @x = "abcdefg"; @m = 10; }
    <main>
        <button onclick=go()>go</button>
        <textarea id="t" maxlength=(@m) bind:value=@x></textarea>
    </main>
</program>
`, ["go"], () => `v=${$("#t").value} ml=${$("#t").getAttribute("maxlength")}`)).log;
    out.checkbox = (await trace(`<program>
    let <v:string="a"/>
    let <c:boolean=false/>
    let <t:string="t0"/>
    function go() { @v = "b"; @c = true; @t = "t1"; }
    <main>
        <button onclick=go()>go</button>
        <input id="c" type="checkbox" value=(@v) title=(@t) bind:checked=@c/>
    </main>
</program>
`, ["go"], () => `checked=${$("#c").checked} value=${$("#c").getAttribute("value")} t=${$("#c").getAttribute("title")}`)).log;
    out.details = (await trace(`<program>
    let <o:boolean=false/>
    let <t:string="t0"/>
    function go() { @t = "t1"; @o = true; }
    <main>
        <button onclick=go()>go</button>
        <details id="d" open=(@o) title=(@t)><summary>s</summary>x</details>
    </main>
</program>
`, ["go"], () => `open=${$("#d").open} t=${$("#d").getAttribute("title")}`)).log;
    out.selectmulti = (await trace(`<program>
    let <a:boolean=false/>
    let <b:boolean=true/>
    let <t:string="t0"/>
    function go() { @t = "t1"; @a = true; @b = false; }
    <main>
        <button onclick=go()>go</button>
        <select id="s" multiple><option id="oa" value="a" selected=(@a) title=(@t)>a</option><option id="ob" value="b" selected=(@b) title=(@t)>b</option></select>
    </main>
</program>
`, ["go"], () => [...$("#s").options].map((o) => o.value + ":" + o.selected).join(","))).log;
    expect(out).toEqual(BASE.broad);
  });

  test("multi-attribute elements interleaved with binds — every write, and what every bind observes, in base order", async () => {
    const r = await trace(`<program>
    let <lo:int=0/>
    let <hi:int=10/>
    let <x:string="5"/>
    let <v:string="a"/>
    let <t:string="ta"/>
    let <sel:string="a"/>
    let <h:string="/h0"/>
    let <w:string="w0"/>
    function go() { @hi = 100; @v = "b"; @x = "50"; @sel = "b"; @h = "/h1"; @w = "w1"; @lo = 1; @t = "tb"; }
    <main>
        <button onclick=go()>go</button>
        <input id="r" type="range" min=(@lo) max=(@hi) bind:value=@x/>
        <select id="s" bind:value=@sel><option value="z">z</option><option id="o" value=(@v) title=(@t)>opt</option></select>
        <a id="a" href=(@h) title=(@w)>x</a>
        <input id="i" bind:value=@w/>
        <img id="d1" alt=(@w) title=(@t)/><img id="d2" alt=(@t) title=(@w)/>
    </main>
</program>
`, ["go"], () => `${$("#r").value} ${$("#s").value}/${$("#s").selectedIndex} ${$("#i").value}`);
    expect(r).toEqual({ codes: [], log: BASE.multi });
  });

  test("runtime: a render effect queued between two writers of one element sees what it saw on base", () => {
    document.body.innerHTML = '<div><img id="p"></div>';
    const img = $("#p");
    const s = new rtm.Scope(rtm.root);
    const a = new rtm.Cell(1), b = new rtm.Cell(1), m = new rtm.Cell(1);
    const seen = [];
    rtm.attr(s, img, "src", () => "/p" + a.get());
    rtm.effect(s, () => { m.get(); seen.push(`${img.getAttribute("src")} ${img.getAttribute("alt")}`); });
    rtm.attr(s, img, "alt", () => "x" + b.get());
    seen.length = 0;
    rtm.batch(() => { a.set(2); m.set(2); b.set(2); });
    expect(seen).toEqual(["/p2 x1"]);
    expect(`${img.getAttribute("src")} ${img.getAttribute("alt")}`).toBe("/p2 x2");
    s.dispose();
  });

  // Recovery is a post-flush step: a held row element comes back only after the keyed `<each>`
  // re-render of the same flush has updated the row's cells — written from the settled state
  // (while still out), then returned. Nothing is written to it while it is held.
  test("trap path: a held row img recovers after the flush settles — settled values, written before it returns", async () => {
    const r = await trace(`<program>
    type Row:struct = { id: int, i: int }
    let <label:string="L0"/>
    <xs:string[replace]=(["a", "b"])/>
    <rows:Row[replace]=([{ id: 1, i: 5 }])/>
    function go() { @label = "L1"; @rows = [{ id: 1, i: 0 }]; @xs = ["c"]; }
    function lab() { @label = "L2"; }
    <main>
        <button onclick=go()>go</button>
        <button onclick=lab()>lab</button>
        <ul id="u"><each in=@rows key=@.id as row><li><img id="m" alt=(@label) src=("/p" + @xs[row.i])/></li></each></ul>
    </main>
</program>
`, ["lab", "go"], () => $("#u").innerHTML);
    expect(r).toEqual({ codes: [], log: [
      "mount: <!--row--><li><!--trapped--></li><!--/row--><!--each-->",
      "lab: <!--row--><li><!--trapped--></li><!--/row--><!--each-->",
      "  set m.alt=L1 conn=false",
      "  set m.src=/pc conn=false",
      "  replace #comment->IMG",
      'go: <!--row--><li><img id="m" alt="L1" src="/pc"></li><!--/row--><!--each-->',
    ] });
  });

  // N2: a queued sibling disposed before it would have run no longer strands the element's value
  test("N2 runtime: a queued sibling writer disposed mid-flush — the element's new value is written", () => {
    document.body.innerHTML = '<div><img id="p"></div>';
    const img = $("#p");
    const s = new rtm.Scope(rtm.root);
    const s2 = s.child();
    const c = new rtm.Cell(1);
    rtm.attr(s, img, "src", () => "/p" + c.get());
    rtm.effect(s, () => { if (c.get() === 2) s2.dispose(); });
    rtm.attr(s2, img, "title", () => "t" + c.get());
    rtm.batch(() => c.set(2));
    expect(img.getAttribute("src")).toBe("/p2");
    expect(img.isConnected).toBe(true);
    s.dispose();
  });

  // N3: a `data-scrml-ns` template's view (svg / math content, unwrapped) is a fragment of the
  // template content's document — inert in a browser, like the HTML path's clone — never one made by
  // the live document, where an `<img>` written at the mount would load before `insert`. happy-dom
  // has no inert template documents (a template's content, and every fragment, belongs to the live
  // one), so this pins the mechanism: the view is the content's own (shallow) clone, and `insert`
  // adopts the subtree into the page with its namespaces.
  test("N3 runtime: an svg template's view is a clone of the template content, adopted on insert", () => {
    const SVG = "http://www.w3.org/2000/svg";
    document.body.innerHTML = '<template id="ns-t" data-scrml-ns="svg"><svg><foreignObject><img></foreignObject></svg></template><div id="host"></div>';
    const content = $("#ns-t").content;
    const clone = content.cloneNode.bind(content);
    const made = [];
    content.cloneNode = (deep) => { const c = clone(deep); made.push([deep, c]); return c; };
    const frag = rtm.template("ns-t");
    expect(made.length).toBe(1);
    expect(made[0][0]).toBe(false);
    expect(frag).toBe(made[0][1]);
    const fo = frag.firstChild;
    const img = fo.firstChild;
    const s = new rtm.Scope(rtm.root);
    rtm.attr(s, img, "src", () => "/x.png");
    rtm.insert(s, frag, rtm.mount($("#host")));
    expect(img.ownerDocument).toBe(document);
    expect(img.isConnected).toBe(true);
    expect(img.getAttribute("src")).toBe("/x.png");
    expect($("#host").firstChild).toBe(fo);
    expect(fo.namespaceURI).toBe(SVG);
    expect(fo.localName).toBe("foreignObject");
    s.dispose();
  });
});
