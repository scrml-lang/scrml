---
from: lotto-analyzer (~/projects/lotto-analyzer, user-directed adopter app on the bootstrap)
to: scrml
date: 2026-11-08
subject: bootstrap adopter findings — O(n²) local-tape append, derived cell silently seeded by an inner-tape grant, + 4 friction items
needs: triage
status: unread
---

Found while writing a Colorado Lotto+ simulator (`~/projects/lotto-analyzer/analyzer.scrml`, ~500 lines) with `scripts/scrml-boot.ts compile` on scrml `main` @ `a9057254c`. Every item below was reproduced on that commit. Each repro is short enough to paste into a test.

## 1. MED (perf) — append to a local tape costs O(n) per call, so building one by append is O(n²)

`rt.tapeAppend` (`compiler/self-host-v2/slice-m1/runtime/runtime.js:2425`) is `copyOf(xs)` + `push` on every call. The canonical way to build a list in a pure `fn` (`let out: T[free, append] = []; for (…) { out.append(x); }`) is therefore quadratic.

Measured (headless Chromium; one struct appended per iteration, plus a little arithmetic):
- 10,000 appends: about 150 ms
- 100,000 appends: about 18 s (10× the n gave about 120× the time)

The app had to cap its input at 20,000 because of this. Any adopter program that builds a history, log, or report over a list will hit it.

Repro: any `fn` that does `let out: int[free, append] = []; let i: int = 0; for (i < 100000) { out.append(i); i = i + 1; } return out;`, timed in the browser.

**Addendum (same day): slot writes have the same cost.** `xs[i] = v` on a local lowers to `rt.writePath`, which does `obj.slice()` on every write (runtime.js around line 1476). So a counting table updated in a loop also costs O(n) per write. The app had to drop a 780-slot pair table for a scan-back design. Measured against a plain-JS port of the same simulation (itself unoptimized, and also copying arrays per drawing), the bootstrap build runs about 3× slower: 1,372 ms vs 444 ms for one run; 15.4 s vs 4.7 s for a 10-history batch.

Suggested direction (not ruled): §66.10 value semantics only needs a copy when an alias could see the write. A local that no other binding has read since its last write could append in place, as a uniqueness or copy-on-write check in the lowering, or an owned-buffer variant in the runtime. `sortBy` / `tapePrepend` / `tapeConcat` have the same copy-per-call shape, but they are not called in loops as often.

## 2. MED (silent stale output) — a locked cell whose ELEMENT type holds a granted tape is seeded once, not derived

This is a variant of the open `g-boot-derived-cell-with-grants-takes-writes-s472` (known-gaps.md:1102, "RULED S473: needs a design pass"). It is worse than that entry's case: here the program writes no grant on the cell at all. The grant sits on a tape inside a struct the cell's elements hold, and nothing ever writes the cell. The cell still compiles to `rt.seeded`, stops tracking its inputs, and the page shows stale values with no diagnostic.

```scrml
<program>
    type Row:struct = { xs: int[replace] }
    let <n:int=1/>
    <rows:Row[]=(make(@n))/>
    fn make(n: int) -> Row[] {
        let out: Row[free, append] = [];
        let i: int = 0;
        for (i < n) { out.append({ xs: [i] }); i = i + 1; }
        return out;
    }
    function bump() { @n = @n + 1; }
    <main>
        <button id="inc" onclick=bump()>+</button>
        <p id="o">${@n} ${@rows.length}</p>
    </main>
</program>
```
Emits `fields[1 /* rows */] = rt.seeded(...)`. After two clicks the page shows `3 1`, where it should show `3 3`. With `xs: int[]` it emits `rt.derived` and works.

Per print.scrml `fieldCtor` (around line 3142), any `f.wcap` makes a field seeded, and the wcap evidently comes from nested element grants. In the app this made the whole simulation (a derived `Sim` holding `Entry[replace]`) stop updating after the first render. I found it only because I was comparing against a JS reference.

