// ruled-refusals-s473.test.js — s473-boot-ruled-refusals: the compile-time refusals bryan ruled in
// S473 (user-voice-scrml.md "⭐ RULED — SPEC-coverage audit decisions D1–D34", "⭐ RULED — S473
// review-surfaced decisions, all PA recs", "⭐ RULED — S473: the transitive `!` envelope counts
// QUERIES, not writes"), each with the SPEC code #1682 wrote for it. Every block is red on base
// (origin/main 2603affc6) and green here.
//
//   1. §8.9.2 amendment (review-surfaced 1, refined): the envelope trigger reads the TRANSITIVE query set (s474 U1e: the interim refusal is now the built envelope).
//   2. §8.9.2 amendment (review-surfaced 2): E-SQL-JOURNAL-OFF.
//   3. §66.15.2 (D11): slot multiplicity — E-COMPONENT-021 / E-COMPONENT-020 / E-DECL-SLOT-OUTSIDE-RENDERS.
//   4. §66.6.8 (D12): a use or `<*x/>` of a declaration with no `renders` — refused, citing O51.
//   5. §26.2 (D13): I-TAILWIND-NOT-BUILT, once per compile.
//   6. §7.6 (D14): a function-body local named like a cell — E-NAME-COLLIDES-STATE.
//   7. §6.5.3 / §17.4b (review-surfaced 5): legacy `key=` on a lifted element — refused with a hint.
//   8. §8.1 E-SQL-SLOT-IN-LITERAL (S468) and §7.5 E-PARAM-TYPE-REQUIRED (S469), re-coded.
//   9. §50 (D10): only the double-parenthesized condition-head assignment — E-ASSIGN-POSITION.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (src) => errs(src).map((d) => d.code);
const SQ = "?" + "{";
const DBP = (body) => `<program db="./app.db">\n${body}\n    let <r:int=0/>\n    <main><button onclick={ @r = move(1) !{ _ :> 0, }; }>go</button></main>\n</program>\n`;
// a non-`!` helper running one query (handled at the site)
const helper = (name, sql) => `    function ${name}(a: int) -> int {\n        ${SQ}\`${sql}\`}.run() !{ _ :> { return 0; } };\n        return 1;\n    }\n`;
const bang = (body) => `    function move(a: int)! SqlError {\n${body}        return 1;\n    }\n`;
// a call of a helper from a `!` body that has no query of its own (it is client-placed, so the call is
// remote and handled — §19.9.10)
const hcall = (v, name, arg) => `const ${v}: int = ${name}(${arg}) !{ _ :> { return 0; } };`;
const own = (sql, nb = "") => `        ${SQ}\`${sql}\`}${nb}.run();\n`;
// s474 (U1e): the envelope is BUILT — what was the interim refusal now compiles, and the Core
// carries the `!` function's Envelope (`standalone`: its set needs a transaction of its own)
const envOf = (src, name = "move") => {
  const r = run(src);
  return r.core ? (r.core.envelopes.find((e) => e.fn.hint === name) ?? null) : null;
};
const enveloped = (src, name = "move") => {
  expect(codes(src)).toEqual([]);
  const e = envOf(src, name);
  expect(e).not.toBeNull();
  expect(e.standalone).toBe(true);
};

