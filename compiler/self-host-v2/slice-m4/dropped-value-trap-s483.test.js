// dropped-value-trap-s483.test.js — lane s483-attr-trap. A server-only component field (an attribute, or a cell
// a use site gives a value: §7.6 rule (b), #2125 / #2130) has several values — its default and each use site's —
// and the classification judged them JOINED: when one reached a secret the field was server-only and EVERY value
// was dropped, so a runtime trap (§19.17, E-INDEX-OUT-OF-RANGE-RT) in another value that reaches nothing
// server-only stopped firing (#2130 review MED-1: r12g, r12i, r12j — red on 353ffe643, the page loaded alive).
//
// Ruled S483 (ruling:user-voice-scrml.md-S483-dropped-attr-trap): "Run secret-free ones" — *"a dropped value that
// reaches nothing server-only is still evaluated for its trap and the result discarded; a dropped value that
// reaches a secret cannot run in the client, so its trap loss is documented in SPEC with a gap"*. Built:
// print.scrml keptVals judges each value of such a field ITSELF against the drop-all classification (r1, #2134
// review HIGH-1: not by whether the field stays server-only holding it alone — n11–n16 / x7 shipped a secret)
// and keeps (runs in the client, seeded at its instance's mount) the ones that reach nothing server-only; a value
// printed as a lazy derived thunk is not kept (r1, LOW-1: it would never run); a kept default runs only for an
// instance that gives the field none (an instance whose own value is dropped passes `not`), and is kept only when
// such an instance exists. The trap loss of a value that reaches a secret (r12c, r12d, r12h, n12) is gap
// g-boot-dropped-value-trap-s483.
// Chromium: compiler/tests/browser/dropped-value-trap-chromium-s483.browser.test.js.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s483-dropped-trap-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
function writeApp(src) {
  const sub = join(dir, `app${n++}`);
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, "main.scrml"), src);
  return join(sub, "main.scrml");
}

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(ROOT, "scripts", "scrml-boot.ts");
const SERVER_FILES = ["program.server.js", "scrml-server-runtime.js", "runtime.js", ".scrml-boot-manifest.json"];

// a program of several files (`files`: name → source); the path of its main.scrml
function writeFiles(files) {
  const sub = join(dir, `app${n++}`);
  mkdirSync(sub, { recursive: true });
  for (const [f, src] of Object.entries(files)) writeFileSync(join(sub, f), src);
  return join(sub, "main.scrml");
}

