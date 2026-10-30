import { GlobalRegistrator } from "/home/bmacs/scrmlMaster/scrml/node_modules/@happy-dom/global-registrator/lib/index.js";
import { readFileSync } from "node:fs";
GlobalRegistrator.register();
const dir = process.argv[2];
const html = readFileSync(dir + "/index.html", "utf8");
const head = html.match(/<head>([\s\S]*)<\/head>/)?.[1] ?? "";
document.head.innerHTML = head.replace(/<script[\s\S]*?<\/script>/g, "");
const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? "";
document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, "");
await import(dir + "/program.client.js");
const show = () => console.log("BODY:", document.body.textContent.replace(/\s+/g, " ").trim());
show();
for (const sel of process.argv.slice(3)) { const b = [...document.querySelectorAll("button")].find(x => x.textContent === sel); b.click(); await new Promise(r => setTimeout(r, 10)); console.log("after click", sel); show(); }
