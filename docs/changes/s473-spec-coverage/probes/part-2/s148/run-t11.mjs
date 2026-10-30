const dir = process.argv[2];
const rt = await import(dir + "/scrml-server-runtime.js");
const m = await import(dir + "/program.server.js");
const s = m.createServer({ root: dir, log: (l) => console.log("LOG", l) });
const r = await s.fetch(new Request("http://x/_scrml/call/21", { method: "POST", headers: { Cookie: rt.CSRF_COOKIE + "=t", [rt.CSRF_HEADER]: "t", "content-type":"application/json" }, body: "[]" }));
console.log(r.status, await r.text());
