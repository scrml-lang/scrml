// R20_PINNED — the pinned class of every r20-shapes.js shape (S470 s470-host-fetch-followups; families
// s23 / f26 / l18 / t18). Spread into PINNED_CLASS (pinned-class.js). Regenerate from
// `classify.js --json <family>/` — never by hand-editing to make the suite pass. Every R1 / R2 / R3 shape
// was FAIL on fcaa8b84b; every VALID control PASS on both.
export const R20_PINNED = {
  "s23/R3 local alias of globalThis": "PASS",
  "s23/R3 alias chain of globalThis": "PASS",
  "s23/R3 alias assigned later": "PASS",
  "s23/VALID an alias of globalThis never used to fetch": "PASS",
  "f26/R3 handler local alias of window": "PASS-DENY",
  "f26/R3 handler local alias of globalThis": "PASS-DENY",
  "f26/R3 handler alias assigned later": "PASS-DENY",
  "f26/R3 render gate over a module alias of window": "PASS-REFUSED",
  "f26/R3 render gate over an alias of document.defaultView": "PASS-REFUSED",
  "f26/VALID an alias of window never used to fetch": "PASS",
  "f26/VALID handler reads an awaited status through an alias": "PASS",
  "l18/R2 globalThis.fetch": "PASS",
  "l18/R2 globalThis[\"fetch\"]": "PASS",
  "l18/R3 local alias of globalThis": "PASS",
  "l18/R3 alias chain of globalThis": "PASS",
  "l18/R3 alias assigned later": "PASS",
  "l18/VALID bare fetch, awaited": "PASS",
  "l18/VALID an alias of globalThis never used to fetch": "PASS",
  "t18/R1 bare fetch": "PASS",
  "t18/R1 globalThis.fetch": "PASS",
  "t18/R1 helper over fetch": "PASS",
  "t18/R2 globalThis[\"fetch\"]": "PASS",
  "t18/R3 local alias of globalThis": "PASS",
  "t18/R3 alias chain of globalThis": "PASS",
  "t18/R3 alias assigned later": "PASS",
  "t18/VALID an alias of globalThis never used to fetch": "PASS",
};
