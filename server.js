// Ortho Ward Board — standalone server
//
//   node server.js
//
// Storage:
//   • Google Sheet mode  — if google-key.json (a service-account key) is next to this file,
//                          patients are read from and saved to your Google Sheet.
//   • Local mode         — otherwise, patients are saved in data/sheet.json on this computer.
//
// Settings live in config.json (environment variables override them):
//   port / PORT, password / BOARD_PASSWORD, sheetId / SHEET_ID, googleKeyFile / GOOGLE_KEY_FILE
//   On hosts like Hugging Face you can instead put the whole key JSON in GOOGLE_SERVICE_ACCOUNT_JSON.

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { exec } = require("child_process");

// ---------- settings ----------
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8")); } catch {}
const PORT = Number(process.env.PORT || cfg.port || 3000);
const PASSWORD = process.env.BOARD_PASSWORD ?? cfg.password ?? "";
const SHEET_ID = process.env.SHEET_ID || cfg.sheetId || "";
const KEY_FILE = path.resolve(__dirname, process.env.GOOGLE_KEY_FILE || cfg.googleKeyFile || "google-key.json");
const KEY_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || (fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, "utf8") : "");
const HTML_FILE = path.join(__dirname, "public", "index.html");

// ---------- storage backends (both speak the same three "sheet" operations) ----------
function makeGoogleBackend() {
  let google;
  try { ({ google } = require("googleapis")); }
  catch { throw new Error('Google mode needs the googleapis package. Run "npm install" in this folder first.'); }
  if (!SHEET_ID) throw new Error("Set sheetId in config.json");
  const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(KEY_JSON), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheets = google.sheets({ version: "v4", auth });
  return {
    name: "Google Sheet " + SHEET_ID,
    async get_values({ range }) {
      const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
      return { range: r.data.range, values: r.data.values || [] };
    },
    async update_values({ range, values }) {
      const r = await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range, valueInputOption: "RAW", requestBody: { values } });
      return { updatedRange: r.data.updatedRange, updatedRows: r.data.updatedRows, status: "success" };
    },
    async update_spreadsheet({ requests }) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
      return { status: "success" };
    },
  };
}

function makeLocalBackend() {
  const dir = path.join(__dirname, "data");
  const file = path.join(dir, "sheet.json");
  fs.mkdirSync(dir, { recursive: true });
  let grid = [];
  try { grid = JSON.parse(fs.readFileSync(file, "utf8")); } catch { grid = []; }
  const save = () => { fs.writeFileSync(file + ".tmp", JSON.stringify(grid)); fs.renameSync(file + ".tmp", file); };
  const colNum = s => s.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  function parse(range) { // "Patients!A5:Q5" -> {r0, c0}
    const m = /!?([A-Z]+)(\d+)?/.exec(range.split("!").pop());
    return { c0: m ? colNum(m[1]) : 0, r0: m && m[2] ? Number(m[2]) - 1 : 0 };
  }
  const trim = () => {
    grid = grid.map(r => { r = r.map(v => v ?? ""); while (r.length && r[r.length - 1] === "") r.pop(); return r; });
    while (grid.length && !grid[grid.length - 1].length) grid.pop();
  };
  return {
    name: "local file " + file,
    async get_values({ range }) { trim(); return { range, values: grid.map(r => r.slice()) }; },
    async update_values({ range, values }) {
      const { r0, c0 } = parse(range);
      values.forEach((row, i) => {
        while (grid.length <= r0 + i) grid.push([]);
        const target = grid[r0 + i];
        row.forEach((v, j) => { while (target.length < c0 + j) target.push(""); target[c0 + j] = v == null ? "" : String(v); });
      });
      trim(); save();
      return { updatedRange: range, updatedRows: values.length, status: "success" };
    },
    async update_spreadsheet({ requests }) {
      for (const rq of requests || []) {
        const d = rq.deleteDimension;
        if (d && d.range && d.range.dimension === "ROWS") grid.splice(d.range.startIndex, d.range.endIndex - d.range.startIndex);
      }
      trim(); save();
      return { status: "success" };
    },
  };
}

let backend, backendError = "";
try { backend = KEY_JSON ? makeGoogleBackend() : makeLocalBackend(); }
catch (e) { backendError = e.message; }

// ---------- live updates: tell open boards when something changed ----------
const clients = new Set();
function notify() { for (const res of clients) res.write("data: changed\n\n"); }

