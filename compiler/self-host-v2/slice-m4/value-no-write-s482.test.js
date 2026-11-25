// value-no-write-s482.test.js — lane s482-value-no-write.
//
// RULED S482, ruling:user-voice-scrml.md-S482-runorder-model-c ("yes, adopt (c) with the riders"), adopting
// the S482 run-order study (~/.cache/scrml/review/s482-runorder-study/study.md):
//   A1 (PERMANENT) — §6.15 widened: a value position SHALL NOT write a reactive cell OR a file-scope `let`
//      (the binding, a part / position, a tape edit), directly or through calls; a file-scope initializer
//      with no single place (inside `if=` / `else` / slot / `<match>` content, a component body, an RCDATA
//      element) is a value position — E-VALUE-WRITES-STATE.
//   A2 (PERMANENT) — the body spine is setup: body-top statements, file-scope initializers at their place,
//      load-phase code may write (S481 P1–P3, S479 `tick()`).
//   A3 (PERMANENT) — a derived formula may not read a file-scope `let` that code writes —
//      E-DERIVED-READS-UNTRACKED.
//   Riders: Q5 — a runtime `^{}` inside a construct is a value position (may not write an enclosing `let`);
//      Q13 — a locked field's initializer that writes is E-VALUE-WRITES-STATE.
// The INTERIM construct write-side enumeration (g-boot-construct-seed-bound-s482 — this file replaces
// cell-seed-bound-s482.test.js, which pinned it) is deleted; the one write route left is a `<request>`'s
// first load in the body (g-boot-request-runs-in-body-s482): INTERIM g-boot-construct-request-write-s482.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-value-no-write-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
async function result(src, lib) {
  const d = join(dir, `p${n++}`);
  mkdirSync(d);
  if (lib !== undefined) writeFileSync(join(d, "lib.scrml"), lib);
  const file = join(d, "main.scrml");
  writeFileSync(file, src);
  return await compileSource(file);
}
async function errors(src, lib) {
  return (await result(src, lib)).diagnostics.filter((d) => d.severity === "error");
}
async function codes(src, lib) {
  return (await errors(src, lib)).map((d) => d.code);
}
async function texts(src, ids, lib) {
  const res = await result(src, lib);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.map((d) => d.code + " " + d.message).join("; "));
  const run = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return ids.map((id) => String(run.body.querySelector("#" + id)?.textContent ?? "<none>"));
}

const PRE = `\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
\${ function bumps() -> string { n = 5; return "s"; } }
\${ function inc(x: int) -> int { return x + 2; } }
`;
const W = "E-VALUE-WRITES-STATE";