Asks:
- at minimum, a diagnostic when a locked cell's initializer reads cells but the cell is seeded;
- the design pass for the parent gap should cover the inner-grant case explicitly.

## 3. LOW (friction / misleading diagnostic) — `<each in=fn()>` loses the element type

```scrml
type F:struct = { a: int }
fn mk() -> F[] { let out: F[free, append] = []; out.append({ a: 1 }); return out; }
<main><ol><each in=mk() as f><li>${f.a}</li></each></ol></main>
```
This gives `E-BOOTSTRAP-UNSUPPORTED: member access .a on a value that is not a struct or an instance`, even though `mk` declares `-> F[]`.

**Addendum (same day):** `for (x of mk()) { … x.a … }` inside a `fn` fails the same way. Iterating a call result directly loses the declared element type; binding it first (`const xs: F[] = mk(); for (x of xs)`) works. So the gap is "a for-of or each source that is a call expression", not something specific to `<each>`. The workaround is a derived cell (`<fs:F[]=(mk())/>`, then `<each in=@fs>`). The message should name the real limit (an `each` source that is a call) and give that workaround.

## 4. LOW (friction) — an array literal is not a typed receiver

`${[10, 9, 2].sort().join(",")}` gives two E-BOOTSTRAP-UNSUPPORTED ("a built-in method needs a receiver of a known type"). An int array literal's type is knowable.

## 5. LOW (behaviour, maybe intended) — one trap in one text effect blanks the whole page

`round(NaN, .HalfUp)` (from a 0/0 in a derived summary while the history was empty) raised `E-INT-CONVERSION-RT` inside an `rt.text` effect during mount. The entire `<main>` never rendered, including the inputs. The trap itself is right (§41.18). The blast radius may not be: the whole mount aborted rather than the one hole. Flagging it in case mount-time isolation is unruled.

## 6. Already-known gaps hit (no action, just adopter-frequency data)

- `<input type="number" bind:value=@int>` is refused, so the adopter binds a `string` and uses `scrml:math` `parseInt(s, 10)`. Every numeric form needs this.
- int `/` int is refused and `div` is not in the bootstrap yet. Workaround: `fn ratio(a: number, b: number) -> number { return a / b; }`, widening at the parameter, plus `round(ratio(a, b), .Floor)` for integer division.
- `xs[i].f` is not in the bootstrap (the diagnostic says to bind the element first; clear and actionable).
- `on` is reserved as a cell name (E-DECL-ILLEGAL-FIELD-NAME). The message is clear; adopters will hit it with checkbox state.

Positive notes: E-HTML-PARSER-REPAIR (`<tr>` directly in `<table>`) and E-WRITE-NOT-GRANTED (outer `replace` vs inner tape) were both precise and told me exactly what to write.

#adopter-findings #bootstrap #perf #reactivity #lotto-analyzer

## 7. HIGH (resource) — `scrml-boot.ts dev` appears to leak across rebuilds (added 2026-11-10)

`bun scripts/scrml-boot.ts dev analyzer.scrml --output-dir dist --port 4747` (scrml main, 2026-11-08), left running for one working session on the 2,300-line `analyzer.scrml`. Its rebuild times over 16 file-change rebuilds:

543, 312, 792, 1045, 1773, 2361, 3344, 3226, 3892, 5849, 8156, 8804, 9782, 9801, 12035, 13903 ms

The file grew during that time, but a fresh one-shot `compile` of the final, larger file peaks at 542 MB RSS and takes a few seconds. So rebuilds in the long-lived process got about 25× slower while the input grew far less. That looks like state kept from one rebuild to the next (module cache, AST, or watcher closures).

Around the same time: 15 minutes after the last rebuild (11:39 → 11:54), systemd-oomd killed the terminal scope that held this process tree. The scope had 32 GB RAM and 43.7 GB swap in use. The dev server was the only long-lived compiler process in that tree, but it was not isolated, so this is circumstantial, not proven.

Repro: run `dev` on a large file, touch it 15–20 times, and log RSS and rebuild time after each rebuild.
