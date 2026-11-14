// s477-boot-dev-leak — generates a large bootstrap-compilable program: N replicas of a
// payload-enum / match / cell block (the shapes of acceptance/variants/construct-runs).
// usage: bun gen-big.ts <out.scrml> [N]
import { writeFileSync } from "fs";
const out = process.argv[2];
const n = Number(process.argv[3] ?? 60);
const server = process.argv.includes("--server");
const decls: string[] = [];
const body: string[] = [];
for (let i = 0; i < n; i++) {
  decls.push(`    type Shape${i}:enum = { Circle(r: int), Rect(w: int, h: int), Dot }
    let <sh${i}:Shape${i}=(Shape${i}.Rect(2, ${i + 1}))/>
    let <log${i}:string=""/>
    function area${i}(s: Shape${i}) -> int {
        return match s {
            .Circle(r) :> 3 * r * r,
            .Rect(w, h) :> w * h + ${i},
            .Dot :> 0
        };
    }
    function grow${i}(n: int) -> Shape${i} {
        if (n == 0) return Shape${i}.Dot;
        if (n == 1) return .Circle(3);
        return Shape${i}.Rect(n, n + 1);
    }
    function step${i}() {
        @sh${i} = grow${i}(3);
        const same: bool = Shape${i}.Rect(3, 4) == @sh${i};
        @log${i} = same ? "eq ok" : "eq bad";
    }`);
  if (server) decls.push(`    function save${i}(a: int)! E {
        ?{\`INSERT INTO log (a) VALUES (\${a + ${i}})\`}.run();
        return ${i};
    }`);
  body.push(`        <button id="b${i}" onclick=step${i}()>b${i}</button>
        <p id="area${i}">\${area${i}(@sh${i})}</p>
        <p id="log${i}">\${@log${i}}</p>`);
  if (server) body.push(`        <button id="s${i}" onclick={ @n = save${i}(1) !{ _ :> 99, }; }>s${i}</button>`);
}
const head = server
  ? `<program db="./app.db">\n    type E:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost, Transport(t: ServerCallError) }\n    let <n:int=0/>\n`
  : `<program>\n`;
writeFileSync(out, `${head}${decls.join("\n")}\n    <main>\n${body.join("\n")}\n    </main>\n</program>\n`);