// Compile through the CLI; every CLIENT file read back; the server artifact imported (a load failure fails the test).
async function build(src) {
  return buildAt(writeApp(src));
}
async function buildAt(main) {
  const out = main.replace(/main\.scrml$/, "out");
  const p = Bun.spawnSync(["bun", CLI, "compile", main, "--output-dir", out], { cwd: ROOT, env: { ...process.env, NO_COLOR: "1" }, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) return { ok: false, err: p.stderr.toString() + p.stdout.toString() };
  const names = readdirSync(out);
  const client = names.filter((f) => !SERVER_FILES.includes(f)).map((f) => ({ f, text: readFileSync(join(out, f), "utf8") }));
  if (names.includes("program.server.js")) await import(pathToFileURL(join(out, "program.server.js")).href);
  return { ok: true, client, js: client.find((c) => c.f === "program.client.js")?.text ?? "" };
}
function leaked(client) {
  return client.filter((c) => c.text.includes("zz-sk-live-123")).map((c) => c.f);
}
// run the client artifact (happy-dom): the trap code it stops with, or "alive"
async function outcome(src) {
  const res = await compileSource(writeApp(src));
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  try {
    await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
    return "alive";
  } catch (e) {
    const m = /^(E-[A-Z0-9-]+-RT)/.exec(String(e?.message ?? e));
    return m ? m[1] : "threw: " + String(e?.message ?? e);
  }
}

// `label` is server-placed (§12.2 Trigger 5: it reaches a `?{}`), so API_KEY is otherwise read only by server code.
const PROG = (extra) => `\${
    const API_KEY: string = "zz-sk-live-123";
    function tag(s: string) -> string { return "[" + s + "]"; }
    function mk() -> string { return API_KEY + "?"; }
    function pick5(xs: string[]) -> string { return xs[5]; }
}
<program db="./app.db">
\${
    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return r.name + API_KEY;
    }
}
let <out:string=""/>
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
<p id="c">\${tag(@out)}</p>
\${ const XS: string[] = ["a"]; }
${extra}
<p id="h">alive</p>
</program>
`;

describe("a dropped value that reaches nothing server-only still runs for its trap (the field stays a shell; no secret in the client)", () => {
  test("r12g a use-site value beside a secret use site; r12j beside a secret default; r12i a use-site-given cell beside a secret seed; through a function; the same value twice; a binding the secret value reads too", async () => {
    for (const extra of [
      `<card t:string="x"/> renders <b>x</b>\n<card t=("p" + XS[5])/>\n<card t=(API_KEY)/>`,
      `<card t:string=(mk())/> renders <b>x</b>\n<card t=("p" + XS[5])/>`,
      `<card t:string="x">\n  let <k:string=(API_KEY)/>\n</> renders <b>x</b>\n<card k=("p" + XS[5])/>`,
      `<card t:string="x"/> renders <b>x</b>\n<card t=(pick5(XS))/>\n<card t=(API_KEY)/>`,
      `<card t:string="x"/> renders <b>x</b>\n<card t=("p" + XS[5])/>\n<card t=("p" + XS[5])/>\n<card t=(API_KEY)/>`,
      `\${ const B: string = "b"; }\n<card t:string="x"/> renders <b>x</b>\n<card t=(B + XS[5])/>\n<card t=(B + API_KEY)/>`,
    ]) {
      const s = PROG(extra);
      const b = await build(s);
      expect(b.ok).toBe(true);
      expect(leaked(b.client)).toEqual([]);
      expect(b.js).toContain("rt.indexRead(");
      expect(await outcome(s)).toBe("E-INDEX-OUT-OF-RANGE-RT");
    }
  }, 900000);

  test("a kept DEFAULT runs only for an instance that gives the field none: k01 traps (a bare `<card/>`); k02 (every instance gives t) keeps nothing — the default would never run (r1, #2134 review LOW-1)", async () => {
    const k01 = PROG(`<card t:string=("p" + XS[5])/> renders <b>x</b>\n<card t=(API_KEY)/>\n<card/>`);
    const k02 = PROG(`<card t:string=("p" + XS[5])/> renders <b>x</b>\n<card t=(API_KEY)/>`);
    const b1 = await build(k01);
    expect(b1.ok).toBe(true);
    expect(leaked(b1.client)).toEqual([]);
    // the instance whose secret value is dropped passes `not`, so the default does not run for it
    expect(b1.js).toMatch(/mk_card_\w+\(rt\.instance\(decl_card_\w+, inst\$\.scope\), \(\) => null\)/);
    const b2 = await build(k02);
    expect(b2.ok).toBe(true);
    expect(leaked(b2.client)).toEqual([]);
    // nothing kept: the use site passes nothing and the default is not printed (as with every value dropped)
    expect(b2.js).toMatch(/mk_card_\w+\(rt\.instance\(decl_card_\w+, inst\$\.scope\)\)/);
    expect(b2.js).not.toContain("rt.indexRead(");
    expect(await outcome(k01)).toBe("E-INDEX-OUT-OF-RANGE-RT");
    expect(await outcome(k02)).toBe("alive");
  }, 600000);

  test("a kept value that does not trap runs with no effect; a field with no secret anywhere (r12f) is untouched", async () => {
    const k04 = PROG(`<card t:string="x"/> renders <b>x</b>\n<card t=(tag(XS[0]))/>\n<card t=(mk())/>`);
    const b = await build(k04);
    expect(leaked(b.client)).toEqual([]);
    expect(await outcome(k04)).toBe("alive");
    expect(await outcome(PROG(`<card t:string="x"/> renders <b>x</b>\n<card t=("p" + XS[5])/>`))).toBe("E-INDEX-OUT-OF-RANGE-RT");
  }, 600000);

  test("a value that cannot trap (no call, no host call, no primitive that can trap — print.scrml initActs / primTraps) stays dropped: the output is as before", async () => {
    const s = PROG(`\${ const B: string = "b"; }\n<card t:string="x"/> renders <b>x</b>\n<card t=(B + "x")/>\n<card t=(API_KEY)/>`);
    const b = await build(s);
    expect(b.ok).toBe(true);
    expect(leaked(b.client)).toEqual([]);
    // neither use site passes a value
    expect(b.js.match(/mk_card_\w+\(rt\.instance\(decl_card_\w+, inst\$\.scope\)\)/g)?.length).toBe(2);
    expect(b.js).not.toContain("givenSeed");
    expect(await outcome(s)).toBe("alive");
  }, 300000);
});

describe("#2130 review LOW-1 — a refused cell whose only reader is a dropped use-site value says so", () => {
  test("a52 `<card t=(@pk)/>`, t unread: the message names `<card>.t` (not \"nothing on the client reads\"); a cell nothing reads keeps the old text", async () => {
    const a52 = await build(PROG(`let <pk:string=(mk() + @out)/>\n<card t:string="x"/> renders <b>x</b>\n<card t=(@pk)/>`));
    expect(a52.ok).toBe(false);
    expect(a52.err).toContain("the seed of `@pk`, a cell of the program body whose only reader is the value a use site gives `<card>.t` — a component field nothing on the client reads, so that value is not evaluated");
    expect(a52.err).not.toContain("nothing on the client reads, reaches");
    const a54 = await build(PROG(`<card t:string=(API_KEY)/> renders <b>x</b>\nlet <z:string=(tag(@card.t))/>`));
    expect(a54.ok).toBe(false);
    expect(a54.err).toContain("the seed of `@z`, a cell of the program body that nothing on the client reads, reaches");
  }, 300000);
});

describe("#2130 review INFO-1 — compile time is not exponential in the depth of components forwarding an attribute", () => {
  // Each component renders the next and passes `t=(t + "i")`. lower.scrml rendersFields (the gate's static
  // reach) walked a use's kids twice per level: 25 deep took 11 s, 30 deep over 300 s (353ffe643). Now ~0.6 s at
  // 30. The bound leaves room for a loaded runner and fails the exponential walk by orders of magnitude.
  test("a 32-deep forwarding chain compiles in well under a minute, with no secret in the client", async () => {
    let body = "";
    for (let i = 0; i < 32; i++) {
      const next = i < 31 ? `<b><c${i + 1} t=(t + "${i}")/></b>` : `<b>x</b>`;
      body += `<c${i} t:string="d">\n  let <k:string=(t + "k")/>\n</> renders ${next}\n`;
    }
    const s = PROG(body + `<c0 t=(API_KEY)/>`);
    const t0 = performance.now();
    const res = await compileSource(writeApp(s));
    const ms = performance.now() - t0;
    expect(res.ok).toBe(true);
    expect(res.client.js).not.toContain("zz-sk-live-123");
    expect(ms).toBeLessThan(60000);
  }, 300000);
});

describe("a dropped value that reaches a secret cannot run in the client — its trap is lost (gap g-boot-dropped-value-trap-s483, pinned)", () => {
  test("r12c a use-site value, r12d a default, r12h a component cell's seed: no secret in the client, the page loads", async () => {
    for (const extra of [
      `<card t:string="x"/> renders <b>x</b>\n<card t=(API_KEY + XS[5])/>`,
      `<card t:string=(API_KEY + XS[5])/> renders <b>x</b>\n<card/>`,
      `<card t:string="x">\n  let <k:string=(API_KEY + XS[5])/>\n</> renders <b>x</b>\n<card/>`,
    ]) {
      const s = PROG(extra);
      const b = await build(s);
      expect(b.ok).toBe(true);
      expect(leaked(b.client)).toEqual([]);
      expect(await outcome(s)).toBe("alive");
    }
  }, 600000);
});

// s483 r1 (#2134 review HIGH-1). r0 kept a value when "the field is not server-only holding that value alone". A
// field another server-only initializer reads (a sibling default `w:string=(t + mk())`, another use site's value
// through a handle, a component cell's reader) is server-READ from the classification's second round on and is
// never judged server-only again, so a value reaching its secret only from that round on (`S`, read only by
// `const X = mk() + S`, a binding the server artifact runs) was kept and printed `const S = "zz-held-S"` into
// program.client.js. Now the value is judged itself against the drop-all classification (print.scrml
// valueReachesServer), and a confirm classification with the kept values in keeps nothing when any binding or
// function server-only before becomes client-held (sameServerSide). Every probe: no secret in any client file.
const HELD = (extra) => PROG(extra).replace("    function pick5", `    const S: string = "zz-held-S";\n    const X: string = mk() + S;\n    function pick5`);
function leakedAny(client) {
  return client.filter((c) => c.text.includes("zz-")).map((c) => c.f);
}

describe("#2134 review HIGH-1 — a value that reaches a binding only server code reads is not kept, however the field is read", () => {
  test("n10 (control) and n11–n16: a sibling default reads t, a kept-looking default, a handle, a component cell, a function — no secret in any client file; the page loads", async () => {
    for (const extra of [
      // n10 control: nothing reads t
      `<card t:string="x"/> renders <b>x</b>\n<card t=(tag(S))/>\n<card t=(API_KEY)/>`,
      // n11 a sibling default reads t
      `<card t:string="x" w:string=(t + mk())/> renders <b>x</b>\n<card t=(tag(S))/>\n<card t=(API_KEY)/>`,
      // n12 the same, the value traps too (its trap is lost: it reaches S — the ruled cost)
      `<card t:string="x" w:string=(t + mk())/> renders <b>x</b>\n<card t=(S + XS[5])/>\n<card t=(API_KEY)/>`,
      // n13 the value is t's default, run for a bare <card/>
      `<card t:string=(tag(S)) w:string=(t + mk())/> renders <b>x</b>\n<card/>\n<card t=(API_KEY)/>`,
      // n14 another component's use-site value reads t through a handle
      `<card t:string="x"/> renders <b>x</b>\n<card as=h1 t=(tag(S))/>\n<card t=(API_KEY)/>\n<inner u:string="y"/> renders <i>y</i>\n<inner u=(@h1.t + mk())/>`,
      // n15 a component cell a use site gives a value, read by a sibling default
      `<card t:string="x" w:string=(k + mk())>\n  let <k:string=("q")/>\n</> renders <b>x</b>\n<card k=(tag(S))/>\n<card k=(API_KEY)/>`,
      // n16 the value reaches S through a function
      `<card t:string="x" w:string=(t + mk())/> renders <b>x</b>\n\${ function peekS() -> string { return S + "!"; } }\n<card t=(peekS())/>\n<card t=(API_KEY)/>`,
    ]) {
      const s = HELD(extra);
      const b = await build(s);
      expect(b.ok).toBe(true);
      expect(leakedAny(b.client)).toEqual([]);
      expect(b.js).not.toContain("givenSeed");
      expect(await outcome(s)).toBe("alive");
    }
  }, 900000);

  test("x7 cross-file: the component and the bindings in a library, the use sites in the program — no secret in any client file", async () => {
    const lib = `\${
    export const SECRET: string = "zz-imp-999";
    export const S: string = "zz-imp-held";
    export const X: string = SECRET + S;
    export fn tagS() -> string { return "[" + SECRET + "]"; }
    export fn tag(s: string) -> string { return "[" + s + "]"; }
    export fn mk() -> string { return SECRET + "?"; }
}
export <card t:string="x" w:string=(t + mk())/> renders <b>x</b>
`;
    const main = `<program db="./app.db">
\${
    import { SECRET, tagS, card, S, tag, mk } from "./lib.scrml";
    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return r.name + SECRET;
    }
}
let <out:string=""/>
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
<p id="c">\${@out}</p>
<card t=(SECRET)/>
<card t=(tag(S))/>
\${ const X2: string = mk() + S; }
</program>
`;
    const b = await buildAt(writeFiles({ "lib.scrml": lib, "main.scrml": main }));
    expect(b.ok).toBe(true);
    expect(leakedAny(b.client)).toEqual([]);
  }, 300000);

  test("a value reading a binding the client reads anyway (k10: `L` displayed, and read by the secret value's function) is still kept and traps", async () => {
    const s = PROG(`\${ const L: string[] = ["l"]; }\n\${ function lim() -> string { return L[0] + API_KEY; } }\n<p id="l">\${L[0]}</p>\n<card t:string="x"/> renders <b>x</b>\n<card t=(L[0] + XS[5])/>\n<card t=(lim())/>`);
    const b = await build(s);
    expect(b.ok).toBe(true);
    expect(leaked(b.client)).toEqual([]);
    expect(await outcome(s)).toBe("E-INDEX-OUT-OF-RANGE-RT");
  }, 300000);
});

// s483 r1 (#2134 review LOW-1). A value printed as a lazy derived thunk — it reads a cell, an `<each>` row binding,
// or a field it forwards — runs only when the field is read, and nothing reads it: r0 kept it in the client, where
// it never ran (no trap, bytes only). Now only a value seeded at its instance's mount is kept (valueRunsAtMount);
// these stay dropped, and the page is as with every value dropped.
describe("#2134 review LOW-1 — a value that would be a derived thunk is not kept (it would never run)", () => {
  test("n33 a cell read, n20 an `<each>` row index, n23 a forwarded field: the use site passes nothing; the page loads", async () => {
    for (const extra of [
      `let <c:string=("c")/>\n<card t:string="x"/> renders <b>x</b>\n<card t=(@c + XS[5])/>\n<card t=(API_KEY)/>`,
      `\${ const IS: int[] = [0, 5]; }\n<card t:string="x"/> renders <b>x</b>\n<each in=IS as i><card t=("p" + XS[i])/></each>\n<card t=(API_KEY)/>`,
      `<card t:string="x"/> renders <b>x</b>\n<outer u:string="o"/> renders <div><card t=(u + XS[5])/></div>\n<outer u=("p")/>\n<outer u=(API_KEY)/>`,
    ]) {
      const s = HELD(extra);
      const b = await build(s);
      expect(b.ok).toBe(true);
      expect(leakedAny(b.client)).toEqual([]);
      expect(b.js).not.toContain("rt.indexRead(");
      expect(await outcome(s)).toBe("alive");
    }
  }, 900000);
});