describe("A1 — a value position may not write a file-scope `let`", () => {
  test("a cell's seed (direct call), named with the chain and the fix", async () => {
    const d = await errors(`<program>\n${PRE}let <c:int=(bump())/>\n<p>\${@c}</p>\n</program>\n`);
    expect(d.map((x) => x.code)).toEqual([W]);
    expect(d[0].message).toContain("the initializer of `@c` calls `bump()`, which writes `n`, a file-scope `let`: `bump() → n`");
    expect(d[0].message).toContain("Move the write to a body-top statement");
    expect(d[0].message).toContain("or make `n` a cell");
  }, 120000);

  test("through a chain of calls", async () => {
    const d = await errors(`<program>\n${PRE}\${ function outer() -> int { return bump() + 1; } }\nlet <c:int=(outer())/>\n<p>\${@c}</p>\n</program>\n`);
    expect(d.map((x) => x.code)).toEqual([W]);
    expect(d[0].message).toContain("`outer() → bump() → n`");
  }, 120000);

  test("an interpolation, an attribute value, an `if=` test", async () => {
    expect(await codes(`<program>\n${PRE}<p>\${bump()}</p>\n</program>\n`)).toEqual([W]);
    expect(await codes(`<program>\n${PRE}<p class=(bumps())>x</p>\n</program>\n`)).toEqual([W]);
    expect(await codes(`<program>\n${PRE}<p if=(bump() > 0)>x</p>\n</program>\n`)).toEqual([W]);
  }, 120000);

  test("a part write and a tape edit, through calls", async () => {
    expect(await codes(`<program>
\${ let o: int[free, write] = [1]; }
\${ function setp() -> int { o[0] = 10; return 0; } }
<p>\${setp()}</p>
</program>
`)).toEqual([W]);
    expect(await codes(`<program>
\${ let xs: int[free, append] = []; }
\${ function add() -> int { xs.append(1); return 0; } }
let <c:int=(add())/>
<p>\${@c}</p>
</program>
`)).toEqual([W]);
  }, 120000);

  test("a function value handed on counts as called (§6.7.4 rule 3)", async () => {
    const d = await errors(`<program>\n${PRE}\${ function apply(f: () -> int) -> int { return 0; } }\n<p>\${apply(bump)}</p>\n</program>\n`);
    expect(d.map((x) => x.code)).toContain(W);
  }, 120000);

  test("Q13 rider: a locked field's initializer that writes is refused (not derived)", async () => {
    const d = await errors(`${PRE}<card t:string="x">
    <v:int=(bump())/>
</> renders <b>\${v}</b>
<program>
<card/>
</program>
`);
    expect(d.map((x) => x.code)).toEqual([W]);
    // s482 r1 (#2096 review LOW-1): Q13 — derived iff it reads a cell; `bump()` reads none (directly or
    // through its calls), so the position is named as an initializer, not "the formula of derived"
    expect(d[0].message).toContain("the initializer of locked field `@card.v` calls `bump()`, which writes `n`");
    expect(d[0].message).not.toContain("formula of derived");
  }, 120000);

  test("LOW-1: a component prop default that writes is named as a default (a/fn26)", async () => {
    const d = await errors(`${PRE}<program>
<cp v:int=(bump())>
</> renders <span>\${v}</span>
<cp/>
<p id="o">\${n}</p>
</program>
`);
    expect(d.map((x) => x.code)).toEqual([W]);
    expect(d[0].message).toContain("the default of prop `@cp.v` calls `bump()`, which writes `n`");
  }, 120000);

  test("a component's renders and a use-site value", async () => {
    expect(await codes(`${PRE}<card t:string="x">
</> renders <b>\${bump()}</b>
<program>
<card/>
</program>
`)).toEqual([W]);
    expect(await codes(`${PRE}<card t:int=0>
</> renders <b>\${t}</b>
<program>
<card t=(bump())/>
</program>
`)).toEqual([W]);
  }, 120000);

  test("an imported cell's seed writes the importing module's `let` (the old x15 shape)", async () => {
    const lib = `\${ export let n: int = 1; }
\${ export function bump() -> int { n = 5; return 0; } }
export let <z:int=(bump())/>
`;
    expect(await codes(`\${ import { n, z } from "./lib.scrml"; }
<program>
<p>\${@z} \${n}</p>
</program>
`, lib)).toEqual([W]);
  }, 120000);
});

describe("A1 — code with no single place is a value position (§6.15 item 4, §7.6 R3)", () => {
  test("a file-scope initializer inside `if=` content that writes", async () => {
    const d = await errors(`<program>\n${PRE}<div if=(true)>\${ const k: int = bump(); }<p>\${k}</p></div>\n</program>\n`);
    expect(d.map((x) => x.code)).toEqual([W]);
    expect(d[0].message).toContain("the initializer of `const k`, written inside the content of an `if=` element");
  }, 120000);

  test("newly accepting: an initializer there that CALLS a function writing nothing runs just before the construct", async () => {
    const src = `<program>\n${PRE}\${ n = 5; }\n<div if=(true)>\${ const k: int = inc(n); }<p id="o">\${k}</p></div>\n</program>\n`;
    expect(await codes(src)).toEqual([]);
    expect(await texts(src, ["o"])).toEqual(["7"]);
  }, 120000);

  test("a `?{}` query or a foreign block there still acts (E-FILE-SCOPE-INIT-IN-CONSTRUCT is kept for them)", async () => {
    const d = await errors(`<program>
let <f:boolean=true/>
<div if=(@f)>\${ const k: int = _={ 1 }=; }<p>\${k}</p></div>
</program>
`);
    expect(d.map((x) => x.code)).toContain("E-FILE-SCOPE-INIT-IN-CONSTRUCT");
  }, 120000);

  test("Q5 rider: a runtime `^{}` inside a construct that writes an enclosing `let` (#2092 probe mc.scrml)", async () => {
    const d = await errors(`<program>
let <out:int=0/>
let <show:boolean=true/>
\${ let n: int = 1; }
<div if=(@show)>^{ n = n + 4; }</div>
\${ @out = n; }
<p id="out">\${@out}</p>
</program>
`);
    expect(d.map((x) => x.code)).toEqual([W]);
    expect(d[0].message).toContain("the runtime `^{ }` block inside the content of an `if=` element");
  }, 120000);

  test("A2 / Q5 rider: a runtime `^{}` at a spine place may write an enclosing `let`", async () => {
    const src = `<program>
let <out:int=0/>
\${ let n: int = 1; }
<div>^{ n = n + 4; }</div>
\${ @out = n; }
<p id="out">\${@out}</p>
</program>
`;
    expect(await codes(src)).toEqual([]);
    expect(await texts(src, ["out"])).toEqual(["5"]);
  }, 120000);

  test("the retired INTERIM shape: a writing seed declared after the construct is refused at the seed, not at the reader", async () => {
    const d = await errors(`<program>\n${PRE}<div if=(true)>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>\nlet <z:int=(bump())/>\n<p>\${@z}</p>\n</program>\n`);
    expect(d.map((x) => x.code)).toEqual([W]);
    expect(d[0].message).toContain("the initializer of `@z`");
  }, 120000);

  test("a `<*field/>` state body, a viewed field's seed, a shared instance's seed: each refused where it writes", async () => {
    expect(await codes(`<program>
${PRE}    type Phase:enum = { Idle, Loading }
    <div if=(true)><span><*phase/></span>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
    let <phase:Phase=.Idle>
        <Idle rule=.Loading>
            <b>\${bump()}</b>
        </>
        <Loading rule=.Idle : "Loading">
    </>
</program>
`)).toEqual([W]);
    expect(await codes(`${PRE}<program>
    <signup note:string="n">
        <v:int=(bump())/>
    </> renders <b>\${@signup.v}</b>
    <div if=(true)><*signup/>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
</program>
`)).toEqual([W]);
  }, 120000);

  test("an `<errors>` before the initializer no longer fails closed over body writes (k = 1, the source order)", async () => {
    const src = `<program>
\${ let n: int = 1; }
let <e:string="" length(>2)/>
<div if=(true)><errors of=@e/>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
\${ n = 5; }
<p id="o2">\${n}</p>
</program>
`;
    expect(await codes(src)).toEqual([]);
    expect(await texts(src, ["o", "o2"])).toEqual(["1", "5"]);
  }, 120000);
});

