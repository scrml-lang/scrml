// cell-seed-bound-s482.test.js — lane s482-place-fu (#2079 review LOW-1; #2082 reviews r0–r2).
//
// §7.6 rule (b) S482 (s482-construct-init-fu): a non-acting file-scope initializer inside a construct
// runs just before it; a read of what code INSIDE the construct writes before the initializer is
// E-FILE-SCOPE-INIT-IN-CONSTRUCT. analyze constructWrites counts the seed of EVERY program cell whose
// place is at or after the construct's start (base's fail-closed rule).
//
// Item 2 of this lane bounded that set (a seed counted only when something there ran it, `used`), so a
// cell declared AFTER the construct with a writing seed (`let <z:int=(bump())/>`) compiled. Three
// review rounds in a row then found a seed the bounded set missed — a `bind:` (#2082 HIGH-1), a
// `<*x/>` state body (r1 HIGH-2), the viewed field's own seed (r2 HIGH-3) — each a silent wrong value.
// s482 r3 (pa-ruled): back to base's rule. The after-construct shape is refused again — an INTERIM
// over-refusal, gap g-boot-construct-seed-bound-s482 (capable alternative: a bounded set PROVEN
// complete). The r3 additions pin the r2 review's HIGH-3 / MED-2 (`<*x/>`) and HIGH-4 / MED-3
// (`<request>` runs at the mount, §6.7.7.3) shapes as refusals.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-seed-bound-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
async function result(src) {
  const file = join(dir, `app${n++}.scrml`);
  writeFileSync(file, src);
  return await compileSource(file);
}
async function errors(src) {
  return (await result(src)).diagnostics.filter((d) => d.severity === "error");
}
async function texts(src, ids) {
  const res = await result(src);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.map((d) => d.code + " " + d.message).join("; "));
  const run = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return ids.map((id) => String(run.body.querySelector("#" + id)?.textContent ?? "<none>"));
}

