// program-attrs-s473.test.js — s473-boot-program-attrs-small: the small items
// of the flogence-on-bootstrap measurement
// (~/.cache/scrml/review/s473-flogence-port/REPORT.md, items B3 and B9).
//
//   B3 — `<program>` attributes the bootstrap refused by a generic message:
//     • the five documentary attributes (`title=`, `description=`, `version=`,
//       `author=`, `license=`, §40.7) are READ: each emits its head tag;
//     • `lang=` (§23.2.1) is READ and carried on the Core program — it is the
//       language a `_{}` block resolves against, and changes nothing else;
//     • `mcp` stays refused, now by name: the bootstrap builds no MCP server.
//   B9 — small gaps:
//     • `timestamp` (a registered string-shaped primitive: §2959 "`date` /
//       `timestamp` (registered string-shaped primitives)") is a type, not
//       E-TYPE-UNKNOWN; the named-shape types (`date`, `email`, …, §53) are
//       refused by name, not reported unknown;
//     • a write to an `@name` that names nothing is E-STATE-UNDECLARED (§6.1.1:
//       "Bare `@x = expr` writes … without a prior `<x>` declaration in scope
//       are **`E-STATE-UNDECLARED`**"), not "writing a whole instance".
//   (`if` used as a value: every flogence site the measurement reported is a
//   cascade of a `_={ … }=` block's `}=` read as `}` `=` — flogence holds no
//   `= if (…)`. Nothing to build here; see progress.md.)
//
// Excerpts marked FLOGENCE are copied from /home/bmacs/scrmlMaster/flogence.
// RED ON BASE: every test except the two "unchanged" twins.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const prog = (attrs, body = "<p>x</p>") => `<program ${attrs}>\n    ${body}\n</program>\n`;
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  return r;
};
const html = (src) => mods.print.printProgram(clean(src).core, "app.client.js", "scrml-runtime.js").html;
const head = (h) => h.slice(0, h.indexOf("<style") >= 0 && h.indexOf("<style") < h.indexOf("<script") ? h.indexOf("<style") : h.indexOf("<script"));

// ---------------------------------------------------------------------------
describe("B3 — §40.7 documentary attributes are read", () => {
  test("FLOGENCE sample.scrml:110 — `title=` is the document's <title>", () => {
    const h = html(prog(`title="floStyle · Northwind"`));
    expect(h).toContain("<title>floStyle · Northwind</title>\n");
    expect(h.match(/<title>/g).length).toBe(1);
  });
  test("all five, in the SPEC's fixed order: <title>, description, application-version, author, license", () => {
    const h = html(prog(`license="MIT" author="Bryan MacLee" version="0.1.0" description="A counter app." title="Counter"`));
    expect(head(h)).toContain(
      "<title>Counter</title>\n" +
      `<meta name="description" content="A counter app.">\n` +
      `<meta name="application-version" content="0.1.0">\n` +
      `<meta name="author" content="Bryan MacLee">\n` +
      `<meta name="license" content="MIT">\n`);
  });
  test("values are HTML-escaped", () => {
    const h = html(prog(`title="a<b&c" description='say "hi" <now>'`));
    expect(h).toContain("<title>a&lt;b&amp;c</title>");
    expect(h).toContain(`<meta name="description" content="say &quot;hi&quot; &lt;now&gt;">`);
    expect(h).not.toContain("<now>");
  });
  test("an empty value is as if absent (the default <title>, no meta)", () => {
    const base = html(prog(""));
    expect(html(prog(`title="" description=""`))).toBe(base);
  });
  test("a non-literal value is ignored (§40.7: \"static document metadata, not reactive content\")", () => {
    const base = html(prog(""));
    expect(html(prog(`title=(1 + 2)`))).toBe(base);
  });
  test("an author-written <title> wins: neither `title=` nor the default <title> reaches <head>", () => {
    const h = html(prog(`title="Documentary" description="d"`, `<title>AuthorWritten</title>\n    <p>x</p>`));
    expect(h).not.toContain("<title>Documentary</title>");
    expect(h.slice(0, h.indexOf("<template"))).not.toContain("<title>");
    expect(h).toContain(`<meta name="description" content="d">`);   // the metas still emit
    expect(h).toContain("AuthorWritten");
  });
  test("fix round F2: an author `<TITLE>` (any case) wins too", () => {
    const h = html(prog(`title="D"`, `<TITLE>T</TITLE>\n    <p>x</p>`));
    expect(h).not.toContain("<title>D</title>");
    expect(h.slice(0, h.indexOf("<template"))).not.toContain("<title>");
  });
  for (const [label, body] of [
    ["an SVG tooltip `<svg><title>`", `<svg><title>tooltip</title></svg>`],
    ["`<textarea>` content", `<textarea><title>x</title></textarea>`],
    ["`<noscript>` content", `<noscript><title>x</title></noscript>`],
  ]) {
    test(`fix round F2: a \`<title>\` in ${label} is not the document's — the documentary title stays`, () => {
      expect(html(prog(`title="D"`, `${body}\n    <p>x</p>`))).toContain("<title>D</title>\n");
    });
  }
  test("unchanged: a documentary attribute on a NESTED `<program>` is W-PROGRAM-TITLE-NESTED", () => {
    const c = codes(`<program>\n    <program name="w" title="InnerOops">\n        <p>w</p>\n    </program>\n    <p>home</p>\n</program>\n`);
    expect(c).toContain("W-PROGRAM-TITLE-NESTED");
  });
});

