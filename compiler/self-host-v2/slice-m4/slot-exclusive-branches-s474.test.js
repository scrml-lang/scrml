// slot-exclusive-branches-s474.test.js — s474-slot-exclusive-branches: §66.15.2 rule 2 counts
// unnamed `<slot/>`s PER RENDER PATH (S474 F7, refines S473 D11).
//
// Ruling (user-voice-scrml.md S474 item 2): "**F7: one unnamed `<slot/>` per exclusive branch is
// legal.** Two unnamed slots in the two arms of an `if/else` (or exclusive `match` arms) count as
// one, because only one can render. Refines D11; non-exclusive duplicates stay an error."
//
// SPEC §66.15.2 "Exclusive branches": on every render path through a `renders`, at most one unnamed
// `<slot/>` SHALL render. The exclusive sets the bootstrap has are `if=` / `else-if=` / `else`
// chains (§17.1.1); block-form `<match>` and a lifting `${ if … }` are not in the bootstrap (their
// refusals are tested elsewhere), so the "match arms" positives are written as multi-member chains.
//
// Red on base (origin/main 34ebef81d): every positive below was E-COMPONENT-020 (a total count).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, click, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (src) => errs(src).map((d) => d.code);
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r.core;
};

// A declaration `<card mode:int>` whose `renders` is `renders`, and a use carrying content.
const CARD = (renders, use = "<card mode=1><b id=\"kid\">hi</b></card>") =>
  `<program>\n    <card mode:int/>\n    renders ${renders}\n    <main>${use}</main>\n</program>\n`;

describe("positive — one unnamed slot per exclusive branch compiles", () => {
  test("if / else: one slot in each arm", () => {
    expect(codes(CARD("<div><p if=(mode == 1)><slot/></p><p else><slot/></p></div>"))).toEqual([]);
  });

  test("an if / else-if / else chain (the bootstrap's match-arm shape): one slot in each member", () => {
    expect(codes(CARD("<div><p if=(mode == 1)><slot/></p><p else-if=(mode == 2)><slot/></p><p else><slot/></p></div>"))).toEqual([]);
  });

  test("a chain with no `else`: one slot in each member", () => {
    expect(codes(CARD("<div><p if=(mode == 1)><slot/></p><p else-if=(mode == 2)><slot/></p></div>"))).toEqual([]);
  });

  test("whitespace and a comment between members do not break the chain", () => {
    expect(codes(CARD("<div>\n        <p if=(mode == 1)><slot/></p>\n        // between\n        <p else><slot/></p>\n    </div>"))).toEqual([]);
  });

  test("nested: an if inside an arm, one slot in each inner branch", () => {
    const r = "<div><p if=(mode == 1)><slot/></p><div else><b if=(mode == 2)><slot/></b><i else><slot/></i></div></div>";
    expect(codes(CARD(r))).toEqual([]);
  });

  test("slots deeper inside the arms count the same", () => {
    expect(codes(CARD("<div><section if=(mode == 1)><div><span><slot/></span></div></section><section else><ul><li><slot/></li></ul></section></div>"))).toEqual([]);
  });

  test("a slot after a chain whose members hold none", () => {
    expect(codes(CARD("<div><p if=(mode == 1)>a</p><p else>b</p><slot/></div>"))).toEqual([]);
  });
});

describe("negative — non-exclusive duplicates stay E-COMPONENT-020", () => {
  test("two sibling slots", () => {
    const e = errs(CARD("<div><slot/><hr/><slot/></div>"));
    expect(e.map((d) => d.code)).toEqual(["E-COMPONENT-020"]);
    expect(e[0].message).toContain("render path");
  });

  test("a slot in a branch and a slot outside the chain (before it, and after it)", () => {
    expect(codes(CARD("<div><slot/><p if=(mode == 1)><slot/></p><p else>b</p></div>"))).toEqual(["E-COMPONENT-020"]);
    expect(codes(CARD("<div><p if=(mode == 1)><slot/></p><p else>b</p><slot/></div>"))).toEqual(["E-COMPONENT-020"]);
    // a slot in each arm AND one outside: both arm slots are second on their path
    expect(codes(CARD("<div><slot/><p if=(mode == 1)><slot/></p><p else><slot/></p></div>"))).toEqual(["E-COMPONENT-020", "E-COMPONENT-020"]);
  });

  test("two separate `if=` chains (both can be true)", () => {
    expect(codes(CARD("<div><p if=(mode == 1)><slot/></p><p if=(mode > 0)><slot/></p></div>"))).toEqual(["E-COMPONENT-020"]);
  });

  test("a non-element node between members ends the chain: the second `if=` opens a new one", () => {
    // `x` text between the two `if=` elements: two chains, both can render
    expect(codes(CARD("<div><p if=(mode == 1)><slot/></p>x<p if=(mode == 2)><slot/></p></div>"))).toEqual(["E-COMPONENT-020"]);
  });

  test("two slots inside ONE arm", () => {
    expect(codes(CARD("<div><p if=(mode == 1)><slot/><slot/></p><p else><slot/></p></div>"))).toEqual(["E-COMPONENT-020"]);
  });

  test("nested: a slot beside an inner chain whose branches each hold one", () => {
    const r = "<div><p if=(mode == 1)><slot/></p><div else><slot/><b if=(mode == 2)><slot/></b><i else><slot/></i></div></div>";
    expect(codes(CARD(r))).toEqual(["E-COMPONENT-020", "E-COMPONENT-020"]);
  });

  test("`show=` is not exclusive (the element is in the DOM either way)", () => {
    expect(codes(CARD("<div><p show=(mode == 1)><slot/></p><p show=(mode != 1)><slot/></p></div>"))).toEqual(["E-COMPONENT-020"]);
  });

  test("a slot in an `<each>` row renders once per row: E-COMPONENT-020 (was accepted on base)", () => {
    const src = `<program>\n    <card items:string[]/>\n    renders <ul><each in=items as it><li>\${it}<slot/></li></each></ul>\n    <main><card items=(["a", "b"])><b>hi</b></card></main>\n</program>\n`;
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-COMPONENT-020"]);
    expect(e[0].message).toContain("once per row");
    // an if / else inside the row does not make it count once
    const src2 = src.replace("<li>\${it}<slot/></li>", "<li if=(it == \"a\")><slot/></li><li else><slot/></li>");
    expect(codes(src2)).toEqual(["E-COMPONENT-020", "E-COMPONENT-020"]);
  });

  test("a slot lifted in a loop of the renders is still once-per-row (unchanged)", () => {
    const e = errs(CARD("<div>${ for (const x of [1, 2]) { lift <slot/>; } }</div>"));
    expect(e.map((d) => d.code)).toEqual(["E-COMPONENT-020"]);
    expect(e[0].message).toContain("once per row");
  });
});

