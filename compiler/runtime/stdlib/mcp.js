// scrml:mcp — runtime shim (the adopter-facing `scrml:mcp` surface).
//
// The surface is exactly what stdlib/mcp/index.scrml declares: startMcpServer and
// shutdownMcpServer. Every compiler-internal helper (install, loadSidecars, the tool
// resolvers, _resetForTests, …) lives in ./mcp/internal.js, which is not a `scrml:`
// module, so an adopter cannot import it (S478 open-Qs ruling (user-voice) item 62).
// The stdlib bundler copies ./mcp/internal.js beside this file (relative dependency).

import { startMcpServer as startInternal, shutdownMcpServer as shutdownInternal } from "./mcp/internal.js";

export async function startMcpServer(config) {
  return startInternal(config);
}

export async function shutdownMcpServer(handle) {
  return shutdownInternal(handle);
}
