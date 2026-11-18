// error-kind-dg-s479.test.js — s479 (lane s479-error-dg): the S479 ruling
// (user-voice-scrml.md "⭐ RULED — S479 batch items 1 and 2, PA recs adopted").
//
// Item 1 — §14.2: "There is no `:error` kind. Error types are enum types (§19.1) … `type
// Name:error = { … }` is not a type declaration — it is `E-PARSE-TYPE` (a type kind other than
// `:enum` / `:struct`), and the message gives the enum form." E-ERROR-008 is retired: a variant
// MAY carry a `message` or `type` payload field.
//
// Item 2 — §31.2: "A cycle of calls between functions — direct recursion, or mutual recursion such
// as two server functions that call each other (§13.4) — is recursion, not a dependency cycle. The
// compiler SHALL NOT reject it." E-DG-001 is retired.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const L = (logic, markup = "<p>x</p>") => `\${\n${logic}\n}\n<program>\n    ${markup}\n</program>\n`;

describe("§14.2 — there is no `:error` kind; error types are enums", () => {
  test("`type E:error = { … }` is one E-PARSE-TYPE whose message gives the enum form", () => {
    const r = run(L(`    type MyError:error = { message: string }`));
    expect(r.diags.map((d) => d.code)).toEqual(["E-PARSE-TYPE"]);
    const m = r.diags[0].message;
    expect(m).toContain("`:error` is not a type kind");
    expect(m).toContain("type MyError:enum = { Failed(reason: string)");
  });

  test("the body is consumed: no cascade on the `{`, and the next item still parses", () => {
    const r = run(L(`    type MyError:error = { reason: string, code: int }\n    fn f() -> int {\n        return 1;\n    }`, `<p>\${f()}</p>`));
    expect(r.diags.map((d) => d.code)).toEqual(["E-PARSE-TYPE"]);
  });

  // review #1966 MED-1: the body is skipped by brace depth, not parsed as fields — an
  // enum-shaped body used to cascade and eat the closing `}`, losing the next item.
  const FN = `\n    fn f() -> int {\n        return 1;\n    }`;
  const CALL = `<p>\${f()}</p>`;
  const codes = (body) => run(L(`    type E:error = ${body}${FN}`, CALL)).diags.map((d) => d.code);

  test("an enum-shaped body is one E-PARSE-TYPE and the next item survives", () => {
    expect(codes(`{ Failed(message: string), Other }`)).toEqual(["E-PARSE-TYPE"]);
  });

  test("a garbage body is one E-PARSE-TYPE (the body is covered by the refusal, §40.8)", () => {
    expect(codes(`{ @x = 5; let y = "}"; if (a) { b() } // }\n }`)).toEqual(["E-PARSE-TYPE"]);
  });

  test("nested braces in the body are balanced by depth", () => {
    expect(codes(`{ A { b: { c: int } }, D(e: { f: string }) }`)).toEqual(["E-PARSE-TYPE"]);
  });

  test("an unclosed `{` is bounded and reported — no worse than the same unclosed `:enum` body", () => {
    // The unclosed body takes the logic block's own `}`, so the block runs to the end of the
    // file; the reports are the `:enum` body's (the block-level `}` missing) plus the refusal.
    const err = run(L(`    type E:error = { Failed(message: string)`)).diags.map((d) => d.code);
    const enm = run(L(`    type E:enum = { Failed(message: string)`)).diags.map((d) => d.code);
    expect(enm).toContain("E-PARSE-EXPECTED");
    expect(err).toEqual(["E-PARSE-TYPE", ...enm]);
  });

  test("an error enum whose variants carry `message` / `type` payload fields compiles clean (E-ERROR-008 retired)", () => {
    const r = run(L(`    type MyError:enum = { Failed(message: string, code: int), Rejected(type: string, reason: string) }`));
    expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  });
});

describe("§31.2 — a call cycle is recursion, not E-DG-001", () => {
  test("two mutually recursive server functions compile with no error", () => {
    const src = `<program db="postgres://localhost/app">

  function loadOwner(id: int) {
    ?{\`SELECT id FROM owners WHERE id = \${id}\`}.all() !{ _ :> [] };
    if (id <= 0) {
      return;
    }
    loadPet(id);
  }

  function loadPet(id: int) {
    ?{\`SELECT id FROM pets WHERE owner_id = \${id}\`}.all() !{ _ :> [] };
    loadOwner(id - 1);
  }

  <button onclick={ loadOwner(1) !{ .Transport(_) :> return }; }>Load</button>

</program>
`;
    const r = run(src);
    const errs = r.diags.filter((d) => d.code.startsWith("E-"));
    expect(errs.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  });
});
