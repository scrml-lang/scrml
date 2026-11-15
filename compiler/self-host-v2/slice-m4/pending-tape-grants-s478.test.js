// pending-tape-grants-s478.test.js — s478-boot-pending-tape-grants: a pending tape's type carries
// its grants, `(not to S[replace])` / `(not to S[free, append])` (gap
// g-boot-pending-tape-granted-lifecycle-s478).
//
// Governing text (compiler/SPEC.md §13.9.1 rule 4, RULED S478): "`let` there grants an AUTHOR write
// nothing beyond the tape type's own bracket grants …, and neither does the lifecycle `(not to …)`: a
// whole-cell author write into a pending tape, `let` or locked, needs `replace` in the tape's grants
// (`(not to S[replace])`) like any other tape, and without it is **E-WRITE-NOT-GRANTED**. The load's
// own writes are rule 5's, and a reset (§6.8) re-runs the load (§13.9.2), so neither needs
// `replace`." With §66.12.3 (permissions live on the TYPE) and §13.9.3 (reads before
// discrimination are E-TYPE-001).
//
// Red on base (origin/main 5a0fd0eb5): every `(not to S[g])` with a grant was E-BOOTSTRAP-UNSUPPORTED
// at parse ("a granted sequence in a lifecycle type … is not in the bootstrap") — so no author could
// replace a pending tape whole; and a `let` pending tape with NO grants admitted every edit
// (`@users.append(u)`, `@users.pop()` compiled clean: the lifecycle's `replace` channel admitted them).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mods, compile, check, realDb, serve, bridge } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 300000 });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; expectNoPageErrors(); });

const SQ = "?" + "{";
const D = "$" + "{";
const fe = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const errsOf = (src) => fe(src).diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (src) => errsOf(src).map((d) => d.code);
const msgOf = (d) => String(d.message ?? d.msg);
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(n = 60) { for (let i = 0; i < n; i++) await tick(); }
let k = 0;

// `gate`: the list renders under `if=@users` (a pending tape may be `not`); a plain tape is never `not`
const APP = (decl, h, gate = true) => `<program db="./app.db">
    type User:struct = { id: int, let name: string }
    let <q:int=1/>
    function load(n: int) -> User[] {
        const rs: User[] = ${SQ}\`SELECT id, name FROM users WHERE id >= \${n} ORDER BY id\`}.all() !{ _ :> { return []; } };
        return rs;
    }
    ${decl}
    <main>
        <button id="go" onclick={ ${h} }>go</button>
        <button id="all" onclick={ @q = 2; }>all</button>
        <div${gate ? " if=@users" : ""}><each in=@users><p class="u">${D}@.name}</p></each></div>
    </main>
</program>
`;
const LET = (g) => `let <users:(not to User[${g}])=(load(@q) !{ _ :> not })/>`;
const LOCKED = (g) => `<users:(not to User[${g}])=(load(1) !{ _ :> not })/>`;
// the plain tape starts inside its own length bound (a `2..=2` tape holds two), so only the edit is judged
const PLAIN = (g) => g.startsWith("2..=2") ? `<users:User[${g}]=([{ id: 1, name: "a" }, { id: 2, name: "b" }])/>` : `<users:User[${g}]=[]/>`;
const U = `const u: User = { id: 9, name: "z" }; `;
const given = (h) => `if (@users is given) { ${h} }`;

// ---------------------------------------------------------------------------------------------
// A — the spelling parses (was refused by name at parse)
// ---------------------------------------------------------------------------------------------
describe("A — `(not to S[grants])` parses on a pending tape, `let` and locked", () => {
  for (const g of ["replace", "free, append", "free, append, pop, write", "0..=3, append"]) {
    test(`\`(not to User[${g}])\`, let and locked: clean`, () => {
      expect(codes(APP(LET(g), "@q = 3;"))).toEqual([]);
      expect(codes(APP(LOCKED(g), "@q = 3;"))).toEqual([]);
    });
  }
  test("the parse refusal's text is gone", () => {
    for (const d of fe(APP(LET("replace"), "@q = 3;")).diags) expect(msgOf(d)).not.toContain("granted sequence in a lifecycle type");
  });
});

