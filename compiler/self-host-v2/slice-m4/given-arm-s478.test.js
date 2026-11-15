// given-arm-s478.test.js — s478 (lane s478-boot-parser-smalls, triage cluster C6): the
// soft-deprecated `given x :>` match arm and the markup-`${}` `given` guard (SPEC §42.2.3,
// §63.1 Stage 1) in the bootstrap.
//
// §42.2.3: the in-place guard "— `given x :> { … }`, the multi-name `given x, y :> { … }`, the same
// guard inside a markup `${ … }`, and the `given x :>` match arm — is soft-deprecated. It is NOT
// removed: during the window it parses, lowers and runs exactly as this section states, and every
// site surfaces W-GIVEN-PRESENCE-DEPRECATED"; canonical: "`match x { not :> A  given x :> B }` →
// `match x { not :> A  else :> B }`". The head rule: "A `given` head SHALL be `given` followed by
// an identifier-list and then the separator `:>` … Any other head SHALL be compile error
// E-SYNTAX-044, in logic and markup-`${}` contexts alike"; the rebind head is E-SYNTAX-045; "A
// refused head is the site's one diagnostic".
//
// Before s478 the bootstrap read `given` as an arm pattern and refused it (E-PARSE-ARM ×2 +
// E-MATCH-ARM-SEPARATOR), and a markup `${ given … }` as an expression (E-PARSE-EXPECTED /
// E-PARSE-TRAILING / E-PARSE-UNCLOSED).
//
// The bootstrap builds the arm `scrml fix` rewrites — the LAST arm, after a `not :>` arm, naming
// the subject itself — as that `else :>` arm. A `given` arm anywhere else is a presence guard
// between patterns, and a well-formed markup guard a guarded markup body; neither is built
// (E-BOOTSTRAP-UNSUPPORTED, by name — INTERIM, gap g-boot-given-guard-arm-unbuilt-s478).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

// The shared prelude declares cells (`@a` `@b` `@c` `@v`) that not every test reads; the
// unread-cell warning E-DG-002 is not this file's subject, so it is dropped here.
const run = (src) => {
  const r = frontEnd(mods, [{ path: "t.scrml", src }]);
  return { ...r, diags: r.diags.filter((d) => d.code !== "E-DG-002") };
};
const codes = (src) => run(src).diags.map((d) => d.code);
const $ = (sel) => document.querySelector(sel);

const P = (fns, markup) =>
  `<program>\n    let <a:string="unset"/>\n    let <b:string="unset"/>\n    let <c:string="unset"/>\n    let <v:int=0/>\n    type K:enum = { A, B }\n${fns}\n    <main>\n${markup}\n    </main>\n</program>\n`;

const GREET = `    function greet(name: string | not) -> string {\n        return match name {\n            not :> "nobody",\n            given name :> "hello " + name\n        };\n    }`;

describe("§42.2.3 — the `given x :>` arm after `not :>`, naming the subject, reads as `else :>`", () => {
  test("one W-GIVEN-PRESENCE-DEPRECATED (Info) and nothing else; the span is the head", () => {
    const src = P(GREET, `        <p id="o">\${greet("ada")}</p>`);
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["W-GIVEN-PRESENCE-DEPRECATED"]);
    const [d] = r.diags;
    expect(d.severity).toBe("Info");
    expect(src.slice(d.span.start, d.span.end)).toBe("given name :>");
    expect(d.message).toContain("else :>");
    expect(d.message).toContain("scrml fix");
    expect(d.message).toContain("§42.2.3");
  });

  test("the canonical `else :>` draws no code — the twin of the arm", () => {
    const src = P(GREET.replace("given name :>", "else :>"), `        <p id="o">\${greet("ada")}</p>`);
    expect(codes(src)).toEqual([]);
  });

  test("runs as `else :>`: value, return and statement position; present and absent", async () => {
    const fns = `${GREET}
    function stmt(v: int | not) -> int {
        match v {
            not :> { return 1; },
            given v :> { return 2; }
        }
        return 3;
    }
    function go() {
        @a = greet("al");
        @b = greet(not);
        const p = stmt(5);
        const q = stmt(not);
        @c = \`\${p}\${q}\`;
    }`;
    const src = P(fns, `        <button id="go" onclick=go()>go</button>\n        <p id="a">\${@a}</p>\n        <p id="b">\${@b}</p>\n        <p id="c">\${@c}</p>`);
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["W-GIVEN-PRESENCE-DEPRECATED", "W-GIVEN-PRESENCE-DEPRECATED"]);
    expect(mods.check.checkCore(r.core)).toEqual([]);
    await loadProgram(r.core, "given-arm-s478");
    click($("#go"));
    expect($("#a").textContent).toBe("hello al");
    expect($("#b").textContent).toBe("nobody");
    expect($("#c").textContent).toBe("21");
  });

  test("the legacy `->` separator on the arm is accepted (§42.2.3: on a `given` ARM `->` is the §18.2 alias)", () => {
    const src = P(`    function greet(name: string | not) -> string {\n        return match name {\n            not -> "nobody",\n            given name -> "hello " + name\n        };\n    }`, `        <p>\${greet("x")}</p>`);
    const cs = codes(src);
    expect(cs.filter((c) => c.startsWith("E-"))).toEqual([]);
    expect(cs.filter((c) => c === "W-GIVEN-PRESENCE-DEPRECATED").length).toBe(1);
  });

  // s478 r1 (review LOW-1): the deprecation is the site's one diagnostic — no W-MATCH-ARROW-LEGACY
  for (const sep of ["=>", "->"]) {
    test(`\`given x ${sep}\` as the last arm: W-GIVEN-PRESENCE-DEPRECATED alone`, () => {
      const src = P(`    function greet(name: string | not) -> string {\n        return match name {\n            not :> "nobody",\n            given name ${sep} "hello " + name\n        };\n    }`, `        <p>\${greet("x")}</p>`);
      expect(codes(src)).toEqual(["W-GIVEN-PRESENCE-DEPRECATED"]);
    });
  }

  test("`given :>` is still a bare binder named `given`, not a presence arm", () => {
    const src = P(`    function f(k: K) -> int {\n        return match k {\n            .A :> 1,\n            given :> 2\n        };\n    }`, `        <p>\${f(.A)}</p>`);
    expect(codes(src)).not.toContain("W-GIVEN-PRESENCE-DEPRECATED");
    expect(codes(src)).not.toContain("E-SYNTAX-044");
  });
});