// ---------------------------------------------------------------------------
describe("B3 — §23.2.1 `lang=` is read and carried", () => {
  test("FLOGENCE view.scrml:1 shape — `<program lang=\"ts\">` compiles; the Core program carries `ts`", () => {
    const r = clean(prog(`lang="ts"`));
    expect(r.core.lang).toBe("ts");
  });
  test("no `lang=` → the Core program carries none", () => {
    expect(clean(prog("")).core.lang == null).toBe(true);
  });
  test("fix round F6: `lang=\"\"` is as if absent (the §40.7 empty-value rule)", () => {
    expect(clean(prog(`lang=""`)).core.lang == null).toBe(true);
  });
  test("`lang=` changes nothing the bootstrap prints", () => {
    const a = clean(prog(`lang="ts"`)).core, b = clean(prog("")).core;
    const pa = mods.print.printProgram(a, "app.client.js", "scrml-runtime.js");
    const pb = mods.print.printProgram(b, "app.client.js", "scrml-runtime.js");
    expect(pa.html).toBe(pb.html);
    expect(pa.js).toBe(pb.js);
  });
  for (const [label, attr] of [["a bare `lang`", "lang"], ["a non-literal", "lang=(1)"]]) {
    test(`${label} → one E-BOOTSTRAP-UNSUPPORTED naming \`lang=\``, () => {
      const d = run(prog(attr)).diags;
      expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(d[0].message).toContain("`lang=`");
      expect(d[0].message).toContain("§23.2.1");
    });
  }
  test("unchanged: `<foreign lang>` beside a `<program lang>` is E-FOREIGN-LANG-IN-PROGRAM, and the program's `lang=` is now read", () => {
    expect(codes(`<foreign lang="ts" />\n<program lang="ts">\n  <p>hi</p>\n</program>\n`)).toEqual(["E-FOREIGN-LANG-IN-PROGRAM"]);
  });
});

