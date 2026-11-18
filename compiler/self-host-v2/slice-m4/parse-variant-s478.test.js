// parse-variant-s478.test.js — s478-ruled-stdlib-data: the §41.13 `parseVariant(json, EnumType)`
// intrinsic on the bootstrap, compiled against the REAL `scrml:data` (supplied per name — the
// barrel's `parse.scrml` target only; stdlib-per-name-s478.test.js).
//
// RULED (scrml-support/user-voice-scrml.md, "⭐ RULED — open owner questions, PA recs adopted
// wholesale (S478, 2026-11-17)", item 56): "Q2: `parseVariant`. RULED: build the intrinsic (§41.13
// is normative; 8 cases), after Q1."
//
// SPEC §41.13 (quoted where each rule is tested): the second argument is a bare `:enum` type
// identifier (E-PARSEVARIANT-TYPE-NOT-ENUM); no payload field is named `tag`
// (E-PARSEVARIANT-TAG-FIELD); the call is failable with the four `ParseError` variants; the
// discriminator is the enum's own variant names; "callable in both server-side and client-side
// contexts". The decode is STRICT on keys (§61.3, whose body "decodes … via parseVariant": "The
// request body's keys SHALL be exactly `tag` and payload fields of the variant `tag` names. A key
// that is neither is a decode failure — `::InvalidPayload`").

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mods, check, serve, post, pathOf } from "./server-artifact-harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";
import { parseVariant, failed } from "../slice-m1/runtime/runtime.js";

const ENTRY = "app.scrml";
beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => { expectNoPageErrors(); });

const fe = (src) => frontEndStdlib(mods(), [{ path: ENTRY, src }], ENTRY);
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (src) => errs(fe(src)).map((d) => d.code);
const clean = (src) => {
  const r = fe(src);
  expect(errs(r).map((d) => `${d.code} ${d.file}: ${d.message}`)).toEqual([]);
  expect(check(r.core)).toEqual([]);
  return r;
};
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
let k = 0;

const TYPES = `    type LoadResult:enum = {
        Success(rows: int)
        Empty
        Failed(reason: string)
    }`;

// a program that decodes the text in `@raw` on a click and shows which arm ran
const decoder = (types = TYPES, en = "LoadResult") => `<program>
import { parseVariant } from 'scrml:data';
${types}
    let <raw="none"/>
    let <out="idle"/>
    function decode() {
        const r: ${en} = parseVariant(@raw, ${en}) !{
            ::MissingDiscriminator          :> { @out = "missing"; return; },
            ::UnknownVariant(tag)           :> { @out = "unknown:" + tag; return; },
            ::InvalidPayload(field, reason) :> { @out = "invalid:" + field; return; },
            ::Malformed(reason)             :> { @out = "malformed"; return; }
        };
        @out = match r {
            .Success(rows) :> \`rows:\${rows}\`,
            .Empty :> "empty",
            .Failed(reason) :> "failed:" + reason
        };
    }
    <input id="raw" bind:value=@raw/>
    <button id="go" onclick=decode()>go</button>
    <p id="out">\${@out}</p>
</program>
`;