describe("INTERIM (g-boot-construct-request-write-s482): a `<request>` there runs its first load in the body", () => {
  const cases = [
    ["r03 (body `@r = srv(bump())`)", `    server function srv(a: int) -> string { return "x"; }
    let <r:string=""/>
    <div if=(true)><request id="rq" deps=[]>\${ @r = srv(bump()); }</>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
`],
    ["r06 (no deps, body `@r = bump()`)", `    let <r:int=0/>
    <div if=(true)><request id="rq">\${ @r = bump(); }</><b>\${@r}</b>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
`],
  ];
  for (const [name, body] of cases) {
    test(name + " refused at the reader", async () => {
      const d = await errors(PRE + "<program>\n" + body + "</program>\n");
      expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
      expect(d[0].message).toContain("the initializer of `const k` reads `n`, which a `<request>` inside");
      expect(d[0].message).toContain("g-boot-construct-request-write-s482");
    }, 120000);
  }

  // s482 r1 (#2096 review HIGH-1): the read side follows calls — what a function the initializer calls
  // reads, at any depth, counts (base refused these as "acting"; head before r1 showed `#o` = 1 in Chromium,
  // source order gives 5).
  const RQ = `    let <r:int=0/>
    \${ function rd() -> int { return n; } }
    \${ function rd2() -> int { return rd() + 0; } }
`;
  const viaCalls = [
    ["q01 (`const k = rd() + 0`)", `    <div if=(true)><request id="rq">\${ @r = bump(); }</request>\${ const k: int = rd() + 0; }<p id="o">\${k}</p></div>
`, "`n` (through `rd()`, which reads it: `rd() → n`)"],
    ["t08 (in a nested `<span>`)", `    <div if=(true)><request id="rq">\${ @r = bump(); }</request><span>\${ const k: int = rd() + 0; }<b id="o">\${k}</b></span></div>
`, "`n` (through `rd()`"],
    ["t09 (`rd2() → rd() → n`)", `    <div if=(true)><request id="rq">\${ @r = bump(); }</request>\${ const k: int = rd2(); }<p id="o">\${k}</p></div>
`, "`n` (through `rd2()`, which reads it: `rd2() → rd() → n`)"],
    ["t10 (an `else` branch)", `    let <f:boolean=false/>
    <p if=(@f)>a</p>
    <div else><request id="rq">\${ @r = bump(); }</request>\${ const k: int = rd(); }<p id="o">\${k}</p></div>
`, "`n` (through `rd()`"],
  ];
  for (const [name, body, how] of viaCalls) {
    test("HIGH-1 " + name + ": a read through a call is refused at the reader", async () => {
      const d = await errors(PRE + "<program>\n" + RQ + body + "</program>\n");
      expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
      expect(d[0].message).toContain("the initializer of `const k` reads " + how);
    }, 120000);
  }

  test("HIGH-1: a cell the request writes, read through a call, is refused too", async () => {
    const d = await errors(PRE + `<program>
    let <r:int=0/>
    \${ function rdc() -> int { return @r; } }
    <div if=(true)><request id="rq">\${ @r = bump(); }</request>\${ const k: int = rdc() + 0; }<p id="o">\${k}</p></div>
</program>
`);
    const c = d.find((x) => x.code === "E-FILE-SCOPE-INIT-IN-CONSTRUCT");
    expect(c?.message).toContain("reads `@r` (through `rdc()`, which reads it: `rdc() → @r`)");
  }, 120000);

  test("HIGH-1 positive twin: the called function reads a `let` the request does NOT write — compiles, k = 3", async () => {
    expect(await texts(PRE + `<program>
    let <r:int=0/>
    \${ let m: int = 3; }
    \${ function rdm() -> int { return m; } }
    <div if=(true)><request id="rq">\${ @r = bump(); }</request>\${ const k: int = rdm() + 0; }<p id="o">\${k}</p></div>
</program>
`, ["o"])).toEqual(["3"]);
  }, 120000);

  // s482 r2 (#2096 r1 review LOW-1): the read scan does not follow a function value or a `match` written in
  // the initializer, so it fails closed on one (h31 / h06). g-boot-file-scope-init-residue-s479 refuses these
  // too today (E-BOOTSTRAP-UNSUPPORTED); this refusal is what keeps them closed when that INTERIM lifts.
  const opaque = [
    ["h31 (a lambda: `xs.map(x => x + rd())`)", `    \${ const xs: int[] = [1]; }
    <div if=(true)><request id="rq" deps=[]>\${ @r = bump(); }</request>\${ const k: string = xs.map(x => x + rd()).join(","); }<p id="o">\${k}</p></div>
`, "a function value"],
    ["h06 (`match` arms)", `    \${ function z() -> int { return 0; } }
    <div if=(true)><request id="rq" deps=[]>\${ @r = bump(); }</request>\${ const k: int = match (1) { 1 => rd(), _ => z() }; }<p id="o">\${k}</p></div>
`, "a `match` or a handling form"],
  ];
  for (const [name, body, what] of opaque) {
    test("LOW-1 " + name + ": fails closed with E-FILE-SCOPE-INIT-IN-CONSTRUCT", async () => {
      const d = await errors(PRE + "<program>\n" + RQ + body + "</program>\n");
      const c = d.find((x) => x.code === "E-FILE-SCOPE-INIT-IN-CONSTRUCT");
      expect(c?.message).toContain("the initializer of `const k` reads what " + what + " in it reads (the bootstrap does not follow the reads inside one here, so it fails closed)");
    }, 120000);
  }

  test("r01 / r02 (the request reads a later cell whose seed writes): refused at the seed", async () => {
    expect(await codes(PRE + `<program>
    let <r:string=""/>
    <div if=(true)><request id="rq" deps=[]>\${ @r = @s; }</>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
    let <s:string=(bumps())/>
</program>
`)).toEqual([W]);
  }, 120000);

  test("an `<effect>` body that writes is not counted (it does not run at the mount)", async () => {
    expect(await texts(PRE + `<program>
    let <z:int=0/>
    <div if=(true)><effect deps=[@z]>\${ n = 5; }</effect>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
</program>
`, ["o"])).toEqual(["1"]);
  }, 120000);
});

