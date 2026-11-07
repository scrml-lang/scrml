// request-id-unreferenceable-s475.test.js — s475-boot-literal-carriers (Task B): W-REQUEST-ID-UNREFERENCEABLE.
//
// Governing text:
//   Owner ruling, user-voice-scrml.md "⭐ RULED — S475 second batch of owner questions, PA recs adopted
//   wholesale (S475, 2026-11-07)" item 4: "**Unreferenceable request id: yes, a W- code.** A `<request id=…>`
//   whose id is not an identifier (so `<#id>` can never name it) gets a warning."
//   SPEC §6.7.7 (PR #1807): "A `<request>` whose `id` value is not an identifier, such as `id="user-list"`,
//   `id="2fa"` or `id=""`, can never be reached by `<#id>` … The compiler SHALL report
//   W-REQUEST-ID-UNREFERENCEABLE at the `id` attribute and SHALL still compile the request. It runs, and its
//   `@variable` is assigned, as for any other id. The warning's message names the id and says that `<#id>`
//   takes an identifier."
//
// "Identifier" is the bootstrap lexer's: `<#id>` is read from its tokens (parse.scrml hashRefAhead needs one
// `Ident` token), so an id is referenceable exactly when that lexer reads it as one `Ident` (lex.scrml
// isIdentifierText). A reserved word (`if`) is not one.
//
// RED on base (origin/main 95c63e4d7): no warning for any id; `id=""` was E-LIFECYCLE-018 (an Error).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mods, compile, check, realDb, serve, bridge } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram, instancesOf } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 300000 });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; expectNoPageErrors(); });

const SQ = "?" + "{";
const D = "$" + "{";
const W = "W-REQUEST-ID-UNREFERENCEABLE";
const fe = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(ms = 60) { for (let i = 0; i < ms; i++) await tick(); }
let k = 0;

const SRC = (id) => `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <userId:int=1/>
    let <userName:string=""/>
    function loadName(id: int) -> string {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
    <request id="${id}">${D} @userName = loadName(@userId); }</request>
    <main>
        <p id="who">${D}@userName}</p>
    </main>
</program>
`;

describe("an `id` that is not an identifier: W-REQUEST-ID-UNREFERENCEABLE, and the request still compiles", () => {
  for (const id of ["user-list", "2fa", "", "if", "a b", "é"]) {
    test(`id="${id}": one warning at the \`id\` attribute naming the id, no Error`, () => {
      const src = SRC(id);
      const ds = fe(src).diags;
      const w = ds.filter((d) => d.code === W);
      expect(w.length).toBe(1);
      expect(w[0].severity).toBe("Warning");
      expect(w[0].message).toContain(`id="${id}"`);
      expect(w[0].message).toContain("takes an identifier");
      // at the attribute: the span covers `id="…"`
      expect(src.slice(w[0].span.start, w[0].span.end)).toContain(`id="${id}"`);
      expect(ds.filter((d) => d.severity === "Error").map((d) => d.code)).toEqual([]);
    });
  }

  for (const id of ["userReq", "_x", "$a", "a1", "user_list"]) {
    test(`id="${id}" is an identifier: no warning`, () => {
      expect(fe(SRC(id)).diags.map((d) => d.code)).not.toContain(W);
    });
  }
});

describe("the unreferenceable request runs and assigns its `@variable` (SPEC: \"as for any other id\")", () => {
  for (const id of ["user-list", ""]) {
    test(`id="${id}": the load lands in @userName`, async () => {
      const r = compile(SRC(id));
      expect(check(r.core)).toEqual([]);
      const sql = await realDb(["CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"], { users: [{ id: 1, name: "a" }] });
      const { srv } = await serve(r.core, sql);
      globalThis.fetch = bridge(srv);
      const { rt } = await loadProgram(r.core, "req-id-unref-" + k++);
      await settle();
      expect(document.querySelector("#who")?.textContent).toBe("a");
      const prog = instancesOf(rt, "program")[0];
      const i = prog.decl.fields.indexOf("userName");
      expect(prog.fields[i].peek()).toBe("a");
    });
  }

  test("two requests with the same non-identifier id stay refused as a duplicate", () => {
    const two = SRC("x-y").replace("</request>", `</request>\n    <request id="x-y">${D} @userName = loadName(@userId); }</request>`);
    const dup = fe(two).diags.filter((d) => d.severity === "Error" && d.code === "E-BOOTSTRAP-UNSUPPORTED" && d.message.startsWith("two `<request>`s"));
    expect(dup.length).toBe(1);
    // r1 (review F4): no `<#…>` can name such an id, so the message gives no `<#id>` ambiguity reason
    expect(dup[0].message).toContain("share the id `\"x-y\"`");
    expect(dup[0].message).not.toContain("would name either");
  });

  test("two requests with `id=\"\"`: the duplicate message names the empty id without `<#>` (r1 F4)", () => {
    const two = SRC("").replace("</request>", `</request>\n    <request id="">${D} @userName = loadName(@userId); }</request>`);
    const dup = fe(two).diags.filter((d) => d.severity === "Error" && d.code === "E-BOOTSTRAP-UNSUPPORTED" && d.message.startsWith("two `<request>`s"));
    expect(dup.length).toBe(1);
    expect(dup[0].message).toContain("share the id `\"\"`");
    expect(dup[0].message).not.toContain("<#>");
  });

  test("two requests with the same identifier id keep the `<#id>` ambiguity message", () => {
    const two = SRC("abc").replace("</request>", `</request>\n    <request id="abc">${D} @userName = loadName(@userId); }</request>`);
    const dup = fe(two).diags.filter((d) => d.severity === "Error" && d.code === "E-BOOTSTRAP-UNSUPPORTED" && d.message.startsWith("two `<request>`s"));
    expect(dup.length).toBe(1);
    expect(dup[0].message).toContain("would name either");
  });
});
