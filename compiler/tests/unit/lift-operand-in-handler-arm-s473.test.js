/**
 * lift-operand-in-handler-arm-s473.test.js — a `!{}` arm block whose one statement is `lift <expr>`
 * (s473-lift-cell-ref-scope; flogence S60 delta [594]).
 *
 * SPEC §18.5 (S469): "A block arm in a VALUE position — a `match` or `!{}` whose result is used
 * (§18.9, §19.4.3) — yields its value with **`lift <expr>;`**". The operand is any expression,
 * a cell read included.
 *
 * impl#1 refused `@x = f() !{ _ e :> { lift @x } }` with E-SCOPE-001 "Undeclared identifier
 * `lift`": the builder's expression reading of the arm body (`_parseHandlerExpr`, read by the
 * type-system's arm scope check) parsed the text `lift @x` as a JS expression, where `lift` is
 * an identifier and the rest is a silently dropped trailing tail. The same happened to every
 * operand acorn can read after an identifier prefix (`lift 5`, `lift x`, `lift (@x)` — a call
 * `lift(@x)`), while `lift []` / a statement-led block escaped only by failing to parse. The
 * fix reads a body that IS one `lift` statement as its operand (`{ lift e }` is `e`, §18.5), so
 * the scope check sees the operand and never the keyword.
 */
import { describe, test, expect, afterAll } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from "fs";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { compileScrml } from "../../src/api.js";
import { SCRML_RUNTIME } from "../../src/runtime-template.js";
import { deferSyncGuardedCellWrites } from "../../src/codegen/emit-client.ts";
import { closingBraceIndex } from "../../src/brace-pair.ts";

afterAll(async () => {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
});

function compileSource(source) {
  const dir = resolve(tmpdir(), `scrml-s473-lift-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const input = resolve(dir, "app.scrml");
  const outDir = resolve(dir, "out");
  mkdirSync(dir, { recursive: true });
  writeFileSync(input, source);
  try {
    const result = compileScrml({ inputFiles: [input], write: true, outputDir: outDir, log: () => {} });
    const read = (name) => {
      const p = resolve(outDir, name);
      return existsSync(p) ? readFileSync(p, "utf8") : "";
    };
    const errors = (result.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
    return { errors, codes: errors.map((e) => e.code), messages: errors.map((e) => e.message), clientJs: read("app.client.js"), html: read("app.html") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A page whose `go(id)` runs `body`; `load("bad")` fails, `load("ok")` returns 5. */
const PAGE = (body, extra = "") => `type E:enum = { Bad }
<x> = 7
<s> = { n: 2 }
\${
    function load(id: string)! E {
        if (id == "bad") fail E.Bad;
        return 5;
    }
${extra}
    function go(id: string) {
        ${body}
    }
}
<button id="bad" onclick=go("bad")>bad</button>
<button id="ok" onclick=go("ok")>ok</button>
<p id="out">\${@x}</p>
<p id="sn">\${@s.n}</p>
`;

async function boot(source, { fetchStub } = {}) {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
  GlobalRegistrator.register();
  if (fetchStub) { globalThis.fetch = fetchStub; window.fetch = fetchStub; }
  const out = compileSource(source);
  if (out.errors.length > 0) throw new Error(`compile errors: ${out.codes.join(", ")}\n${out.messages.join("\n")}`);
  const bodyMatch = out.html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  document.body.innerHTML = (bodyMatch ? bodyMatch[1] : out.html).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "").trim();
  // eslint-disable-next-line no-eval
  (0, eval)(`(function() {\n${SCRML_RUNTIME}\n${out.clientJs}\n})();`);
  document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
  await settle();
  return {
    click: async (sel) => { document.querySelector(sel).click(); await settle(); },
    text: (sel) => document.querySelector(sel).textContent,
  };
}

// The arm shapes flogence wanted (`lift @x` / `lift (@x)`), the adjacent operands, and the
// value each lifts when `@x` is 7 and `@s.n` is 2.
const ARMS = {
  "`{ lift @x }`": ["{ lift @x }", "7"],
  "`{ lift (@x) }`": ["{ lift (@x) }", "7"],
  "`{ lift @x; }`": ["{ lift @x; }", "7"],
  "`{ lift @s.n }`": ["{ lift @s.n }", "2"],
  "`{ lift @x + 1 }`": ["{ lift @x + 1 }", "8"],
  "`{ lift 9 }`": ["{ lift 9 }", "9"],
  "`{ lift -1 }`": ["{ lift -1 }", "-1"],
};

describe("A — `lift <cell read>` in a value-position `!{}` arm compiles (no E-SCOPE-001 on `lift`)", () => {
  for (const [name, [arm]] of Object.entries(ARMS)) {
    test(`cell write: \`@x = load(id) !{ _ e :> ${arm} }\``, () => {
      const r = compileSource(PAGE(`@x = load(id) !{ _ e :> ${arm} }`));
      expect(r.messages.filter((m) => /`lift`/.test(m))).toEqual([]);
      expect(r.codes).toEqual([]);
    });
    test(`legacy pipe (flogence's spelling): \`@x = load(id) !{ | _ e :> ${arm} }\``, () => {
      expect(compileSource(PAGE(`@x = load(id) !{ | _ e :> ${arm} }`)).codes).toEqual([]);
    });
    test(`let binding: \`let v = load(id) !{ .Bad :> ${arm} }\``, () => {
      expect(compileSource(PAGE(`let v = load(id) !{ .Bad :> ${arm} }\n        @x = v`)).codes).toEqual([]);
    });
  }
  test("a `return` operand", () => {
    expect(compileSource(PAGE(`@x = pick(id)`, `    function pick(id: string) {\n        return load(id) !{ _ e :> { lift @x } }\n    }`)).codes).toEqual([]);
  });
});