// ---------------------------------------------------------------------------
describe("B3 — `mcp` is refused by name", () => {
  for (const attr of ["mcp", `mcp="always"`, `mcp="dev-only"`]) {
    test(`\`${attr}\` → one E-BOOTSTRAP-UNSUPPORTED naming the MCP server it would need`, () => {
      const d = run(prog(attr)).diags;
      expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(d[0].message).toContain("`<program mcp>`");
      expect(d[0].message).toContain("MCP server");
      expect(d[0].message).not.toContain("reads no `<program>` attribute");
    });
  }
  test("FLOGENCE sample.scrml:110 / app.scrml:42 — only `mcp` is refused; `title=` / `lang=` / `db=` are read", () => {
    const a = run(prog(`mcp title="floStyle · Northwind"`)).diags;
    expect(a.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(a[0].message).toContain("`<program mcp>`");
    const b = run(prog(`mcp lang="ts" db="../flogence.db"`)).diags;
    expect(b.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(b[0].message).toContain("`<program mcp>`");
  });
});

// ---------------------------------------------------------------------------
describe("B9 — `timestamp` is a type", () => {
  // FLOGENCE src/models/delta-log.scrml:56-64 (the struct; Kind / Pointer / VpaDirective trimmed)
  const DELTA = `    export type DeltaEntry:struct = {
        seq: number
        what: string                  // terse — the only free text; keep short (cheap stream)
        at: timestamp
        by: string                    // writing PA's InstanceId (single-writer audit)
    }`;
  test("FLOGENCE delta-log.scrml:62 — a struct field `at: timestamp` (was E-TYPE-UNKNOWN)", () => {
    clean(prog("", `${DELTA}\n    <p>x</p>`));
  });
  test("a `timestamp` value is a string: built, read and rendered", async () => {
    const src = prog("", `${DELTA}
    fn mk(t: timestamp) -> DeltaEntry {
        const e: DeltaEntry = { seq: 1, what: "w", at: t, by: "pa" };
        return e;
    }
    fn stamp(e: DeltaEntry) -> string {
        return e.at + "!";
    }
    let <when:timestamp="2026-10-29T00:00:00Z"/>
    <p id="o">\${stamp(mk(@when))}</p>`);
    await loadProgram(clean(src).core, "s473pa-ts", []);
    expect(document.querySelector("#o").textContent).toBe("2026-10-29T00:00:00Z!");
  });
  // fix round F1 — §66.3: a bare `timestamp` cell starts as `not` with an implicit
  // `(not to T)` lifecycle (`string` starts as `""`): refused by name.
  for (const [label, decl] of [["a `let` cell", `let <when:timestamp/>`], ["a locked cell", `<when:timestamp/>`]]) {
    test(`fix round F1: ${label} of type \`timestamp\` with no value is refused, naming the lifecycle`, () => {
      const d = run(prog("", `${decl}\n    <p>x</p>`)).diags;
      expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(d[0].message).toContain("(not to T)");
      expect(d[0].message).toContain("§66.3");
    });
  }
  // fix round 2: only the BUILT-IN `timestamp` — a user type of that name wins, and
  // its default-less cell compiles exactly as any user type's does.
  for (const [label, tdecl] of [["a struct", ":struct = { a: int }"], ["an enum", ":enum = { A, B }"]]) {
    test(`fix round 2: a user \`type timestamp${tdecl}\` (${label}) — its default-less cell is judged as any user type's`, () => {
      const src = (n) => prog("", `type ${n}${tdecl}\n    let <when:${n}/>\n    <p>x</p>`);
      const mine = run(src("timestamp")).diags.map((x) => x.code);
      expect(mine).toEqual(run(src("Stamp")).diags.map((x) => x.code));
      expect(mine).toEqual([]);
    });
  }
  test("fix round F1: the reviewer's shape — `@when = not` on a bare timestamp cell is the refusal, not a string typing error", () => {
    const c = codes(prog("", `let <when:timestamp/>\n    <button onclick={ @when = not; }>x</button>`));
    expect(c).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  for (const shape of ["date", "email", "url", "uuid", "phone", "time", "color"]) {
    test(`the named-shape type \`${shape}\` (§53) is refused by name, not reported unknown`, () => {
      const d = run(prog("", `type R:struct = { f: ${shape} }\n    <p>x</p>`)).diags;
      expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(d[0].message).toContain("`" + shape + "`");
      expect(d[0].message).toContain("§53");
    });
  }
  test("unchanged: a genuinely unknown type name is still E-TYPE-UNKNOWN", () => {
    expect(codes(prog("", `type R:struct = { f: blarg }\n    <p>x</p>`))).toEqual(["E-TYPE-UNKNOWN"]);
  });
});

// ---------------------------------------------------------------------------
describe("B9 — a write to an `@name` that names nothing", () => {
  test("FLOGENCE view.scrml:57-60 shape — `@status = …` with no `status` in scope is E-STATE-UNDECLARED (§6.1.1)", () => {
    const d = run(prog("", `function load() {
        @status = "all three arms called";
    }
    <p>x</p>`)).diags;
    expect(d.map((x) => x.code)).toEqual(["E-STATE-UNDECLARED"]);
    expect(d[0].message).toContain("`@status` is written here");
    expect(d[0].message).not.toContain("whole instance");
  });
  test("conformance s437-r4-undeclared-cell-2nd-top-neg shape — a handler writing an undeclared cell", () => {
    const d = run(prog("", `let <n:int=0/>
    <button onclick={ @n = 1; @zz = 3; }>x</button>`)).diags;
    expect(d.map((x) => x.code)).toEqual(["E-STATE-UNDECLARED"]);
    expect(d[0].message).toContain("`@zz` is written here");
  });
  test("a write to a real declaration's whole instance is still refused as one (fix round F5: valid fixture, exact list)", () => {
    const d = run(prog("", `<card k:string="t"/>
    renders <p>\${k}</p>
    function f() {
        @card = 1;
    }
    <main><card/></main>`)).diags;
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(d[0].message).toContain("whole instance");
  });
  // fix round F4: the message names what was written, never an invented `@x = …`
  for (const [label, body] of [
    ["a field write", `function f() {\n        @nope.a = 1;\n    }\n    <p>x</p>`],
    ["a `bind:value=`", `<input bind:value=@nope/>`],
  ]) {
    test(`${label} to an undeclared cell → E-STATE-UNDECLARED naming \`@nope\`, no invented \`= …\``, () => {
      const d = run(prog("", body)).diags.filter((x) => x.code === "E-STATE-UNDECLARED");
      expect(d.length).toBe(1);
      expect(d[0].message).toContain("`@nope` is written here");
      expect(d[0].message).not.toContain("@nope = …");
    });
  }
});