describe("the decode, compiled and RUN (client side)", () => {
  const cases = [
    ['{"tag":"Success","rows":42}', "rows:42"],
    ['{"tag":"Empty"}', "empty"],
    ['{"tag":"Failed","reason":"x"}', "failed:x"],
    ["not json", "malformed"],
    ["[1,2]", "malformed"],                                  // an array is not an object
    ["null", "malformed"],                                    // §41.13: null routes to Malformed
    ['"Empty"', "malformed"],                                 // a JSON string is not an object
    ['{"foo":1}', "missing"],
    ['{"tag":7}', "missing"],                                  // a non-string tag names no variant
    ['{"tag":"Archived"}', "unknown:Archived"],
    ['{"tag":"__proto__"}', "unknown:__proto__"],              // names are compared, never looked up
    ['{"tag":"toString"}', "unknown:toString"],
    ['{"tag":"Success","rows":"lots"}', "invalid:rows"],      // no coercion
    ['{"tag":"Success","rows":1.5}', "invalid:rows"],         // an int is an integer
    ['{"tag":"Success"}', "invalid:rows"],                    // a missing field
    ['{"tag":"Success","rows":1,"extra":2}', "invalid:extra"], // STRICT KEYS (§61.3)
    ['{"tag":"Empty","rows":1}', "invalid:rows"],             // a unit variant carries no field
  ];
  test("each input routes to its success arm or its ParseError variant", async () => {
    const r = clean(decoder());
    await loadProgram(r.core, "s478pv-" + k++);
    for (const [raw, want] of cases) {
      const inp = document.querySelector("#raw");
      inp.value = raw;
      inp.dispatchEvent(new Event("input"));
      click(document.querySelector("#go"));
      await settle();
      expect([raw, document.querySelector("#out").textContent]).toEqual([raw, want]);
    }
  });

  test("every payload field type the decode reads: int, number, string, bool", async () => {
    const types = `    type V:enum = {
        A(i: int, n: number, s: string, b: bool)
        B
    }`;
    const src = `<program>
import { parseVariant } from 'scrml:data';
${types}
    let <out="idle"/>
    function decode() {
        const v: V = parseVariant('{"tag":"A","i":3,"n":2.5,"s":"hi","b":true}', V) !{
            ::MissingDiscriminator :> { @out = "missing"; return; },
            ::UnknownVariant(tag) :> { @out = "unknown"; return; },
            ::InvalidPayload(field, reason) :> { @out = "invalid:" + field; return; },
            ::Malformed(reason) :> { @out = "malformed"; return; }
        };
        @out = match v {
            .A(i, n, s, b) :> \`A \${i} \${n} \${s} \${b}\`,
            .B :> "B"
        };
    }
    <button id="go" onclick=decode()>go</button>
    <p id="out">\${@out}</p>
</program>
`;
    const r = clean(src);
    await loadProgram(r.core, "s478pv-" + k++);
    click(document.querySelector("#go"));
    await settle();
    expect(document.querySelector("#out").textContent).toBe("A 3 2.5 hi true");
  });
});