// ---------- login ----------
const TOKEN = crypto.createHmac("sha256", "ortho-board:" + PASSWORD).update("session").digest("hex");
const cookieOf = req => Object.fromEntries((req.headers.cookie || "").split(";").map(c => c.trim().split("=")).filter(a => a[0]));
const loggedIn = req => !PASSWORD || cookieOf(req).obs === TOKEN;
const LOGIN_PAGE = msg => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Ortho Ward Board</title>
<style>body{font-family:system-ui,sans-serif;background:#F3F6F7;color:#16232A;display:grid;place-items:center;min-height:100vh;margin:0}
form{background:#fff;border:1px solid #DCE3E6;border-radius:14px;padding:26px;width:min(340px,90vw)}
h1{font-size:20px;margin:0 0 16px}input{width:100%;box-sizing:border-box;padding:11px;border:1px solid #DCE3E6;border-radius:9px;font-size:16px}
button{margin-top:12px;width:100%;padding:11px;border:0;border-radius:9px;background:#0D6B6E;color:#fff;font-weight:600;font-size:15px}
p{color:#B42318;font-size:14px;margin:10px 0 0}</style></head><body>
<form method="post" action="/login"><h1>Ortho ward board</h1>
<input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password">
<button>Open board</button>${msg ? `<p>${msg}</p>` : ""}</form></body></html>`;

// ---------- browser shim: gives the page the same Google Sheets calls it uses inside Claude ----------
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
    watchTool(server, tool, args, handler, opts){
      const w={tool, args, handler}; watchers.add(w); runWatch(w);
      w.timer=setInterval(()=>runWatch(w), Math.max(10000,(opts&&opts.refetchInterval)||30000));
      return ()=>{ clearInterval(w.timer); watchers.delete(w); };
    },
    invalidate: async ()=>{ watchers.forEach(runWatch); }
  };
  try { const es=new EventSource("/api/events"); es.onmessage=()=>watchers.forEach(runWatch); } catch(_){}
  const user = { can: async()=>true, canEdit: async()=>true };
  window.claude = { use: async n => n==="mcp"?mcp : n==="user"?user : null };
})();
</script>`;

// ---------- helpers ----------
function send(res, code, body, type = "application/json", extra = {}) {
  res.writeHead(code, Object.assign({ "Content-Type": type, "Cache-Control": "no-store" }, extra));
  res.end(body);
}
function readBody(req, limit = 2e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new Error("Request too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// ---------- server ----------
const TOOLS = new Set(["get_values", "update_values", "update_spreadsheet"]);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/login" && req.method === "POST") {
    const form = new URLSearchParams(await readBody(req, 10000).catch(() => ""));
    if (PASSWORD && form.get("password") === PASSWORD) {
      const secure = (req.headers["x-forwarded-proto"] || "") === "https" ? " Secure;" : "";
      return send(res, 303, "", "text/plain", {
        "Set-Cookie": `obs=${TOKEN}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
        Location: "/",
      });
    }
    await new Promise(r => setTimeout(r, 1200)); // slows down password guessing
    return send(res, 401, LOGIN_PAGE("Wrong password"), "text/html; charset=utf-8");
  }

  if (!loggedIn(req)) {
    if (url.pathname.startsWith("/api/")) return send(res, 401, '{"error":"login"}');
    return send(res, 200, LOGIN_PAGE(""), "text/html; charset=utf-8");
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    let html;
    try { html = fs.readFileSync(HTML_FILE, "utf8"); } catch { return send(res, 500, "public/index.html is missing", "text/plain"); }
    return send(res, 200, html.replace("</head>", SHIM + "\n</head>"), "text/html; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.write(": hello\n\n");
    clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 20000);
    req.on("close", () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  const m = url.pathname.match(/^\/api\/sheet\/([a-z_]+)$/);
  if (m && req.method === "POST" && TOOLS.has(m[1])) {
    if (!backend) return send(res, 503, JSON.stringify({ error: backendError, code: "tool_error" }));
    try {
      const args = JSON.parse((await readBody(req)) || "{}");
      const out = await backend[m[1]](args);
      if (m[1] !== "get_values") notify();
      return send(res, 200, JSON.stringify(out));
    } catch (e) {
      const msg = (e && e.message) || "Failed";
      console.error(m[1], "failed:", msg);
      const code = /ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket/i.test(msg) ? "server_unavailable" : "tool_error";
      return send(res, code === "server_unavailable" ? 503 : 400, JSON.stringify({ error: msg, code }));
    }
  }

  send(res, 404, "Not found", "text/plain");
});

server.listen(PORT, "0.0.0.0", () => {
  const local = `http://localhost:${PORT}`;
  const lan = Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === "IPv4" && !i.internal).map(i => `http://${i.address}:${PORT}`);
  console.log("\n  Ortho Ward Board is running");
  console.log("  ───────────────────────────");
  console.log("  This computer:          " + local);
  lan.forEach(u => console.log("  Phone (same Wi-Fi):     " + u));
  console.log("  Patients stored in:     " + (backend ? backend.name : "NOT AVAILABLE — " + backendError));
  console.log("  Password:               " + (PASSWORD ? "on" : "OFF — set \"password\" in config.json"));
  console.log("\n  Keep this window open while you use the board. Press Ctrl+C to stop.\n");

  if (!process.env.SPACE_ID && !process.env.NO_OPEN) {
    const opener = process.platform === "win32" ? `start "" "${local}"`
                 : process.platform === "darwin" ? `open "${local}"` : `xdg-open "${local}"`;
    exec(opener, () => {});
  }
});