// ---------------------------------------------------------------------------
describe("1 — §8.9.2 amendment: the envelope trigger reads the TRANSITIVE query set (s474: built, was the interim refusal)", () => {
  test("two queries, each through a non-`!` helper (the body's own query is `.nobatch()`, so it is server-placed)", () => {
    enveloped(DBP(helper("logIt", "INSERT INTO log (a) VALUES (${a})") + helper("bump", "UPDATE acct SET n = n - ${a}") +
      bang(own("SELECT n FROM acct", ".nobatch()") + "        const x: int = logIt(a);\n        const y: int = bump(a);\n")));
  });

  test("SELECT in the body + UPDATE through a helper (a read-then-write keeps its envelope)", () => {
    enveloped(DBP(helper("bump", "UPDATE acct SET n = n - ${a}") +
      bang(own("SELECT n FROM acct") + "        const y: int = bump(a);\n")));
  });

  test("two levels down: a helper that calls a helper", () => {
    enveloped(DBP(helper("bump", "UPDATE acct SET n = n - ${a}") +
      "    function mid(a: int) -> int {\n        return bump(a);\n    }\n" +
      bang(own("SELECT n FROM acct") + "        const y: int = mid(a);\n")));
  });

  test("one query inside a loop — in the body, and through a helper called in a loop", () => {
    enveloped(DBP(bang("        for (let i = 0; i < 3; i = i + 1) {\n    " + own("UPDATE acct SET n = n - 1") + "        }\n")));
    enveloped(DBP(helper("bump", "UPDATE acct SET n = n - ${a}") +
      bang(own("SELECT n FROM acct", ".nobatch()") + "        for (let i = 0; i < 3; i = i + 1) {\n            const y: int = bump(i);\n        }\n")));
  });

  test("near-misses: one query (own, or through one helper) needs no transaction of its own; `.nobatch()` is not counted", () => {
    expect(codes(DBP(bang(own("UPDATE acct SET n = 1"))))).toEqual([]);
    expect(envOf(DBP(bang(own("UPDATE acct SET n = 1")))).standalone).toBe(false);
    expect(codes(DBP(helper("bump", "UPDATE acct SET n = n - ${a}") + bang(`        ${hcall("y", "bump", "a")}\n`)))).toEqual([]);
    // a loop that runs no query, beside one query outside it
    expect(codes(DBP(bang(own("UPDATE acct SET n = 1") + "        for (let i = 0; i < 3; i = i + 1) {\n            const z: int = i;\n        }\n")))).toEqual([]);
    // a helper whose one query carries `.nobatch()`, beside one own query
    const nb = `    function bump(a: int) -> int {\n        ${SQ}\`UPDATE acct SET n = 0\`}.nobatch().run() !{ _ :> { return 0; } };\n        return 1;\n    }\n`;
    expect(codes(DBP(nb + bang(own("SELECT n FROM acct") + "        const y: int = bump(a);\n")))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("2 — §8.9.2 amendment: `PRAGMA journal_mode = OFF` reaching a `!` function's connection is E-SQL-JOURNAL-OFF", () => {
  test("inside a `!` function (any case or spacing)", () => {
    for (const sql of ["PRAGMA journal_mode = OFF", "pragma JOURNAL_MODE=off", "PRAGMA journal_mode(OFF)", "PRAGMA journal_mode = 'off'"]) {
      const e = errs(DBP(bang(own(sql))));
      expect([sql, e.map((d) => d.code)]).toEqual([sql, ["E-SQL-JOURNAL-OFF"]]);
    }
    expect(errs(DBP(bang(own("PRAGMA journal_mode = OFF"))))[0].message).toContain("rollback");
  });

  test("in a non-`!` function on a database a `!` function writes", () => {
    const off = `    function setup() -> int {\n        ${SQ}\`PRAGMA journal_mode = OFF\`}.run() !{ _ :> { return 0; } };\n        return 1;\n    }\n`;
    const e = errs(DBP(off + bang(own("UPDATE acct SET n = 1"))));
    expect(e.map((d) => d.code)).toEqual(["E-SQL-JOURNAL-OFF"]);
    expect(e[0].message).toContain("setup");
  });

  test("near-misses: other journal modes stay admitted; OFF where no `!` function writes the database", () => {
    for (const sql of ["PRAGMA journal_mode = WAL", "PRAGMA journal_mode = DELETE", "PRAGMA journal_mode"]) {
      expect([sql, codes(DBP(bang(own(sql))))]).toEqual([sql, []]);
    }
    const off = `    function setup() -> int {\n        ${SQ}\`PRAGMA journal_mode = OFF\`}.run() !{ _ :> { return 0; } };\n        return 1;\n    }\n`;
    const readOnly = `<program db="./app.db">\n${off}    function move(a: int)! SqlError {\n${own("SELECT n FROM acct")}        return 1;\n    }\n    let <r:int=0/>\n    <main><button onclick={ @r = move(1) !{ _ :> 0, }; }>go</button><button onclick={ @r = setup() !{ _ :> 0, }; }>s</button></main>\n</program>\n`;
    expect(codes(readOnly)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
const CARD = (renders) => `<program>\n    <card title:string/>\n    renders ${renders}\n`;
describe("3 — §66.15.2 (D11): slot multiplicity", () => {
  test("rule 1: a use with content and a `renders` with no `<slot/>` — E-COMPONENT-021", () => {
    const src = CARD("<div class=\"c\"><p>x</p></div>") + "    <main><card title=\"a\"><b>hi</b></card></main>\n</program>\n";
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-COMPONENT-021"]);
    expect(e[0].message).toContain("<slot/>");
  });

  test("rule 2: two unnamed `<slot/>` in one `renders` — E-COMPONENT-020", () => {
    const src = CARD("<div><slot/><hr/><slot/></div>") + "    <main><card title=\"a\"><b>hi</b></card></main>\n</program>\n";
    expect(codes(src)).toEqual(["E-COMPONENT-020"]);
  });

  test("rule 3: a `<slot/>` outside a declaration's `renders` — E-DECL-SLOT-OUTSIDE-RENDERS", () => {
    const src = "<program>\n    <main><div><slot/></div></main>\n</program>\n";
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-DECL-SLOT-OUTSIDE-RENDERS"]);
    expect(e[0].message).toContain("renders");
  });

  test("near-misses: one slot with content; one slot and no content; no slot and no content", () => {
    expect(codes(CARD("<div><slot/></div>") + "    <main><card title=\"a\"><b>hi</b></card></main>\n</program>\n")).toEqual([]);
    expect(codes(CARD("<div><slot/></div>") + "    <main><card title=\"a\"/></main>\n</program>\n")).toEqual([]);
    expect(codes(CARD("<div>x</div>") + "    <main><card title=\"a\"/></main>\n</program>\n")).toEqual([]);
    expect(codes(CARD("<div>x</div>") + "    <main><card title=\"a\">\n        </card></main>\n</program>\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("4 — §66.6.8 interim (D12): a use of a declaration with no `renders` is refused, citing O51", () => {
  const DECL = "<program>\n    <counter start:int=0>\n        let <n:int=0/>\n    </>\n";
  test("a plain use `<counter/>`, and an `as=`-bound one", () => {
    for (const use of ["<counter/>", "<counter as=c/>"]) {
      const e = errs(DECL + `    <main>${use}<p>x</p></main>\n</program>\n`);
      expect([use, e.map((d) => d.code)]).toEqual([use, ["E-BOOTSTRAP-UNSUPPORTED"]]);
      expect(e[0].message).toContain("O51");
      expect(e[0].message).toContain("§66.6.8");
    }
  });

  test("the reference `<*counter/>` stays refused, citing O51", () => {
    const e = errs(DECL + "    <main><*counter/></main>\n</program>\n");
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("O51");
  });

  test("near-miss: a declaration with a `renders` is used as before", () => {
    expect(codes("<program>\n    <counter start:int=0>\n        let <n:int=0/>\n    </>\n    renders <p>x</p>\n    <main><counter/></main>\n</program>\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("5 — §26.2 (D13): I-TAILWIND-NOT-BUILT, once per compile", () => {
  const info = (src) => run(src).diags.filter((d) => d.code === "I-TAILWIND-NOT-BUILT");
  test("one Info for the compile, naming the first utility class; the compile does not fail", () => {
    const src = "<program>\n    <main><div class=\"card p-4 md:hover:bg-blue-500\">a</div><p class=\"text-sm\">b</p></main>\n</program>\n";
    const i = info(src);
    expect(i.length).toBe(1);
    expect(i[0].severity).toBe("Info");
    expect(i[0].message).toContain("`p-4`");
    expect(i[0].message).toContain("unstyled");
    expect(codes(src)).toEqual([]);
  });

  test("the utility grammar: variants, arbitrary values, negatives, families", () => {
    for (const c of ["flex", "w-[37px]", "-mt-2", "items-center", "bg-slate-50", "dark:text-white", "group-hover:underline", "grid-cols-3", "rounded-lg"]) {
      expect([c, info(`<program>\n    <main><div class="${c}">a</div></main>\n</program>\n`).length]).toEqual([c, 1]);
    }
  });

  test("near-misses: author classes, an unknown variant prefix — no Info", () => {
    for (const c of ["card", "btn-primary", "todo-item done", "weird:p-4", "peer-hover:bg-blue-500"]) {
      expect([c, info(`<program>\n    <main><div class="${c}">a</div></main>\n</program>\n`).length]).toEqual([c, 0]);
    }
  });
});

// ---------------------------------------------------------------------------
describe("6 — §7.6 (D14): a function-body local named like a cell is E-NAME-COLLIDES-STATE", () => {
  const P = (body) => `<program>\n    <count:int=0/>\n    function f() -> int {\n${body}    }\n    <main><p>\${@count}</p></main>\n</program>\n`;
  test("let / const, at the top of the body and nested", () => {
    for (const body of ["        let count = 5;\n        return count;\n", "        const count: int = 5;\n        return count;\n",
      "        if (true) {\n            let count = 2;\n            return count;\n        }\n        return 0;\n"]) {
      const e = errs(P(body));
      expect([body, e.map((d) => d.code)]).toEqual([body, ["E-NAME-COLLIDES-STATE"]]);
    }
    expect(errs(P("        let count = 5;\n        return count;\n"))[0].message).toContain("@count");
  });

  test("near-misses: another name; a parameter named like the cell is not decided (not refused here)", () => {
    expect(codes(P("        let total = 5;\n        return total;\n"))).toEqual([]);
    expect(codes(`<program>\n    <count:int=0/>\n    function f(count: int) -> int {\n        return count;\n    }\n    <main><p>\${@count}</p></main>\n</program>\n`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("7 — §6.5.3 / §17.4b (review-surfaced 5): legacy `key=` on a lifted element is refused with a hint", () => {
  test("`lift <li key=it.id>` — named, with the loop-header form", () => {
    const src = "<program>\n    type Item:struct = { id: int, name: string }\n    <items:Item[]=([])/>\n    <main>\n        <ul>${ for (const it of @items) { lift <li key=it.id>${it.name}</li>; } }</ul>\n    </main>\n</program>\n";
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("§6.5.3");
    expect(e[0].message).toContain("§17.4b");
    expect(e[0].message).toContain("key it.id");
  });

  test("near-miss: the same loop with no `key=` compiles; so does the same loop keyed in the head (s474)", () => {
    expect(codes("<program>\n    type Item:struct = { id: int, name: string }\n    <items:Item[]=([])/>\n    <main>\n        <ul>${ for (const it of @items) { lift <li>${it.name}</li>; } }</ul>\n    </main>\n</program>\n")).toEqual([]);   // errors only (W-KEY-001 is a Warning)
    expect(codes("<program>\n    type Item:struct = { id: int, name: string }\n    <items:Item[]=([])/>\n    <main>\n        <ul>${ for (const it of @items key it.id) { lift <li>${it.name}</li>; } }</ul>\n    </main>\n</program>\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("8 — the SPEC's codes: E-SQL-SLOT-IN-LITERAL (§8.1, S468) and E-PARAM-TYPE-REQUIRED (§7.5, S469)", () => {
  test("a `${…}` inside a quoted SQL literal or a comment", () => {
    for (const sql of ["SELECT n FROM acct WHERE name LIKE '%${a}%'", "SELECT n FROM acct -- ${a}\n"]) {
      const e = errs(DBP(bang(own(sql))));
      expect([sql, e.map((d) => d.code)]).toEqual([sql, ["E-SQL-SLOT-IN-LITERAL"]]);
    }
    expect(errs(DBP(bang(own("SELECT n FROM acct WHERE name LIKE '%${a}%'"))))[0].message).toContain("LIKE ${\"%\" + q + \"%\"}");
  });

  test("an unannotated parameter", () => {
    const e = errs("<program>\n    function f(x) -> int {\n        return 1;\n    }\n    <main><p>x</p></main>\n</program>\n");
    expect(e.map((d) => d.code)).toEqual(["E-PARAM-TYPE-REQUIRED"]);
    expect(e[0].message).toContain("x: Type");
  });

  test("near-misses: a bound slot; an annotated parameter", () => {
    expect(codes(DBP(bang(own("SELECT n FROM acct WHERE name LIKE ${\"%\" + \"a\" + \"%\"}"))))).toEqual([]);
    expect(codes("<program>\n    function f(x: int) -> int {\n        return x;\n    }\n    <main><p>x</p></main>\n</program>\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("9 — §50 (D10): every assignment used as a value outside the kept form is E-ASSIGN-POSITION", () => {
  const F = (body) => `<program>\n    function f(a: int) -> int {\n        let x: int = 0;\n        let y: int = 0;\n${body}        return x;\n    }\n    <main><p>x</p></main>\n</program>\n`;
  test("a single-parenthesized condition, a chain, an initializer, an argument, a return value, an operand", () => {
    for (const body of ["        if (x = a) {\n            y = 1;\n        }\n", "        x = y = a;\n", "        const z: int = (x = a);\n",
      "        y = g(x = a);\n", "        return (x = a);\n", "        y = (x = a) + 1;\n"]) {
      const c = codes(F(body).replace("<main>", "    function g(b: int) -> int {\n        return b;\n    }\n    <main>"));
      expect([body, c]).toEqual([body, ["E-ASSIGN-POSITION"]]);
    }
  });

  test("near-miss: a statement-position assignment is not an expression", () => {
    expect(codes(F("        x = a;\n        y = x + 1;\n"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// #1690 review (FIX-FIRST) — the reviewer's probes (~/.cache/scrml/review/s473-1690/c_*.mjs), red on 98d02fd03.
describe("review F1 — a query reached more than once counts more than once (item 1)", () => {
  const H = helper("bump", "UPDATE acct SET n = n - ${a}");
  const NB = own("SELECT n FROM acct", ".nobatch()");
  test("one helper called twice; a helper calling it twice; a diamond", () => {
    for (const [name, src] of [
      ["same_helper_twice_server", DBP(H + bang(NB + "        const y: int = bump(a);\n        const w: int = bump(a);\n"))],
      ["mid_calls_twice", DBP(H + "    function mid(a: int) -> int {\n        const y: int = bump(a);\n        return bump(a);\n    }\n" + bang(NB + "        const y: int = mid(a);\n"))],
      ["diamond", DBP(H + "    function m1(a: int) -> int {\n        return bump(a);\n    }\n    function m2(a: int) -> int {\n        return bump(a);\n    }\n" + bang(NB + "        const y: int = m1(a);\n        const w: int = m2(a);\n"))],
    ]) {
      expect([name, codes(src)]).toEqual([name, []]);
      expect([name, envOf(src).standalone]).toEqual([name, true]);
    }
  });
  test("near-miss: reached once through a chain", () => {
    expect(codes(DBP(H + "    function mid(a: int) -> int {\n        return bump(a);\n    }\n" + bang(NB + "        const y: int = mid(a);\n")))).toEqual([]);
  });
});

describe("review F2 / F3 — `journal_mode = OFF` behind a comment, and through a call (item 2)", () => {
  test("a leading block or line comment, an inner comment", () => {
    for (const sql of ["/* c */ PRAGMA journal_mode = OFF", "-- c\nPRAGMA journal_mode = OFF", "PRAGMA journal_mode /* x */ = OFF"]) {
      expect([sql, codes(DBP(bang(own(sql))))]).toEqual([sql, ["E-SQL-JOURNAL-OFF"]]);
    }
    expect(codes(DBP(bang(own("/* c */ PRAGMA journal_mode = WAL"))))).toEqual([]);
  });
  test("in a helper a `!` function calls; elsewhere, when the `!` function writes only through a helper", () => {
    const off = (p) => `    function setup(${p}) -> int {\n        ${SQ}\`PRAGMA journal_mode = OFF\`}.run() !{ _ :> { return 0; } };\n        return 1;\n    }\n`;
    expect(codes(DBP(off("a: int") + bang(`        ${hcall("y", "setup", "a")}\n`)))).toEqual(["E-SQL-JOURNAL-OFF"]);
    const bump = helper("bump", "UPDATE acct SET n = 1");
    const src = `<program db="./app.db">\n${off("")}${bump}${bang(`        ${hcall("y", "bump", "a")}\n`)}    let <r:int=0/>\n    <main><button onclick={ @r = move(1) !{ _ :> 0, }; }>go</button><button onclick={ @r = setup() !{ _ :> 0, }; }>s</button></main>\n</program>\n`;
    expect(codes(src)).toEqual(["E-SQL-JOURNAL-OFF"]);
  });
});

describe("review F5 / F6 — slots: one correct code each (item 3)", () => {
  test("a named slot (any case) is refused once, as O9 — not also outside-renders", () => {
    for (const nm of ["name", "NAME"]) {
      const e = errs(CARD(`<div><slot ${nm}="h"/></div>`) + "    <main><card title=\"a\"/></main>\n</program>\n");
      expect([nm, e.map((d) => d.code)]).toEqual([nm, ["E-BOOTSTRAP-UNSUPPORTED"]]);
      expect(e[0].message).toContain("O9");
    }
  });
  test("a `<slot/>` lifted in a loop of the renders is inside it: E-COMPONENT-020 (once per row), not outside-renders / -021", () => {
    const e = errs(CARD("<div>${ for (const x of [1, 2]) { lift <slot/>; } }</div>") + "    <main><card title=\"a\"><b>hi</b></card></main>\n</program>\n");
    expect(e.map((d) => d.code)).toEqual(["E-COMPONENT-020"]);
    expect(e[0].message).toContain("once per row");
  });
});

describe("review F8 / F9 / F12", () => {
  test("F8: `key=` off a loop is not judged by the legacy-key refusal", () => {
    expect(codes("<program>\n    <main><p key=\"a\">x</p></main>\n</program>\n")).toEqual([]);
  });
  test("F9 (s474: the header `key` is built): the hint says to move the key into the loop head", () => {
    const src = "<program>\n    type Item:struct = { id: int, name: string }\n    <items:Item[]=([])/>\n    <main>\n        <ul>${ for (const it of @items) { lift <li key=it.id>${it.name}</li>; } }</ul>\n    </main>\n</program>\n";
    expect(errs(src)[0].message).toContain("Move it into the loop head");
  });
  test("F12: a for-of binder named like a cell is E-NAME-COLLIDES-STATE", () => {
    const src = `<program>\n    <count:int=0/>\n    function f() -> int {\n        for (const count of [1, 2]) {\n            return count;\n        }\n        return 0;\n    }\n    <main><p>\${@count}</p></main>\n</program>\n`;
    expect(codes(src)).toEqual(["E-NAME-COLLIDES-STATE"]);
  });
});

// ---------------------------------------------------------------------------
// Ruled S473 (user-voice "⭐ RULED — S473 #1690 review: `!` callees count toward the envelope; client
// multi-call `!` is a permanent refusal"): F10 and F11.
describe("F10 — a `!` callee's queries count toward the outer `!` function's set (s474: built — the inner is a savepoint)", () => {
  const G = `    function g(a: int)! SqlError {\n${own("UPDATE acct SET n = 2")}        return 1;\n    }\n`;
  const NB = own("SELECT n FROM acct", ".nobatch()");
  test("an outer `!` calling an inner `!` twice; an outer UPDATE plus one `!` call; a `!` called in a loop", () => {
    for (const [name, src] of [
      ["inner twice", DBP(G + bang(NB + "        const y: int = g(a) !{ _ :> { return 0; } };\n        const w: int = g(a) !{ _ :> { return 0; } };\n"))],
      ["outer UPDATE + one ! call", DBP(G + bang(own("UPDATE acct SET n = 1") + "        const y: int = g(a) !{ _ :> { return 0; } };\n"))],
      ["! in a loop", DBP(G + bang(NB + "        for (let i = 0; i < 3; i = i + 1) {\n            const y: int = g(i) !{ _ :> { return 0; } };\n        }\n"))],
    ]) {
      expect([name, codes(src)]).toEqual([name, []]);
      expect([name, envOf(src).standalone]).toEqual([name, true]);
      // the inner `!` (one query) is a savepoint inside the outer's transaction
      expect([name, envOf(src, "g").standalone]).toEqual([name, false]);
    }
  });
  test("near-miss: an outer whose set holds exactly one query (its own `.nobatch()` read, one `!` call)", () => {
    expect(codes(DBP(G + bang(NB + "        const y: int = g(a) !{ _ :> { return 0; } };\n")))).toEqual([]);
    expect(envOf(DBP(G + bang(NB + "        const y: int = g(a) !{ _ :> { return 0; } };\n"))).standalone).toBe(false);
  });
});

describe("F11 — a client-placed `!` function making two or more server calls: E-TX-CLIENT-MULTI-CALL (permanent)", () => {
  const L = helper("logIt", "INSERT INTO log (a) VALUES (${a})") + helper("bump", "UPDATE acct SET n = n - ${a}");
  test("two server calls; one in a loop", () => {
    for (const [name, body] of [
      ["two calls", `        ${hcall("x", "logIt", "a")}\n        ${hcall("y", "bump", "a")}\n`],
      ["one call in a loop", `        for (let i = 0; i < 3; i = i + 1) {\n            ${hcall("y", "bump", "i")}\n        }\n`],
    ]) {
      const e = errs(DBP(L + bang(body)));
      expect([name, e.map((d) => d.code)]).toEqual([name, ["E-TX-CLIENT-MULTI-CALL"]]);
      expect(e[0].message).toContain("Compose the calls in one server `!` function");
    }
  });
  test("near-miss: one server call", () => {
    expect(codes(DBP(L + bang(`        ${hcall("y", "bump", "a")}\n`)))).toEqual([]);
  });
});