describe("every cell seed placed at or after the construct's start counts (base's rule, s482 r3)", () => {
  // INTERIM over-refusal (g-boot-construct-seed-bound-s482): source order gives k = 1 here, but the
  // seed is counted — item 2 compiled it (k = 1, o2 = "05"); base and r3 refuse it
  test("refused (INTERIM): a writing seed of a cell declared AFTER the construct, not used in it", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
<div if=(true)>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
let <z:int=(bump())/>
<p id="o2">\${@z}\${n}</p>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("refused (INTERIM): the cell is read inside the construct only AFTER the initializer", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
<div if=(true)>\${ const k: int = n + 0; }<p id="o">\${k}</p><p id="o2">\${@z}</p></div>
let <z:int=(bump())/>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("legal: a writing seed of a cell declared BEFORE the construct (it ran at its place)", async () => {
    expect(await texts(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
let <z:int=(bump())/>
<div if=(true)><p>\${@z}</p>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
</program>
`, ["o"])).toEqual(["5"]);
  }, 120000);

  test("refused: the cell is read inside the construct before the initializer (its seed runs there)", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
<div if=(true)><p>\${@z}</p>\${ const k: int = n + 0; }<p>\${k}</p></div>
let <z:int=(bump())/>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("reads `n`, which the program body writes inside that construct, before it");
  }, 120000);

  test("refused: the cell is read there through a function", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
\${ function rz() -> int { return @z; } }
<div if=(true)><p>\${rz()}</p>\${ const k: int = n + 0; }<p>\${k}</p></div>
let <z:int=(bump())/>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("refused: the cell is read there through the seed of another later cell", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
<div if=(true)><p>\${@y}</p>\${ const k: int = n + 0; }<p>\${k}</p></div>
let <y:int=(@z + 1)/>
let <z:int=(bump())/>
</program>
`);
    expect(d.map((x) => x.code)).toContain("E-FILE-SCOPE-INIT-IN-CONSTRUCT");
  }, 120000);

  // #2082 review HIGH-1 — a `bind:` names its cell on the attribute (AttrKind.ABind), not on the `@s`
  // node: mounting the element reads `@s` and runs its seed there; head r0 missed it and showed k = 1
  test("refused: the cell is named there by a `bind:` (head r0: compiled, k = 1; base: refused)", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bumps() -> string { n = 5; return "s"; } }
<div if=(true)><input bind:value=@s/>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
let <s:string=(bumps())/>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("the initializer of `const k` reads `n`");
  }, 120000);

  test("refused: a `bind:` on a nested element there", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bumps() -> string { n = 5; return "s"; } }
<div if=(true)><label><span><input bind:value=@s/></span></label>\${ const k: int = n + 0; }<p>\${k}</p></div>
let <s:string=(bumps())/>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("refused (INTERIM): a `bind:` of a later cell only AFTER the initializer", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bumps() -> string { n = 5; return "s"; } }
<div if=(true)>\${ const k: int = n + 0; }<p id="o">\${k}</p><input bind:value=@s/></div>
let <s:string=(bumps())/>
<p id="o2">\${n}</p>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  // #2082 r1 review HIGH-2 / MED-1 — a `<*phase/>` view of a `rule=` graph field renders its state-child
  // bodies at the mount (O5 (1i)); the bounded walk did not descend into them (head r1: compiled, k = 1)
  const STAR = (where, body, after) => `<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
\${ function bumps() -> string { n = 5; return "s"; } }
type Phase:enum = { Idle, Loading }
${where}
<phase:Phase=.Idle>
<Idle rule=.Loading>
${body}
</>
<Loading rule=.Idle : "Loading">
</>
${after}
</program>
`;
  const IN = `<div if=(true)><span><*phase/></span>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>`;
  const OUT = `<span><*phase/></span>\${ const k: int = n + 0; }<p id="o">\${k}</p>`;
  const S = `let <s:string=(bumps())/>`;

  test("h03 refused: a state body before the initializer reads a later cell (`${@s}`)", async () => {
    const d = await errors(STAR(IN, "<b>\${@s}</b>", S));
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("the initializer of `const k` reads `n`");
  }, 120000);

  test("h07 refused: a state body before the initializer binds a later cell (`bind:value=@s`)", async () => {
    const d = await errors(STAR(IN, "<input bind:value=@s/>", S));
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("h01 refused: a state body before the initializer writes (`${bump()}`; base also missed it)", async () => {
    const d = await errors(STAR(IN, "\"R\${bump()}\"", ""));
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("refused: every state body counts, not only the initial state's", async () => {
    const src = `<program>
\${ let n: int = 1; }
\${ function bumps() -> string { n = 5; return "s"; } }
type Phase:enum = { Idle, Loading }
${IN}
<phase:Phase=.Idle>
<Idle rule=.Loading>
<b>idle</b>
</>
<Loading rule=.Idle>
<b>\${@s}</b>
</>
</>
${S}
</program>
`;
    const d = await errors(src);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("controls (no construct): source order, k = 5", async () => {
    expect(await texts(STAR(OUT, "<b>\${@s}</b>", S), ["o"])).toEqual(["5"]);
    expect(await texts(STAR(OUT, "<input bind:value=@s/>", S), ["o"])).toEqual(["5"]);
    expect(await texts(STAR(OUT, "\"R\${bump()}\"", ""), ["o"])).toEqual(["5"]);
  }, 120000);

  // default-deny (s482 r3): an element the walk of the writes does not positively understand (here
  // `<errors>`, MErrors) fails closed — every write of the program body counts (#2076's rule), so a
  // body-top write AFTER the construct is counted; with a plain `<span/>` there it is not (k = 1, the
  // source order)
  test("default-deny: an `<errors>` before the initializer counts every body write (fail closed)", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
let <e:string="" length(>2)/>
<div if=(true)><errors of=@e/>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
\${ n = 5; }
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(await texts(`<program>
\${ let n: int = 1; }
let <e:string="" length(>2)/>
<div if=(true)><span/>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
\${ n = 5; }
<p id="o2">\${n}</p>
</program>
`, ["o", "o2"])).toEqual(["1", "5"]);
  }, 120000);
});

// #2082 r2 review HIGH-3 / MED-2 — a `<*x/>` before the initializer: mounting `<*phase/>` reads the
// viewed field (its seed runs there), and `<*signup/>` mounts a declaration's shared instance (its
// fields' seeds run there). Head r2 compiled s01a / s01b / s02 and showed k = 1 (source order: 5).
describe("a `<*x/>` before the initializer runs seeds (#2082 r2 review HIGH-3, MED-2)", () => {
  const PRE = `\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
\${ function bumps() -> string { n = 5; return "s"; } }
`;
  const PHASE = (seed) => `    let <phase:Phase=${seed}>
        <Idle rule=.Loading>
            <b>I</b>
        </>
        <Loading rule=.Idle : "Loading">
    </>
`;
  test("s01a refused: the viewed field's seed calls a writer", async () => {
    const d = await errors(PRE + `<program>
    type Phase:enum = { Idle, Loading }
    \${ function pickp() -> Phase { n = 5; return .Idle; } }
    <div if=(true)><span><*phase/></span>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
` + PHASE("(pickp())") + `</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("the initializer of `const k` reads `n`");
  }, 120000);

  test("s01b refused: the viewed field's seed reads a later cell whose seed writes", async () => {
    const d = await errors(PRE + `<program>
    type Phase:enum = { Idle, Loading }
    <div if=(true)><span><*phase/></span>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
` + PHASE("(@ps)") + `    \${ function pickp() -> Phase { n = 5; return .Idle; } }
    let <ps:Phase=(pickp())/>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  const SIGNUP = `    <signup note:string="n">
        <v:int=(bump())/>
    </> renders <b>\${@signup.v}</b>
`;
  test("s02 refused: `<*signup/>` mounts the shared instance, whose field seed writes (base missed it too)", async () => {
    const d = await errors(PRE + `<program>
` + SIGNUP + `    <div if=(true)><*signup/>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("controls (no construct): source order, k = 5", async () => {
    expect(await texts(PRE + `<program>
    type Phase:enum = { Idle, Loading }
    \${ function pickp() -> Phase { n = 5; return .Idle; } }
    <span><*phase/></span>\${ const k: int = n + 0; }<p id="o">\${k}</p>
` + PHASE("(pickp())") + `</program>
`, ["o"])).toEqual(["5"]);
    expect(await texts(PRE + `<program>
` + SIGNUP + `    <*signup/>\${ const k: int = n + 0; }<p id="o">\${k}</p>
</program>
`, ["o"])).toEqual(["5"]);
  }, 120000);
});

// #2082 r2 review HIGH-4 / MED-3 — a `<request>` that does not provably write runs at the mount
// (§6.7.7.1 "Scope", §6.7.7.3 rule 1; `deps=[]` is mount-only), synchronously, in mount order: its body
// is code that runs before the initializer — its reads (a server function's argument included) and its
// writes. Head r2 compiled each and showed k = 1 (source order: 5); r03 / r06 base too.
describe("a `<request>` before the initializer runs at the mount (#2082 r2 review HIGH-4, MED-3)", () => {
  const PRE = `\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
\${ function bumps() -> string { n = 5; return "s"; } }
`;
  const cases = [
    ["r01 (body `@r = srv(@s)`: a server function's argument reads a later cell)", `    server function srv(a: string) -> string { return a; }
    let <r:string=""/>
    <div if=(true)><request id="rq" deps=[]>\${ @r = srv(@s); }</>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
    let <s:string=(bumps())/>
`],
    ["r02 (body `@r = @s`)", `    let <r:string=""/>
    <div if=(true)><request id="rq" deps=[]>\${ @r = @s; }</>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
    let <s:string=(bumps())/>
`],
    ["r03 (body `@r = srv(bump())`: the argument writes)", `    server function srv(a: int) -> string { return "x"; }
    let <r:string=""/>
    <div if=(true)><request id="rq" deps=[]>\${ @r = srv(bump()); }</>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
`],
    ["r05 (the request in a `<*phase/>` state body)", `    type Phase:enum = { Idle, Loading }
    let <r:string=""/>
    <div if=(true)><span><*phase/></span>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
    <phase:Phase=.Idle>
        <Idle rule=.Loading>
            <request id="rq" deps=[]>\${ @r = @s; }</><b>\${@r}</b>
        </>
        <Loading rule=.Idle : "Loading">
    </>
    let <s:string=(bumps())/>
`],
    ["r06 (no deps, body `@r = bump()`: it writes)", `    let <r:int=0/>
    <div if=(true)><request id="rq">\${ @r = bump(); }</><b>\${@r}</b>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
`],
  ];
  for (const [name, body] of cases) {
    test(name + " refused", async () => {
      const d = await errors(PRE + "<program>\n" + body + "</program>\n");
      expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
      expect(d[0].message).toContain("the initializer of `const k` reads `n`");
    }, 120000);
  }

  test("an `<effect>` stays non-mount: an effect body that writes is not counted", async () => {
    expect(await texts(PRE + `<program>
    let <z:int=0/>
    <div if=(true)><effect deps=[@z]>\${ n = 5; }</effect>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
</program>
`, ["o"])).toEqual(["1"]);
  }, 120000);
});
