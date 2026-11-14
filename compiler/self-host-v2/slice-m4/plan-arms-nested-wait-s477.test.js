// plan-arms-nested-wait-s477.test.js — s477-boot-pending-rest (gap g-boot-plan-arms-nested-wait-s475).
//
// analyze.scrml `planArms` refuses a wait inside a `!{}` / `match` arm by name ("an arm that waits
// needs a continuation out of the arm … U1b arm-continuation follow-up", E-BOOTSTRAP-UNSUPPORTED),
// but it walked only an arm BLOCK's top-level statements. A wait nested one level deeper — inside an
// `if`, a loop or an inner block of the arm — got no front-end diagnostic; only the Core checker
// (C-S3 / C-S8s) refused the program, with a message about lowered Core. Red on base 709f53429: the
// nested cases below reported no front-end error at all (the Core checker caught them after lowering).
//
// Governing text: §13.8 (where a waiting value may stand — a suspension point needs a continuation)
// and the bootstrap's INTERIM arm refusal (the capable form is the U1b arm-continuation follow-up).

import { describe, test, expect, beforeAll } from "bun:test";
import { mods } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

beforeAll(() => { mods(); }, { timeout: 300000 });

const SQ = "?" + "{";
const D = "$" + "{";
const U = "E-BOOTSTRAP-UNSUPPORTED";
const fe = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const errsOf = (src) => fe(src).diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const ARM = "a `!{}` / `match` arm";

const APP = (handler) => `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <show:boolean=true/>
    let <who:string=""/>
    function loadName(id: int) -> string {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
    type E:enum = { Bad }
    function check(id: int)! E {
        if (id < 0) fail E.Bad;
        return "ok";
    }
    <main>
        <button id="b" onclick={ ${handler} }>b</button>
        <p>${D}@who}</p>
    </main>
</program>
`;

describe("a wait nested inside a statement of a `!{}` arm block gets the front-end arm refusal", () => {
  test("inside an `if` in the arm block", () => {
    const e = errsOf(APP(`check(1) !{ _ :> { if (@show) { @who = loadName(2) !{ _ :> "?" }; } } };`));
    expect(e.some((d) => d.code === U && d.message.includes(ARM))).toBe(true);
  });

  test("inside a loop in the arm block", () => {
    const e = errsOf(APP(`check(1) !{ _ :> { for (let i = 0; i < 2; i = i + 1) { @who = loadName(i) !{ _ :> "?" }; } } };`));
    expect(e.some((d) => d.code === U && d.message.includes(ARM))).toBe(true);
  });

  test("two levels down (an `if` inside an `if`)", () => {
    const e = errsOf(APP(`check(1) !{ _ :> { if (@show) { if (@who == "") { @who = loadName(2) !{ _ :> "?" }; } } } };`));
    expect(e.some((d) => d.code === U && d.message.includes(ARM))).toBe(true);
  });

  test("a wait at the arm block's top level is still refused the same way (unchanged)", () => {
    const e = errsOf(APP(`check(1) !{ _ :> { @who = loadName(2) !{ _ :> "?" }; } };`));
    expect(e.some((d) => d.code === U && d.message.includes(ARM))).toBe(true);
  });

  test("a nested statement in an arm that does not wait is not refused", () => {
    expect(errsOf(APP(`check(1) !{ _ :> { if (@show) { @who = "x"; } } };`))).toEqual([]);
  });
});
