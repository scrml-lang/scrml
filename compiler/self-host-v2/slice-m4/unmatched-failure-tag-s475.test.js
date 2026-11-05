// unmatched-failure-tag-s475.test.js — s475-boot-small-fixes item 2
// (g-boot-unmatched-failure-tag-uncapped-s474).
//
// `unmatchedFailure` (slice-m1/runtime/runtime.js, re-exported by server-runtime.js) is the
// fail-closed fall-through of a handled failure no arm names. It names only the enum and the
// variant's tag, never a payload. A raw string error used to be echoed whole into the server log
// and the client console; the tag is now echoed only when it is an identifier (≤ 64 chars), else "?".
// "red on base" = failed on origin/main be56b6dad.

import { describe, test, expect } from "bun:test";
import * as rt from "../slice-m1/runtime/runtime.js";
import * as srt from "../slice-m1/runtime/server-runtime.js";

const messageOf = (fn) => {
  try { fn(); } catch (e) { return String(e && e.message); }
  throw new Error("unmatchedFailure did not throw");
};

for (const [tier, mod] of [["client runtime", rt], ["server runtime", srt]]) {
  describe(`unmatchedFailure caps the tag to an identifier — ${tier}`, () => {
    test("a variant record: the enum and the tag, no payload (green on both)", () => {
      const m = messageOf(() => mod.unmatchedFailure({ variant: "QueryFailed", data: ["SECRET-PAYLOAD"] }, "SqlError"));
      expect(m).toContain("(SqlError.QueryFailed)");
      expect(m).not.toContain("SECRET");
    });
    test("a unit variant as a string tag is echoed (green on both)", () => {
      expect(messageOf(() => mod.unmatchedFailure("Locked", "AuthErr"))).toContain("(AuthErr.Locked)");
    });
    test("a raw non-identifier string error is NOT echoed: \"?\" (red on base)", () => {
      const m = messageOf(() => mod.unmatchedFailure("password=hunter2 for alice@example.com", "AuthErr"));
      expect(m).toContain("(AuthErr.?)");
      expect(m).not.toContain("hunter2");
    });
    test("a forged non-identifier `variant` is NOT echoed (red on base)", () => {
      const m = messageOf(() => mod.unmatchedFailure({ variant: "<img src=x onerror=alert(1)>" }, "AuthErr"));
      expect(m).toContain("(AuthErr.?)");
      expect(m).not.toContain("onerror");
    });
    test("an identifier longer than 64 characters is NOT echoed (red on base)", () => {
      const long = "A" + "b".repeat(64);
      const m = messageOf(() => mod.unmatchedFailure(long, "AuthErr"));
      expect(m).toContain("(AuthErr.?)");
      expect(m).not.toContain(long);
      expect(messageOf(() => mod.unmatchedFailure("A" + "b".repeat(63), "AuthErr"))).toContain("(AuthErr.A" + "b".repeat(63) + ")");
    });
    test("it still fails closed: always throws, never returns (green on both)", () => {
      expect(() => mod.unmatchedFailure(null, "E")).toThrow("reached no arm");
    });
  });
}