describe("the decode on the SERVER (§41.13: callable in both contexts)", () => {
  const src = `<program>
import { parseVariant } from 'scrml:data';
${TYPES}
    server function kind(raw: string) -> string {
        const r: LoadResult = parseVariant(raw, LoadResult) !{
            ::MissingDiscriminator :> { return "missing"; },
            ::UnknownVariant(tag) :> { return "unknown:" + tag; },
            ::InvalidPayload(field, reason) :> { return "invalid:" + field; },
            ::Malformed(reason) :> { return "malformed"; }
        };
        return match r {
            .Success(rows) :> \`rows:\${rows}\`,
            .Empty :> "empty",
            .Failed(reason) :> "failed:" + reason
        };
    }
    let <out="idle"/>
    <button id="go" onclick={ @out = kind("x") !{ .Transport(t) :> return }; }>go</button>
    <p id="out">\${@out}</p>
</program>
`;
  test("a server function decodes; the route answers with each arm's value", async () => {
    const r = clean(src);
    const { srv, routes, js } = await serve(r.core, null);
    expect(js).toMatch(/parseVariant\(/);
    for (const [raw, want] of [['{"tag":"Success","rows":7}', "rows:7"], ['{"tag":"Nope"}', "unknown:Nope"], ['{"tag":"Success","rows":7,"x":1}', "invalid:x"], ["{", "malformed"]]) {
      const res = await post(srv, pathOf(routes, "kind"), [raw]);
      expect([raw, res.status, res.json]).toEqual([raw, 200, want]);
    }
  });
});

describe("compile-time rules (§41.13)", () => {
  const call = (arg2, types = TYPES, handler = "!{ _ :> { return; } }") => `<program>
import { parseVariant } from 'scrml:data';
${types}
    type UserRow:struct = { id: int }
    function decode() {
        parseVariant('{}', ${arg2}) ${handler};
    }
    <button onclick=decode()>go</button>
</program>
`;
  test("the second argument is a bare `:enum` type identifier — else E-PARSEVARIANT-TYPE-NOT-ENUM", () => {
    expect(codes(call("LoadResult"))).toEqual([]);
    expect(codes(call("UserRow"))).toEqual(["E-PARSEVARIANT-TYPE-NOT-ENUM"]);   // a struct
    expect(codes(call('"LoadResult"'))).toEqual(["E-PARSEVARIANT-TYPE-NOT-ENUM"]);  // a string, not the type
    expect(codes(call("Nothing"))).toEqual(["E-SCOPE-001"]);                   // a name of nothing is undeclared
  });

  test("a payload field named `tag` is E-PARSEVARIANT-TAG-FIELD", () => {
    const types = `    type T:enum = {
        A(tag: string)
        B
    }`;
    expect(codes(call("T", types))).toEqual(["E-PARSEVARIANT-TAG-FIELD"]);
  });

  test("a payload field the decode does not read (an enum, a tape, a refinement) is refused by name — INTERIM", () => {
    const nested = `    type In:enum = { X, Y }
    type T:enum = {
        A(inner: In)
        B
    }`;
    expect(codes(call("T", nested))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    const refined = `    type T:enum = {
        A(n: int(>0))
        B
    }`;
    // (the refined variant field is refused at its declaration too — g-boot-refinement-runtime-checks-s478)
    const rr = errs(fe(call("T", refined)));
    expect([...new Set(rr.map((d) => d.code))]).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(rr.some((d) => d.message.includes("`parseVariant` decode does not read"))).toBe(true);
  });

  test("the call is failable: unhandled is E-ERROR-002; a non-exhaustive handler is refused", () => {
    expect(codes(call("LoadResult", TYPES, ""))).toEqual(["E-ERROR-002"]);
    const partial = "!{ ::Malformed(reason) :> { return; } }";
    expect(codes(call("LoadResult", TYPES, partial)).length).toBeGreaterThan(0);
  });

  test("the JSON argument is text: a non-`string` argument is refused", () => {
    const src = call("LoadResult").replace("parseVariant('{}',", "parseVariant(1,");
    expect(codes(src).length).toBeGreaterThan(0);
  });

  test("bare `::Variant` arms need no `ParseError` import (§41.13 'ParseError is NOT ambient')", () => {
    const src = call("LoadResult", TYPES, "!{ ::MissingDiscriminator :> { return; }, ::UnknownVariant(t) :> { return; }, ::InvalidPayload(f, r) :> { return; }, ::Malformed(r) :> { return; } }");
    expect(codes(src)).toEqual([]);
  });

  test("arity: two arguments", () => {
    const src = call("LoadResult").replace("parseVariant('{}', LoadResult)", "parseVariant('{}')");
    expect(codes(src)).toEqual(["E-CALL-ARITY"]);
  });
});

describe("the runtime half directly (slice-m1/runtime/runtime.js parseVariant)", () => {
  const T = { defs: [{ k: "enum", name: "E", variants: [{ name: "A", fields: [{ name: "n", ty: { k: "int" } }] }, { name: "B", fields: [] }] }], root: { k: "ref", def: 0 } };
  const PE = { defs: [{ k: "enum", name: "ParseError", variants: [
    { name: "MissingDiscriminator", fields: [] },
    { name: "UnknownVariant", fields: [{ name: "tag", ty: { k: "str" } }] },
    { name: "InvalidPayload", fields: [{ name: "field", ty: { k: "str" } }, { name: "reason", ty: { k: "str" } }] },
    { name: "Malformed", fields: [{ name: "reason", ty: { k: "str" } }] },
  ] }], root: { k: "ref", def: 0 } };
  test("values in the runtime enum shape; failures carry ParseError values positionally", () => {
    expect(parseVariant(T, PE, '{"tag":"A","n":1}')).toEqual({ variant: "A", data: [1] });
    expect(parseVariant(T, PE, '{"tag":"B"}')).toBe("B");
    const f = parseVariant(T, PE, '{"tag":"Z"}');
    expect(failed(f)).toBe(true);
    expect(f.error).toEqual({ variant: "UnknownVariant", data: ["Z"] });
    expect(parseVariant(T, PE, '{"x":1}').error).toBe("MissingDiscriminator");
    expect(parseVariant(T, PE, '{"tag":"A","n":1,"m":2}').error.data[0]).toBe("m");
  });
});