describe("B — executed: the arm's lifted value lands in the target (never the error envelope)", () => {
  for (const [name, [arm, want]] of Object.entries(ARMS)) {
    test(`${name}: failure → ${want}; success → 5`, async () => {
      const page = await boot(PAGE(`@x = load(id) !{ _ e :> ${arm} }`));
      expect(page.text("#out")).toBe("7");
      await page.click("#bad");
      expect(page.text("#out")).toBe(want);
      await page.click("#ok");
      expect(page.text("#out")).toBe("5");
    });
  }
  test("flogence's exact shape: a cell keeps its prior value on failure (`@x = load(id) !{ | _ e :> { lift @x } }`)", async () => {
    const page = await boot(PAGE(`@x = load(id) !{ | _ e :> { lift @x } }`));
    await page.click("#bad");
    expect(page.text("#out")).toBe("7");
    await page.click("#bad");
    expect(page.text("#out")).toBe("7");
  });
});

describe("C — the scope check still reads the operand", () => {
  test("`{ lift nope }` is E-SCOPE-001 on `nope`, never on `lift`", () => {
    const r = compileSource(PAGE(`@x = load(id) !{ _ e :> { lift nope } }`));
    expect(r.codes).toContain("E-SCOPE-001");
    const scope = r.messages.filter((m) => /Undeclared identifier/.test(m));
    expect(scope.some((m) => /`nope`/.test(m))).toBe(true);
    expect(scope.some((m) => /`lift`/.test(m))).toBe(false);
  });
  test("the arm binder is in scope for the operand: `{ lift code(e) }`", () => {
    expect(compileSource(PAGE(`@x = load(id) !{ _ e :> { lift code(e) } }`, `    function code(err: E) { return 3 }`)).codes).toEqual([]);
  });
});

describe("D — unchanged neighbours", () => {
  test("the statement-led workaround `{ const prev = @x; lift prev }` still compiles", () => {
    expect(compileSource(PAGE(`@x = load(id) !{ _ e :> { const prev = @x; lift prev } }`)).codes).toEqual([]);
  });
  test("a single-expression arm `_ e :> @x` still compiles", () => {
    expect(compileSource(PAGE(`@x = load(id) !{ _ e :> @x }`)).codes).toEqual([]);
  });
  test("a falling-through arm is still E-ERROR-012", () => {
    expect(compileSource(PAGE(`@x = load(id) !{ _ e :> { @x = 3 } }`)).codes).toContain("E-ERROR-012");
  });
});