// ---------------------------------------------------------------------------------------------
// B — a whole author write: allowed with `replace`, refused without it (the #1852 message)
// ---------------------------------------------------------------------------------------------
describe("B — a whole-cell author write into a pending tape follows the tape's `replace` grant", () => {
  for (const [name, decl] of [["let", LET], ["locked", LOCKED]]) {
    test(`${name} \`(not to User[replace])\`: a plain, a narrowed and a handled waiting whole write are clean`, () => {
      expect(codes(APP(decl("replace"), "@users = [];"))).toEqual([]);
      expect(codes(APP(decl("replace"), given("@users = [];")))).toEqual([]);
      expect(codes(APP(decl("replace"), "@users = load(2) !{ _ :> not };"))).toEqual([]);
    });
    for (const g of ["", "free, append", "write"]) {
      test(`${name} \`(not to User[${g}])\` (no \`replace\`): a whole write is E-WRITE-NOT-GRANTED, the #1852 message`, () => {
        for (const h of ["@users = [];", given("@users = [];"), "@users = load(2) !{ _ :> not };"]) {
          const es = errsOf(APP(decl(g), h));
          expect(es.map((d) => d.code)).toEqual(["E-WRITE-NOT-GRANTED"]);
          expect(msgOf(es[0])).toContain("needs `replace`");
          expect(msgOf(es[0])).toContain("(not to User[replace])");
          expect(msgOf(es[0])).not.toContain("g-boot-pending-tape-granted-lifecycle-s478");
        }
      });
    }
    test(`${name}: a write of \`not\` stays refused with \`replace\` (the lifecycle path, §66.11.6)`, () => {
      expect(codes(APP(decl("replace"), "@users = not;"))).toEqual(["E-WRITE-NOT-GRANTED"]);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// C — the settle write and `reset` are unchanged
// ---------------------------------------------------------------------------------------------
describe("C — the compiler's settle write and `reset(@x)` need no grant", () => {
  for (const g of ["", "replace", "free, append", "free, pop", "write"]) {
    test(`\`(not to User[${g}])\`, let and locked: the declaration's load and \`reset\` are clean`, () => {
      for (const decl of [LET, LOCKED]) {
        expect(codes(APP(decl(g), "@q = 3;"))).toEqual([]);
        expect(codes(APP(decl(g), "reset(@users);"))).toEqual([]);
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
// D — every grant on a pending tape (narrowed present) behaves as on a plain tape of that type
// ---------------------------------------------------------------------------------------------
const EDITS = [
  ["append", U + "@users.append(u);"],
  ["prepend", U + "@users.prepend(u);"],
  ["pop", "@users.pop();"],
  ["shift", "@users.shift();"],
  ["end-append shape", U + "@users = [...@users, u];"],
  ["front-prepend shape", U + "@users = [u, ...@users];"],
  ["remove(i)", "@users.remove(0);"],
  ["insert(i, x)", U + "@users.insert(0, u);"],
  ["position write", U + "@users[0] = u;"],
  ["element-field write", "@users[0].name = \"q\";"],
  ["whole write", "@users = [];"],
];
const GRANTS = ["", "free, append", "free, prepend", "free, insert", "free, pop", "free, shift", "free, remove", "write",
  "replace", "free, append, pop", "0..=2, append", "2..=2, append"];

describe("D — each grant behaves on a pending tape as on a plain tape of that type", () => {
  for (const g of GRANTS) {
    test(`\`User[${g}]\`: every edit's verdict on a narrowed pending tape (let, locked) = the plain tape's`, () => {
      for (const [what, h] of EDITS) {
        const plain = codes(APP(PLAIN(g), h, false));      // a plain tape is never `not`: no discrimination
        for (const decl of [LET, LOCKED]) {
          expect({ what, codes: codes(APP(decl(g), given(h))) }).toEqual({ what, codes: plain });
        }
      }
    });
  }
  test("the parity is not vacuous: granted edits are clean and ungranted ones refused", () => {
    expect(codes(APP(LET("free, append"), given(U + "@users.append(u);")))).toEqual([]);
    expect(codes(APP(LET("free, pop"), given("@users.pop();")))).toEqual([]);
    expect(codes(APP(LOCKED("write"), given(U + "@users[0] = u;")))).toEqual([]);
    expect(codes(APP(LOCKED(""), given("@users[0].name = \"q\";")))).toEqual([]);   // `let name` grants it
    expect(codes(APP(LET("free, append"), given("@users.pop();")))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(APP(LOCKED("free, pop"), given(U + "@users.append(u);")))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(APP(LET("2..=2, append"), given(U + "@users.append(u);")))).toEqual(["E-WRITE-INVARIANT"]);
  });
  test("red on base: a `let` pending tape with NO grants refuses every edit (the lifecycle's channel admitted them)", () => {
    for (const h of [U + "@users.append(u);", "@users.pop();", U + "@users = [...@users, u];", U + "@users[0] = u;"]) {
      expect(codes(APP(LET(""), given(h)))).toEqual(["E-WRITE-NOT-GRANTED"]);
    }
  });
});

// A `filter` / `map` written back reads `@users.filter(…)` / `.map(…)` on the cell: on a pending tape
// that receiver is a `S | not`, and the bootstrap resolver does not read a narrowing at a method's
// receiver — the open, pre-existing g-bootstrap-method-receiver-narrowing-blind-s469 (any narrowed
// `T | not` cell: `.length`, `.toUpperCase()`, …). Not a grant: refused by name, fail closed; pinned
// here so the parity above takes these shapes when that gap closes.
describe("D′ — a `filter` / `map` written back to a pending tape: refused by the method-receiver gap, not by the grants", () => {
  for (const [what, h, g] of [["filter (remove)", "@users = @users.filter(x => x.id > 1);", "free, remove"], ["map (write)", "@users = @users.map(x => x);", "write"]]) {
    test(`${what}: the plain tape is clean; the narrowed pending tape is E-BOOTSTRAP-UNSUPPORTED at the receiver (\`${g}\` granted)`, () => {
      expect(codes(APP(PLAIN(g), h, false))).toEqual([]);
      for (const decl of [LET, LOCKED]) {
        const es = errsOf(APP(decl(g), given(h)));
        expect(es.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
        expect(msgOf(es[0])).toContain("on a value that is not a sequence (it is `User[] | not`)");
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
// E — the existing pending rules: an edit before discrimination reads a cell that may be `not`
// ---------------------------------------------------------------------------------------------
describe("E — an edit of a pending tape before it is discriminated is E-TYPE-001 (§13.9.3)", () => {
  for (const [what, h] of [["append", U + "@users.append(u);"], ["pop", "@users.pop();"], ["position write", U + "@users[0] = u;"],
                           ["element-field write", "@users[0].name = \"q\";"], ["end-append shape", U + "@users = [...@users, u];"]]) {
    test(`${what}: un-narrowed is E-TYPE-001 naming the load; narrowed (\`is given\`, an early \`is not\` return) is clean`, () => {
      for (const decl of [LET, LOCKED]) {
        const es = errsOf(APP(decl("free, append, pop, write"), h));
        expect(es.map((d) => d.code)).toEqual(["E-TYPE-001"]);
        expect(msgOf(es[0])).toContain("`load(…)` in its declaration");
        expect(codes(APP(decl("free, append, pop, write"), given(h)))).toEqual([]);
        expect(codes(APP(decl("free, append, pop, write"), "if (@users is not) return; " + h))).toEqual([]);
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
// F — a granted tape on a PLAIN lifecycle cell (no waiting initializer) stays refused by name
// ---------------------------------------------------------------------------------------------
describe("F — `(not to S[grants])` on a plain lifecycle cell is refused by name (INTERIM)", () => {
  test("locked `<users:(not to User[free, append])=not/>`: E-BOOTSTRAP-UNSUPPORTED naming the gap", () => {
    const es = errsOf(APP(`<users:(not to User[free, append])=not/>`, "@q = 3;"));
    expect(es.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(msgOf(es[0])).toContain("g-boot-plain-lifecycle-tape-grants-s478");
  });
  test("an ungranted plain lifecycle tape keeps compiling", () => {
    expect(codes(APP(`<users:(not to User[])=not/>`, "@q = 3;"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// G — run time: the grants work on the loaded tape; the load, its reload and `reset` are unchanged
// ---------------------------------------------------------------------------------------------
const RT = (decl) => `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <q:int=1/>
    function load(n: int) -> User[] {
        const rs: User[] = ${SQ}\`SELECT id, name FROM users WHERE id >= \${n} ORDER BY id\`}.all() !{ _ :> { return []; } };
        return rs;
    }
    ${decl}
    <main>
        <button id="app" onclick={ if (@users is given) { const u: User = { id: 9, name: "z" }; @users.append(u); } }>app</button>
        <button id="pop" onclick={ if (@users is given) { @users.pop(); } }>pop</button>
        <button id="rep" onclick={ const v: User = { id: 7, name: "r" }; @users = [v]; }>rep</button>
        <button id="all" onclick={ @q = 2; }>all</button>
        <button id="rs" onclick={ reset(@users); }>rs</button>
        <div if=@users><each in=@users><p class="u">${D}@.name}</p></each></div>
    </main>
</program>
`;
const names = () => [...document.querySelectorAll("p.u")].map((p) => p.textContent);
async function boot(src) {
  const r = compile(src);
  expect(check(r.core)).toEqual([]);
  const { srv } = await serve(r.core, await realDb(["CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"], { users: [{ id: 1, name: "a" }, { id: 2, name: "b" }] }));
  globalThis.fetch = bridge(srv);
  await loadProgram(r.core, "s478-ptg-" + k++);
  await settle();
}

describe("G — run time", () => {
  test("`let (not to User[free, append, pop])`: append / pop edit the loaded tape; a reload replaces it", async () => {
    await boot(RT(`let <users:(not to User[free, append, pop])=(load(@q) !{ _ :> not })/>`).replace(/\s*<button id="rep"[^\n]*\n/, "\n"));
    expect(names()).toEqual(["a", "b"]);
    click(document.querySelector("#app"));
    await settle();
    expect(names()).toEqual(["a", "b", "z"]);
    click(document.querySelector("#pop"));
    click(document.querySelector("#pop"));
    await settle();
    expect(names()).toEqual(["a"]);
    click(document.querySelector("#all"));
    await settle();
    expect(names()).toEqual(["b"]);
    click(document.querySelector("#rs"));
    await settle();
    expect(names()).toEqual(["b"]);
  });
  test("locked `(not to User[replace])`: the author's whole write lands; `reset` re-runs the load", async () => {
    await boot(RT(`<users:(not to User[replace])=(load(1) !{ _ :> not })/>`).replace(/\s*<button id="(app|pop|all)"[^\n]*\n/g, "\n"));
    expect(names()).toEqual(["a", "b"]);
    click(document.querySelector("#rep"));
    await settle();
    expect(names()).toEqual(["r"]);
    click(document.querySelector("#rs"));
    await settle();
    expect(names()).toEqual(["a", "b"]);
  });
  test("locked `(not to User[free, append])`: an append edits the loaded tape (pending `T → T′`, ruling S475 item 3)", async () => {
    await boot(RT(`<users:(not to User[free, append])=(load(1) !{ _ :> not })/>`).replace(/\s*<button id="(pop|rep|all)"[^\n]*\n/g, "\n"));
    expect(names()).toEqual(["a", "b"]);
    click(document.querySelector("#app"));
    await settle();
    expect(names()).toEqual(["a", "b", "z"]);
  });
});