describe("§42.2.3 — a malformed `given` arm head is E-SYNTAX-044 / E-SYNTAX-045, the site's one diagnostic", () => {
  const arm = (head) => P(`    function go() {\n        let n: int | not = 5;\n        let cc = 1;\n        @v = match K.A {\n            ${head} :> 1,\n            .A :> 2,\n            .B :> 3\n        };\n    }`, `        <button onclick=go()>go</button>`);

  for (const [head, code] of [["given cc.x", "E-SYNTAX-044"], ["given f(n)", "E-SYNTAX-044"], ["given n < 0", "E-SYNTAX-044"], ["given (cc)", "E-SYNTAX-044"], ["given n = 3", "E-SYNTAX-045"]]) {
    test(`\`${head} :>\` → ${code} alone`, () => {
      expect(codes(arm(head))).toEqual([code]);
    });
  }

  // s478 r1 (review LOW-2): "A refused head is the site's one diagnostic" — no coverage or type cascade
  test("a malformed head over a `T | not` subject: E-SYNTAX-044 alone (no W-MATCH-002 / E-TYPE-031)", () => {
    const src = P(`    function f(x: int | not) -> string {\n        return match x {\n            given (x) :> "some",\n            not :> "none"\n        };\n    }`, `        <p>\${f(1)}</p>`);
    expect(codes(src)).toEqual(["E-SYNTAX-044"]);
  });

  test("a head with no separator → E-SYNTAX-044 alone", () => {
    expect(codes(arm("given n").replace("given n :> 1", "given n { 1 }"))).toEqual(["E-SYNTAX-044"]);
  });
});

describe("a `given` arm the bootstrap does not build is refused by name (INTERIM)", () => {
  const only = (src) => expect(codes(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);

  test("a guard arm between patterns (first arm, not the subject)", () => {
    only(P(`    function go() {\n        let n: int | not = 5;\n        @v = match K.A {\n            given n :> 1,\n            .A :> 2,\n            .B :> 3\n        };\n    }`, `        <button onclick=go()>go</button>`));
  });

  // s478 r1 (review LOW-2): the refused arm's body (whose names the head never narrowed) is not typed
  test("a refused guard arm's body reports nothing more (no E-OPERAND-NOT-NARROWED)", () => {
    only(P(`    function f(x: int | not, y: int | not) -> int {\n        return match x {\n            not :> 0,\n            given y :> y + 1\n        };\n    }`, `        <p>\${f(1, 2)}</p>`));
  });

  // s478 r1 (review MED-1): a later head name may be a cell, as the first may
  test("a multi-name arm head with a cell (`given x, @c :>`) is refused by name", () => {
    only(P(`    function f(x: int | not) -> string {\n        return match x {\n            not :> "none",\n            given x, @c :> "some"\n        };\n    }`, `        <p>\${f(1)}</p>`));
  });

  test("the subject's arm with no `not :>` arm before it", () => {
    only(P(`    function f(name: string | not) -> string {\n        return match name {\n            given name :> "y",\n            not :> "n"\n        };\n    }`, `        <p>\${f("x")}</p>`));
  });
});

describe("§42.2.3 — the markup-`${}` `given` guard", () => {
  const M = (body) => P("", `        ${body}`);

  test("a comparison head → E-SYNTAX-044, exactly once, no W-GIVEN-PRESENCE-DEPRECATED", () => {
    expect(codes(M(`\${ given @v > 0 :> { <p id="pos">positive</p> } }`))).toEqual(["E-SYNTAX-044"]);
  });

  test("a rebind head → E-SYNTAX-045 alone", () => {
    expect(codes(M(`\${ given x = @a :> { <p>x</p> } }`))).toEqual(["E-SYNTAX-045"]);
  });

  test("a body that is not a block → E-SYNTAX-044 alone", () => {
    expect(codes(M(`\${ given @a :> "x" }`))).toEqual(["E-SYNTAX-044"]);
  });

  test("a well-formed guard is refused by name; the markup after it still parses", () => {
    const r = run(M(`\${ given @a :> { <p>"it's"</p> } }\n        <p id="after">\${@b}</p>`));
    expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("is given");
  });

  test("a multi-cell guard (`given @a, @b :>`) is refused by name, alone (review MED-1)", () => {
    const r = run(M(`\${ given @a, @b :> { <p>x</p> } }`));
    expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("`given` as a value (a call, a lone read) is untouched", () => {
    expect(codes(M(`\${ given(1) }`))).not.toContain("E-SYNTAX-044");
  });
});