describe("A2 — the body spine is setup and may write", () => {
  test("S481 P1: an unread spine initializer that calls a writer runs", async () => {
    const src = `<program>\n${PRE}\${ const unused: int = bump(); }\n<p id="o">\${n}</p>\n</program>\n`;
    expect(await codes(src)).toEqual([]);
    expect(await texts(src, ["o"])).toEqual(["5"]);
  }, 120000);

  test("S479 tick(): a counter read by spine initializers, in source order", async () => {
    const src = `<program>
\${ let c: int = 0; }
\${ function tick() -> int { c = c + 1; return c; } }
\${ const a: int = tick(); }
\${ const b: int = tick(); }
<p id="o">\${a} \${b} \${c}</p>
</program>
`;
    expect(await codes(src)).toEqual([]);
    expect(await texts(src, ["o"])).toEqual(["1 2 2"]);
  }, 120000);

  test("a body-top statement, a handler and an effect body may write", async () => {
    const src = `<program>
${PRE}\${ bump(); }
let <z:int=0/>
<effect deps=[@z]>\${ n = 9; }</>
<button id="b" onclick=bump()>+</button>
<p id="o">\${n}</p>
</program>
`;
    expect(await codes(src)).toEqual([]);
    expect(await texts(src, ["o"])).toEqual(["5"]);
  }, 120000);

  test("a spine initializer inside a plain element is at its place (not a construct)", async () => {
    const src = `<program>\n${PRE}<div><span>\${ const a: int = bump(); }</span></div>\n<p id="o">\${n}</p>\n</program>\n`;
    expect(await codes(src)).toEqual([]);
    expect(await texts(src, ["o"])).toEqual(["5"]);
  }, 120000);

  test("load phase: an imported module's initializer may write its own `let`", async () => {
    const lib = `\${ export let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
\${ export const ran: int = bump(); }
`;
    const src = `\${ import { n, ran } from "./lib.scrml"; }
<program>
<p id="o">\${n} \${ran}</p>
</program>
`;
    expect(await codes(src, lib)).toEqual([]);
    expect(await texts(src, ["o"], lib)).toEqual(["5 0"]);
  }, 120000);
});

