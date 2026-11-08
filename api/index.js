const fs = require("fs");
const path = require("path");
const { loggedIn, LOGIN_PAGE } = require("./_lib");

// Browser shim: gives the board the same Google Sheets calls it uses inside Claude,
// routed to this deployment's /api/sheet/* functions.
const SHIM = `<script>
(function(){
  const watchers = new Set();
  async function call(tool, args){
    let r;
    try { r = await fetch("/api/sheet/"+tool, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(args||{})}); }
    catch(_) { const e=new Error("Server unreachable"); e.code="server_unavailable"; throw e; }
    if(r.status===401){ location.href="/"; }
    const j = await r.json().catch(()=>({}));
    if(!r.ok){ const e=new Error(j.error||"Request failed"); e.code=j.code||"tool_error"; throw e; }
    return { payload:j };
  }
  async function runWatch(w){
    try { const res = await call(w.tool, w.args); w.handler({type:"data", result:res}); }
    catch(e){ w.handler({type:"error", error:{code:e.code, message:e.message}}); }
  }
  const mcp = {
    callTool:(server, tool, args)=>call(tool, args),
    watchTool(server, tool, args, handler){
      const w={tool, args, handler}; watchers.add(w); runWatch(w);
      w.timer=setInterval(()=>{ if(!document.hidden) runWatch(w); }, 20000);
      return ()=>{ clearInterval(w.timer); watchers.delete(w); };
    },
    invalidate: async ()=>{ watchers.forEach(runWatch); }
  };
  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) watchers.forEach(runWatch); });
  const user = { can: async()=>true, canEdit: async()=>true };
  window.claude = { use: async n => n==="mcp"?mcp : n==="user"?user : null };
})();
</script>`;

let html = null;
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (!loggedIn(req)) { res.statusCode = 200; return res.end(LOGIN_PAGE("")); }
  if (!html) html = fs.readFileSync(path.join(process.cwd(), "board", "index.html"), "utf8").replace("</head>", SHIM + "\n</head>");
  res.statusCode = 200;
  res.end(html);
};
