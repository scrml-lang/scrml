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

describe("S480 attr-hole: runtime, unit level", () => {
  const trap = (code = "E-INDEX-OUT-OF-RANGE-RT") => new rtm.ScrmlTrap(code, "trap (t.scrml:1)", {});

  test("while another attribute holds the element out, nothing is written to it; all are written before it returns", async () => {
    document.body.innerHTML = '<div id="w"><img id="p"></div>';
    const img = $("#p");
    const s = new rtm.Scope(rtm.root);
    const ok = new rtm.Cell(true);
    const src = new rtm.Cell("/a.png");
    const order = [];
    const reported = await withReports(async () => {
      rtm.attr(s, img, "referrerpolicy", () => { if (!ok.get()) throw trap(); return "no-referrer"; });
      rtm.attr(s, img, "src", () => src.get());
      expect(img.getAttribute("src")).toBe("/a.png");
      rtm.batch(() => ok.set(false));                                // referrerpolicy traps: the img leaves
      expect($("#p")).toBeNull();
      expect(img.hasAttribute("referrerpolicy")).toBe(false);
      rtm.batch(() => src.set("/b.png"));                            // not written while out (a detached img fetches)
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