// ---------------------------------------------------------------------------
// E — the cell is written ONCE, after the arms. `@x = f() !{…}` was lowered to the eager
// `_scrml_reactive_set("x", f())`, so on a failure `@x` held the error envelope while the arms
// ran: an arm reading `@x` (flogence's `{ const prev = @nodeStats; lift prev }`, and the
// `{ lift @x }` above) read the envelope and wrote it back — the S470 envelope-in-a-cell class.
// ---------------------------------------------------------------------------
describe("E — `@cell = f() !{…}`: the arms never see the error envelope in the cell", () => {
  test("flogence's workaround `{ const prev = @x; lift prev }` keeps the prior value (executed)", async () => {
    const page = await boot(PAGE(`@x = load(id) !{ | _ e :> { const prev = @x; lift prev } }`));
    await page.click("#bad");
    expect(page.text("#out")).toBe("7");
    await page.click("#ok");
    expect(page.text("#out")).toBe("5");
  });
  test("an arm that leaves (`return`) leaves the cell untouched — never the envelope (executed)", async () => {
    const page = await boot(PAGE(`@x = load(id) !{ .Bad :> { return } }`));
    await page.click("#bad");
    expect(page.text("#out")).toBe("7");
    await page.click("#ok");
    expect(page.text("#out")).toBe("5");
  });
  test("an arm reading another cell's value still works: `{ lift @s.n }` → 2, then success → 5 (executed)", async () => {
    const page = await boot(PAGE(`@x = load(id) !{ _ e :> { lift @s.n } }`));
    await page.click("#bad");
    expect(page.text("#out")).toBe("2");
  });
  test("emitted: the call is evaluated into the result first; the cell is written only after the arms", () => {
    const r = compileSource(PAGE(`@x = load(id) !{ _ e :> { lift @x } }`));
    expect(r.codes).toEqual([]);
    // `let R = load(id); if (R && R.__scrml_error) { …arms…; set("x", R); } else { set("x", R); }`
    expect(r.clientJs).toMatch(/let (\w+) = _scrml_load_\d+\(id\);\s*if \(\1 && \1\.__scrml_error\) \{[\s\S]*?_scrml(?:_cs)?_reactive_set\("x", \1\);\s*\} else \{\s*_scrml(?:_cs)?_reactive_set\("x", \1\);\s*\}/);
    expect(r.clientJs).not.toMatch(/_reactive_set\(\s*"x"\s*,\s*_scrml_load/);
  });
  test("a server call as the guarded value is still awaited before the arms", () => {
    const r = compileSource(`type AuthErr:enum = { Denied(reason: string), Gone }
<ok> = false
<msg> = ""
\${
    server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    function login(p) {
        @ok = check(p) !{ .Denied(r) :> { lift @ok }, _ :> false }
        if (@ok) { @msg = "IN" }
    }
}
<button onclick=login("x")>go</button>
<p>\${@msg}</p>
`);
    expect(r.codes).toEqual([]);
    expect(r.clientJs).toMatch(/let (\w+) = await _scrml_fetch_check_\d+\(p\);/);
    expect(r.clientJs).not.toMatch(/_reactive_set\(\s*"ok"\s*,\s*(?:await\s+)?_scrml_fetch_check/);
  });
});

// ---------------------------------------------------------------------------
// F — fix round 1 (S239 review of #1645).
// ---------------------------------------------------------------------------
/** PAGE with a second cell `@y` (4) shown in `#y`, for the nested and literal cases. */
const PAGE2 = (body) => PAGE(body).replace("<x> = 7", "<x> = 7\n<y> = 4").replace(`<p id="sn">`, `<p id="y">\${@y}</p>\n<p id="sn">`);

describe("F — fix round 1", () => {
  test("MED-1: a guarded cell write NESTED in another guard's arm is deferred too — `#y` keeps its value (executed)", async () => {
    const page = await boot(PAGE2(`@x = load(id) !{ _ e :> { @y = load("bad") !{ _ f :> { lift @y } }
            lift @x } }`));
    await page.click("#bad");
    expect(page.text("#y")).toBe("4");
    expect(page.text("#out")).toBe("7");
    await page.click("#ok");
    expect(page.text("#out")).toBe("5");
  });
  test("MED-2: text inside a template literal that looks like the guarded shape is never rewritten (`t.length` unchanged, executed)", async () => {
    const lit = "let q = _scrml_reactive_set('x', 1);\nif (q && q.__scrml_error) { _scrml_reactive_set('x', q); }";
    const page = await boot(PAGE2("const t = `" + lit + "`\n        @y = t.length"));
    await page.click("#ok");
    expect(page.text("#y")).toBe(String(lit.length));
  });
  test("MED-2: the same text in a double-quoted string compiles (never an unterminated string)", () => {
    const r = compileSource(PAGE2(`const t = "let q = _scrml_reactive_set('x', 1); if (q && q.__scrml_error) { _scrml_reactive_set('x', q); }"
        @y = t.length`));
    expect(r.codes).toEqual([]);
  });
  test("LOW-3: a regex literal holding a quote in the arm does not derail the rewrite — the cell keeps its value (executed)", async () => {
    const page = await boot(PAGE(`@x = load(id) !{ _ e :> { const ok = /'/.test("a"); lift @x } }`));
    await page.click("#bad");
    expect(page.text("#out")).toBe("7");
  });
  test("LOW-4: a `lift` operand continued on the next line by an operator is one statement — `{ lift @x⏎ + 1 }` → 8 (executed)", async () => {
    const page = await boot(PAGE(`@x = load(id) !{ _ e :> { lift @x
            + 1 } }`));
    await page.click("#bad");
    expect(page.text("#out")).toBe("8");
  });
  test("LOW-4: two `lift` lines stay two statements (never merged into one operand)", () => {
    const r = compileSource(PAGE(`@x = load(id) !{ _ e :> { lift 1
            lift 2 } }`));
    expect(r.codes.length).toBeGreaterThan(0);
  });
});

// INFO-5 — route inference reads `handlerExpr` (`guardArmsAreValues`, the S455 split allow-list): an
// arm now read as its `lift` operand is admitted when the operand is a value the server side can
// produce, and still refused (E-RI-002) when it reads client state.
describe("F — INFO-5: route inference on a `lift` arm of a handled query in a client function", () => {
  const SCHEMA = `
    <schema>
        notes {
            id: integer primary key
            body: text
        }
    </>`;
  const split = (arm, params = "") => `<program db="./app.db">${SCHEMA}
    <rC> = "init"
    <s> = "init"
    function fC(${params}) {
        const fallback = "fb"
        @rC = ?{\`SELECT id, body FROM notes\`}.get() !{ _ :> ${arm} }
        @s = "after"
    }
    <button onclick={ fC(${params ? '"p"' : ""}) !{ .Transport(_) :> { return } } }>c</button>
    <p>\${@rC} \${@s}</p>
</program>`;
  test("admitted: `{ lift \"x\" }` and `{ lift p }` (a parameter)", () => {
    expect(compileSource(split('{ lift "x" }')).codes).not.toContain("E-RI-002");
    expect(compileSource(split("{ lift p }", "p")).codes).not.toContain("E-RI-002");
  });
  test("refused (E-RI-002): `{ lift fallback }` (a client local), `{ lift @s }` (a cell), `{ lift mark() }` (a call)", () => {
    expect(compileSource(split("{ lift fallback }")).codes).toContain("E-RI-002");
    expect(compileSource(split("{ lift @s }")).codes).toContain("E-RI-002");
    expect(compileSource(split("{ lift mark() }")).codes).toContain("E-RI-002");
  });
});

// ---------------------------------------------------------------------------
// G — fix round 2 (S239 re-review of #1645).
// ---------------------------------------------------------------------------
describe("G — fix round 2", () => {
  // NEW-1: emit-client writes `// <widgets server> = ?{…} — …` for a §52.6.5 Pattern C inline server
  // cell; the mask's `?{}` placeholder pass collapsed it, the mask came out shorter, and every sync
  // guarded write on the page stayed eager.
  const PATTERN_C = `<program db="sqlite:./app.db" auth="required">
<schema>
  ?{\`CREATE TABLE widgets (id INTEGER PRIMARY KEY, label TEXT)\`}
</schema>
<db src="app.db" tables="widgets"></db>
\${
  type E:enum = { Bad }
  <x> = 7
  <widgets server auth="none"> = ?{\`SELECT * FROM widgets\`}.all()
  function load(id: string)! E {
      if (id == "bad") fail E.Bad;
      return 5;
  }
  function go(id: string) {
      @x = load(id) !{ _ e :> { lift @x } }
  }
}
<main>
  <button id="bad" onclick=go("bad")>b</button>
  <button id="ok" onclick=go("ok")>o</button>
  <p id="out">\${@x}</p>
  <ul><each in=@widgets key=@.id as w><li class="wid">\${w.label}</li></each></ul>
</main>
</program>`;
  test("NEW-1: a page with a Pattern C inline `?{}` server cell still defers the sync guarded write (emitted)", () => {
    const r = compileSource(PATTERN_C);
    expect(r.codes).toEqual([]);
    expect(r.clientJs).toMatch(/\?\{/); // the compiler's own Pattern C comment is on the page
    expect(r.clientJs).not.toMatch(/let \w+ = _scrml(?:_cs)?_reactive_set\("x", _scrml_load/);
    expect(r.clientJs).toMatch(/let (\w+) = _scrml_load_\d+\(id\);\s*if \(\1 && \1\.__scrml_error\) \{[\s\S]*?\} else \{\s*_scrml(?:_cs)?_reactive_set\("x", \1\);\s*\}/);
  });
  test("NEW-1: executed — the cell keeps its old value on failure, then takes the success value", async () => {
    const page = await boot(PATTERN_C, { fetchStub: async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }) });
    expect(page.text("#out")).toBe("7");
    await page.click("#bad");
    expect(page.text("#out")).toBe("7");
    await page.click("#ok");
    expect(page.text("#out")).toBe("5");
  });

  // NEW-2: a guarded write inside the VALUE of another guarded write — the edits would overlap.
  test("NEW-2: a site containing another site's call, and the contained one, are left eager — the output still parses", () => {
    const code = `function go() {
  let A = _scrml_reactive_set("x", run(() => {
    let B = _scrml_reactive_set("y", f());
    if (B && B.__scrml_error) { B = 1; _scrml_reactive_set("y", B); }
    return 2;
  }));
  if (A && A.__scrml_error) { A = 3; _scrml_reactive_set("x", A); }
}`;
    const out = deferSyncGuardedCellWrites(code, closingBraceIndex);
    expect(() => new Function(out)).not.toThrow();
    expect(out).toContain(`let A = _scrml_reactive_set("x", run(`);
    expect(out).toContain(`let B = _scrml_reactive_set("y", f());`);
    expect(out).toBe(code);
  });
  test("NEW-2 control: two sibling sites are both rewritten, and the output parses", () => {
    const code = `function go() {
  let A = _scrml_reactive_set("x", f());
  if (A && A.__scrml_error) { A = 3; _scrml_reactive_set("x", A); }
  let B = _scrml_reactive_set("y", g());
  if (B && B.__scrml_error) { B = 1; _scrml_reactive_set("y", B); }
}`;
    const out = deferSyncGuardedCellWrites(code, closingBraceIndex);
    expect(() => new Function(out)).not.toThrow();
    expect(out).toContain("let A = f();");
    expect(out).toContain("let B = g();");
    expect((out.match(/\} else \{/g) ?? []).length).toBe(2);
  });
});
