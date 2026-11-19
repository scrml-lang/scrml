// failclosed.test.js — s444 (PA addition to Phase A): two FAIL-OPEN shapes in the
// bootstrap now fail closed.
//   (1) a scrml STRUCTURAL element the bootstrap does not implement (`<request>`,
//       `<poll>`, `<engine>`, …) used to classify as an HTML element (MHtml) and
//       render as markup with no diagnostic. §4.15 / §24.4: "These element names
//       SHALL NOT be treated as HTML elements." → E-BOOTSTRAP-UNSUPPORTED.
//   (2) a declaration-opener word other than `single` (and the validators) landed
//       in ADecl.mods and was silently ignored — e.g. §6.14 `persist="local"
//       key="…"`. → E-BOOTSTRAP-UNSUPPORTED naming it.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const inMain = (markup) => `<program>\n let <n:int=0/>\n <main>${markup}</main>\n</program>\n`;

// s449: `errors` left this list — `<errors of=…/>` (§55.8) is implemented (gate.test.js).
// s452: `db` left it — `<db src=…>` (§4 state block, §8.1.1 scope) is implemented (error-rulings.test.js).
// s475 (S3a): `request` left this list — `<request>` (§6.7.7) is built (acceptance/request/,
// request-surface-s475.test.js); its non-body shapes are refused by their own codes (below).
// s476: `page` left it — `<page>` in `<program>` (§40.8) is built (page-s476.test.js); a `<page>`
// inside markup, as here, is E-STRUCTURAL-ELEMENT-MISPLACED (§4.15) — still never an HTML element.
// s478: `onIdle` left it — `<onIdle>` at an engine's root is built (durations-s478.test.js); in
// markup, as here, it is E-IDLE-MISPLACED (§51.0.R, §4.15 "the element's specific misplacement code").
// s478: `match` left it — the block-form `<match for=Type on=expr>` is built (match-block-s478.test.js).
// s478: `schema` left it — `<schema>` (§39) is read (schema-s478.test.js); in markup, as here, it
// is E-SCHEMA-003 (§39.3) — still never an HTML element.
// s478-ruled-endpoint: `endpoint` left it — §61.2 (S478 open-Qs ruling (user-voice), item 36): an
// `<endpoint>` that is not a direct child of the top-level `<program>` — in markup, as here — is
// E-STRUCTURAL-ELEMENT-MISPLACED (§4.15).
const STRUCTURAL = [
  "poll", "timer", "timeout", "machine", "errorBoundary", "channel", "onchange", "auth",
  "engine", "onTransition", "onTimeout", "empty", "render", "outlet", "column",
  "formFor", "tableFor", "if", "else", "component", "snippet", "partial", "foreign", "api", "markup",
  "defaults", "keyboard", "mouse", "gamepad",
];

