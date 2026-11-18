// channel-seen-harness.js — S479 (s479-channel-follow): a hand-written test socket as a conforming
// client would frame it. §38.4.2 "The frame": a client frame carries `__seen`, the last sequence number
// its sender had applied. The relay tests send hand-written frames through raw WebSockets; `withSeen`
// makes such a socket add `__seen` — the last `__seq` it has received (its replay's, then each relayed
// frame's) — to every `__sync` frame it sends that does not already carry one. The text is spliced, not
// re-serialized, so a frame a test writes on purpose (a duplicated key, a `-0`) reaches the relay as
// written. A frame that is not a JSON object text, or that names its own `__seen`, is sent unchanged.

export function withSeen(ws) {
  let seen = 0;
  ws.addEventListener("message", (ev) => {
    try {
      const v = JSON.parse(String(ev.data));
      if (v !== null && typeof v === "object" && Number.isSafeInteger(v.__seq) && v.__seq > seen) seen = v.__seq;
    } catch { /* not JSON: nothing to track */ }
  });
  const send = ws.send.bind(ws);
  ws.send = (text) => {
    if (typeof text === "string" && /^\s*\{/.test(text) && text.includes('"__sync"') && !text.includes('"__seen"') && /\}\s*$/.test(text)) {
      return send(text.replace(/\}\s*$/, `,"__seen":${seen}}`));
    }
    return send(text);
  };
  ws.seen = () => seen;
  return ws;
}