describe("A3 — E-DERIVED-READS-UNTRACKED", () => {
  test("a derived formula reading a `let` a body-top statement writes", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
<s:int=100/>
<dd:int=(@s + n)/>
\${ n = 10; }
<p>\${@dd}</p>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-DERIVED-READS-UNTRACKED"]);
    expect(d[0].message).toContain("the formula of derived `@dd` reads `n`");
    expect(d[0].message).toContain("Make `n` a cell");
  }, 120000);

  test("through a function, the `let` written only by a handler", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function getn() -> int { return n; } }
<s:int=100/>
<dd:int=(@s + getn())/>
<button onclick={ n = n + 1; }>+</button>
<p>\${@dd}</p>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-DERIVED-READS-UNTRACKED"]);
    expect(d[0].message).toContain("calls `getn()`, which reads `n`");
  }, 120000);

  // s482 r2 (#2096 r1 review MED-1): A3 governs a DERIVED formula only. A prop default / locked field
  // initializer that reads no cell, directly or through the functions it calls, is not derived (Q13: "the
  // derived-iff-reads-a-cell half stands"), so reading a written `let` through a call is legal there, as the
  // direct form `(n + 1)` already was. Probes h08 / l01 (base: compiles, `#o` = 5 in Chromium).
  test("MED-1 h08: a prop default reading a written `let` through a call compiles — 5 (the request ran first)", async () => {
    expect(await texts(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
\${ function rd() -> int { return n; } }
let <r:int=0/>
<cp v:int=(rd())>
</> renders <p id="o">\${v}</p>
<request id="rq" deps=[]>\${ @r = bump(); }</request><cp/>
</program>
`, ["o"])).toEqual(["5"]);
  }, 120000);

  test("MED-1 l01: a locked field initializer reading a written `let` through a call compiles — 2", async () => {
    expect(await texts(`\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
\${ function rd() -> int { return n; } }
<card t:string="x">
    <v:int=(rd() + 1)/>
</> renders <b id="o">\${v}</b>
<program>
<card/>
<button id="b" onclick={ bump(); }>b</button>
</program>
`, ["o"])).toEqual(["2"]);
  }, 120000);

  test("MED-1 twin: a prop default whose call reaches a cell IS derived — still E-DERIVED-READS-UNTRACKED", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
<x:int=1/>
\${ function rx() -> int { return @x + n; } }
<cp v:int=(rx())>
</> renders <p id="o">\${v}</p>
<cp/>
<button onclick={ n = n + 1; }>+</button>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-DERIVED-READS-UNTRACKED"]);
    expect(d[0].message).toContain("the formula of derived `@cp.v` calls `rx()`, which reads `n`");
  }, 120000);

  test("legal: a `let` nothing writes (a constant in effect), and a seed (not derived) reading a written `let`", async () => {
    const src = `<program>
\${ let n: int = 1; }
\${ let m: int = 3; }
<s:int=100/>
<dd:int=(@s + m)/>
\${ n = 10; }
let <c:int=(n + 0)/>
<p id="o">\${@dd} \${@c}</p>
</program>
`;
    expect(await codes(src)).toEqual([]);
    expect(await texts(src, ["o"])).toEqual(["103 10"]);
  }, 120000);
});
