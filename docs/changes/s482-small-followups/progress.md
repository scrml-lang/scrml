# s482-small-followups progress

Branch s482-small-followups from origin/main 31beb6d49; merged origin/main 79d837993 (#2071) at 4520cd225.

- A1 (#2069 LOW-1): rawGather in analyze.scrml mkRawNode — markup rows E-HTML-PARSER-REPAIR naming for/if; text-only INTERIM message names g-boot-rcdata-text-lift-s482. Tests in slice-m4/rcdata-holes-s482.test.js. (0e9a43833)
- A2 (#2069 LOW-2): g-boot-rawtext-parent-markup-rows-s478 resolved; g-boot-rcdata-text-lift-s482 filed (LOW, INTERIM). (76faf0bba)
- A3 (#2069 LOW-3): runtime.js textContent takes parts (string | thunk), each value its own guard; print.scrml textContentJs/textPartJs emit per-part thunks. happy-dom + Chromium tests. (1ead5d280)
- B1 (#2066 LOW-1): SPEC §49.2.4 `of` provenance — PA lane decision + open owner question; no S482 `of` ruling in user-voice.
- B2 (#2066 LOW-2): parse.scrml kwDeclAhead takes bindNameTok; parseLogicItem reads the keywordless item before the `server` modifier. g-boot-contextual-implicit-decl-s482 filed + resolved. slice-m4/contextual-implicit-decl-s482.test.js (16 red on base).
- C1/C2 (#2045 r6): meta.scrml idxOf/canonIndex (property-key semantics, "length", refuse others); recMember/isObjectProtoName + methodRead (list/string built-in method read without a call). meta-s481.test.js new describe (red on base). g-boot-meta-literal-index-key-s482 + g-boot-meta-proto-member-s482 filed + resolved.
- D (#2063 r1 INFO-3): struck the stale clause in g-spec-file-scope-init-vs-body-top-write-s481. The handler-reach half dropped: #2071 resolved g-boot-handler-reach-runs-binding-early-s482 on main.
- E (#2071 INFO-1): measured first — 0 of 2969 corpus files hold any non-acting file-scope initializer inside a construct (instrumented run, corpus-probe.json). Built: analyze.scrml constructReadDiags (a read of a `let` / cell body code writes counts as acting). SPEC §7.6 + §34 row. g-boot-nested-init-reads-body-write-s482 filed + resolved; s481 gap text corrected. slice-m4/construct-init-read-s482.test.js (3 red on base).