describe("(1) a scrml structural element is never an HTML element", () => {
  for (const tag of STRUCTURAL.filter((t) => t !== "onchange")) {
    test(`<${tag}> → exactly one E-BOOTSTRAP-UNSUPPORTED naming it (was: rendered as markup, no diagnostic)`, () => {
      const d = run(inMain(`<${tag} x="1"><p>inside</p></${tag}>`)).diags;
      expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(d[0].message).toContain(`\`<${tag}>\``);
      expect(d[0].message).toContain("structural element");
    });
  }
  test("s478: an `<onchange>` inside markup is never an HTML element — E-STRUCTURAL-ELEMENT-MISPLACED (§38.13.3)", () => {
    const d = run(inMain(`<onchange x="1"><p>inside</p></onchange>`)).diags;
    expect(d.map((x) => x.code)).toEqual(["E-STRUCTURAL-ELEMENT-MISPLACED"]);
    expect(d[0].message).toContain("`<onchange>`");
  });
  test("s478: an `<onIdle>` inside markup is never an HTML element — E-IDLE-MISPLACED (§51.0.R)", () => {
    const d = run(inMain(`<onIdle x="1"><p>inside</p></onIdle>`)).diags;
    expect(d.map((x) => x.code)).toEqual(["E-IDLE-MISPLACED"]);
    expect(d[0].message).toContain("`<onIdle>`");
  });
  test("s478-ruled-endpoint: an `<endpoint>` inside markup is never an HTML element — E-STRUCTURAL-ELEMENT-MISPLACED (§61.2)", () => {
    const d = run(inMain(`<endpoint x="1"><p>inside</p></endpoint>`)).diags;
    expect(d.map((x) => x.code)).toEqual(["E-STRUCTURAL-ELEMENT-MISPLACED"]);
    expect(d[0].message).toContain("`<endpoint>`");
  });
  test("s476: a `<page>` inside markup is never an HTML element — E-STRUCTURAL-ELEMENT-MISPLACED (§4.15)", () => {
    const d = run(inMain(`<page x="1"><p>inside</p></page>`)).diags;
    expect(d.map((x) => x.code)).toEqual(["E-STRUCTURAL-ELEMENT-MISPLACED"]);
    expect(d[0].message).toContain("`<page>`");
  });
  test("s475: a `<request>` with a markup body is never an HTML element — E-PARSE-ITEM (its body is one `${ … }` block)", () => {
    const d = run(inMain(`<request id="r"><p>inside</p></request>`)).diags;
    expect(d.map((x) => x.code)).toEqual(["E-PARSE-ITEM"]);
    expect(d[0].message).toContain("`<request>` body");
  });
  test("`<request>` as the PA's survey wrote it (the §60 `url=` form, INTERIM): refused, and nothing of it reaches Core", () => {
    const r = run(inMain(`<request id="users" url="/api/users"/>`));
    expect(r.diags.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("`url=` on a `<request>` (§60)");
    // s451: a compile with an error lowers to NO Core (the diagnostics gate) — so nothing of it
    // can reach Core, or the printer, at all.
    expect(r.core == null).toBe(true);
  });
  // r2 F2 (S239 review): a USER declaration of that name wins over the refusal
  // list, exactly as a declaration wins over an HTML element of the same name.
  // s473: EXCEPT the names §4.15 / §24.4 RESERVE — "registering a user component named
  // `engine`, `match`, `each`, `errors`, `onTransition`, `onTimeout`, `onIdle`, `onMount`,
  // `render`, `page`, `endpoint`, `onchange`, `theme`, `defaults`, or `md` is
  // `E-NAME-COLLIDES-RESERVED`" (§24.4: the capitalised spellings too). Those are refused at
  // the declaration (markup-failclosed-s473.test.js); the rest keep r2 F2.
  const RESERVED = ["engine", "match", "each", "errors", "ontransition", "ontimeout", "onidle", "onmount",
    "render", "page", "endpoint", "onchange", "theme", "defaults", "md",
    // S479 ruling item 15 (§4.15): `db` is reserved
    "db"];
  const reserved = (n) => RESERVED.includes(n.toLowerCase());
  const declSrc = (name) => `<program>\n    <${name} label:string="x">\n    </>\n    renders <p>\${label}</p>\n    <main>\n        <${name} label="y"/>\n    </main>\n</program>\n`;
  for (const name of [...STRUCTURAL, "errors", "db", "Page", "Timer", "request"].filter((n) => !reserved(n))) {
    test(`a user declaration named \`${name}\` is used as the declaration, not refused`, () => {
      const r = run(declSrc(name));
      expect(r.diags.map((x) => `${x.code}: ${x.message}`)).toEqual([]);
      expect(mods.check.checkCore(r.core)).toEqual([]);
    });
  }
  for (const name of [...STRUCTURAL, "errors", "Page", "endpoint"].filter(reserved)) {
    test(`a user declaration named \`${name}\` is E-NAME-COLLIDES-RESERVED (§4.15, §24.4)`, () => {
      expect(run(declSrc(name)).diags.map((x) => x.code)).toEqual(["E-NAME-COLLIDES-RESERVED"]);
    });
  }
  // S479 ruling item 15: `db` is reserved, and a use `<db …>` is always the §4 state block — so the
  // use here is read as a `<db>` (no `src=`, a stray `label=`) and refused as one, never rendered
  // as the declaration
  test("a user declaration named `db` is E-NAME-COLLIDES-RESERVED; its use is the `<db>` state block (§4.15, S479)", () => {
    const ds = run(declSrc("db")).diags;
    expect(ds.filter((x) => x.code === "E-NAME-COLLIDES-RESERVED").length).toBe(1);
    expect(ds.filter((x) => x.code !== "E-NAME-COLLIDES-RESERVED").map((x) => x.message).join("\n")).toContain("a `<db>` without `src=` names no database");
  });
  test("a `single` program cell named `page` is E-DECL-SINGLE-INSTANTIATED at `<page/>`, not a structural refusal", () => {
    const src = `<program>\n    type P:enum = { A, B }\n    <page:P=.A single>\n        <A rule=.B : "a">\n        <B rule=.A : "b">\n    </>\n    <main>\n        <page/>\n    </main>\n</program>\n`;
    expect(run(src).diags.map((x) => x.code)).toEqual(["E-DECL-SINGLE-INSTANTIATED"]);
  });
  test("twin: HTML elements and the implemented structural elements are unaffected", () => {
    expect(run(inMain(`<section><p>\${@n}</p></section>`)).diags).toEqual([]);
    expect(run(`<program>\n <xs:string[]=(["a"])/>\n <main><each in=@xs as x><p>\${x}</p></each></main>\n</program>\n`).diags).toEqual([]);
  });
});

describe("(2) an opener word the bootstrap does not read is refused, never ignored", () => {
  // s451 FLIPPED: §6.14 is built for a PROGRAM cell (persist.test.js) — §6.14.1 rule 1-2 and the
  // §6.8.4 opener position ("In the §66 opener it is a **modifier** — the same class as `debounced=`
  // (§6.13), `persist=` (§6.14) and validators"). On a declaration's FIELD it stays refused: §6.14.1
  // rule 3 "On a §66 declaration it governs the **shared instance only**", position + per-instance
  // keys OPEN (O-061-9).
  test("§6.14 `persist=\"local\" key=\"…\"`: read on a program cell; on a declaration's field → one E-BOOTSTRAP-UNSUPPORTED per word, naming O-061-9", () => {
    expect(run(`<program>\n let <mode:string="light" persist="local" key="app.mode"/>\n <main><p>\${@mode}</p></main>\n</program>\n`).diags).toEqual([]);
    const d = run(`<program>\n <box a:int=1>\n  let <c:int=0 persist="local" key="app.c"/>\n </>\n renders <p>\${a}</p>\n <main><box/></main>\n</program>\n`).diags;
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
    for (const x of d) expect(x.message).toContain("O-061-9");
  });
  test("an unknown word on a user declaration and on a child field at depth", () => {
    const d = run(`<program>\n <box a:int=1 frob>\n  let <c:int=0 zap/>\n </>\n renders <p>\${a}</p>\n <main><box/></main>\n</program>\n`).diags;
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
    expect(d[0].message).toContain("`frob`");
    expect(d[1].message).toContain("`zap`");
  });
  test("twin: `single` is read (no diagnostic); a word after a parse error in the same opener is debris, not reported", () => {
    expect(run(`<program>\n type P:enum = { A, B }\n <p:P=.A single>\n  <A rule=.B>\n  <B rule=.A>\n </>\n <main><*p/></main>\n</program>\n`).diags.map((x) => x.code)).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
    const d = run(`<program>\n let <x:int|not=0/>\n <main><p>x</p></main>\n</program>\n`).diags;
    expect(d.map((x) => x.code)).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
});
