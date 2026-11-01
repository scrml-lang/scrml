// foreign-content-fixtures.js — s474 lane boot-gate-await-mathml: the foreign-content (SVG / MathML)
// gate shapes shared by foreign-content-s474.test.js (printed shape) and
// foreign-content-chromium-s474.test.js (what Chromium renders). Each program has a cell `@pw`, two
// buttons (#wrong sets "wrong", #right sets "secret") and the shape inside `<div id="out">`; the
// gated text is "LOGGED IN" (an `else` arm's is "NOPE").

export const G = `if=(@pw == "secret")`;

export const FOREIGN = {
  m_mi: `<math><mi ${G}>LOGGED IN</mi></math>`,
  m_mrow: `<math><mrow ${G}><mi>LOGGED IN</mi></mrow></math>`,
  m_mtext: `<math><mrow><mtext ${G}>LOGGED IN</mtext></mrow></math>`,
  m_ifElse: `<math><mi ${G}>LOGGED IN</mi><mi else>NOPE</mi></math>`,
  m_textPoint: `<math><mi><b ${G}>LOGGED IN</b></mi></math>`,
  m_each: `<math><each in=@ws as w><mi>\${w}</mi></each></math>`,
  s_text: `<svg><text ${G}>LOGGED IN</text></svg>`,
  s_g: `<svg><g ${G}><text>LOGGED IN</text></g></svg>`,
  s_fo: `<svg><foreignObject ${G} width="200" height="50"><p>LOGGED IN</p></foreignObject></svg>`,
  s_foInner: `<svg><foreignObject width="200" height="50"><p ${G}>LOGGED IN</p></foreignObject></svg>`,
  s_ifElse: `<svg><text ${G}>LOGGED IN</text><text else>NOPE</text></svg>`,
  s_each: `<svg><each in=@ws as w><text>\${w}</text></each></svg>`,
  s_gather: `<svg>\${ for (w of @ws) { lift <text>\${w}</text>; } }</svg>`,
  // the gate ON the foreign root (its template is an HTML-context child) and `show=` (no template)
  m_math: `<math ${G}><mi>LOGGED IN</mi></math>`,
  s_svg: `<svg ${G}><text>LOGGED IN</text></svg>`,
  m_show: `<math><mi show=(@pw == "secret")>LOGGED IN</mi></math>`,
  s_show: `<svg><text show=(@pw == "secret")>LOGGED IN</text></svg>`,
};
// [top-level declarations, markup]
export const COMPONENTS = {
  c_svgUse: [`    <icon n:int/>\n    renders <g><text>LOGGED IN</text></g>`, `<svg><icon n=1 ${G}/></svg>`],
  c_svgUseMixed: [`    <icon n:int/>\n    renders <text>LOGGED IN</text>`, `<svg><icon n=1 ${G}/></svg><p><icon n=2/></p>`],
  c_svgInside: [`    <icon n:int/>\n    renders <svg><text ${G}>LOGGED IN</text></svg>`, `<icon n=1/>`],
  c_slotSvg: [`    <frame n:int/>\n    renders <svg><slot/></svg>`, `<frame n=1><text ${G}>LOGGED IN</text></frame>`],
  c_mathUse: [`    <ident n:int/>\n    renders <mi>LOGGED IN</mi>`, `<math><ident n=1 ${G}/></math>`],
};

export function gateProgram(markup, top = "") {
  return `<program>
    let <pw:string=""/>
    <ws:string[]=(["LOGGED IN"])/>
${top}
    <main>
        <button id="wrong" onclick={ @pw = "wrong"; }>go</button>
        <button id="right" onclick={ @pw = "secret"; }>go</button>
        <div id="out">${markup}</div>
    </main>
</program>
`;
}