// ---------------------------------------------------------------------------
// Runtime: the use-site children render into whichever branch's slot is live.
const RT = `<program>
    <card mode:int/>
    renders <div class="card">
        <p class="one" if=(mode == 1)>one:<slot/></p>
        <p class="two" else-if=(mode == 2)>two:<slot/></p>
        <p class="rest" else>rest:<slot/></p>
    </div>
    <main>
        <div id="a"><card mode=1><b>A</b></card></div>
        <div id="b"><card mode=2><b>B</b></card></div>
        <div id="c"><card mode=3><b>C</b></card></div>
    </main>
</program>
`;

describe("runtime — the children land in the live branch's slot, exactly once", () => {
  beforeAll(async () => { await loadProgram(clean(RT), "slot-branches-static"); }, { timeout: 60000 });

  test("mode 1 → the `if=` branch holds the children", () => {
    const a = document.querySelector("#a");
    expect(a.querySelectorAll("p").length).toBe(1);
    expect(a.querySelector("p.one").textContent).toBe("one:A");
    expect(a.querySelectorAll("b").length).toBe(1);
  });
  test("mode 2 → the `else-if=` branch", () => {
    const b = document.querySelector("#b");
    expect(b.querySelectorAll("p").length).toBe(1);
    expect(b.querySelector("p.two").textContent).toBe("two:B");
    expect(b.querySelectorAll("b").length).toBe(1);
  });
  test("mode 3 → the `else` branch", () => {
    const c = document.querySelector("#c");
    expect(c.querySelectorAll("p").length).toBe(1);
    expect(c.querySelector("p.rest").textContent).toBe("rest:C");
    expect(c.querySelectorAll("b").length).toBe(1);
  });
});

// A per-instance toggle: the branch flips at runtime and the children move with it.
const RT2 = `<program>
    <box label:string>
        export let <alt:bool=false/>
    </>
    renders <div class="box">
        <button class="flip" onclick=(@box.alt = !alt)>flip</button>
        <section class="main" if=(!alt)>main:<slot/></section>
        <section class="other" else>other:<slot/></section>
    </div>
    let <n:int=0/>
    function bump() { @n = @n + 1; }
    <main><box label="x"><b class="kid">K\${@n}</b></box></main>
</program>
`;

describe("runtime — toggling the branch moves the children to the newly live slot", () => {
  let program;
  beforeAll(async () => { ({ program } = await loadProgram(clean(RT2), "slot-branches-toggle", ["bump"])); }, { timeout: 60000 });

  const sections = () => [...document.querySelectorAll("main section")];
  test("initial: the `if=` branch", () => {
    expect(sections().map((s) => s.className)).toEqual(["main"]);
    expect(sections()[0].textContent).toBe("main:K0");
    expect(document.querySelectorAll("b.kid").length).toBe(1);
  });
  test("flip → the `else` branch holds the children, once", () => {
    click(document.querySelector("button.flip"));
    expect(sections().map((s) => s.className)).toEqual(["other"]);
    expect(sections()[0].textContent).toBe("other:K0");
    expect(document.querySelectorAll("b.kid").length).toBe(1);
  });
  test("the children stay reactive in the new branch", () => {
    program.bump();
    expect(sections()[0].textContent).toBe("other:K1");
  });
  test("flip back → the `if=` branch again", () => {
    click(document.querySelector("button.flip"));
    expect(sections().map((s) => s.className)).toEqual(["main"]);
    expect(sections()[0].textContent).toBe("main:K1");
    expect(document.querySelectorAll("b.kid").length).toBe(1);
  });
});
