// Ortho Ward Board — local runner.
// On Vercel the files in api/ run on their own; this file is only for running
// the same board on your own computer:   npm install   then   npm start
// It reads the same .env file (SHEET_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY).

const http = require("http");
const { exec } = require("child_process");

const index = require("./api/index.js");
const login = require("./api/login.js");
const sheet = require("./api/sheet/[tool].js");   // also loads .env via api/_lib.js

const PORT = Number(process.env.PORT) || 3000;

function readBody(req) {
  return new Promise(resolve => {
    let b = ""; req.on("data", c => { b += c; if (b.length > 2e6) req.destroy(); });
    req.on("end", () => resolve(b));
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const raw = await readBody(req);
  const type = req.headers["content-type"] || "";
  try {
    req.body = type.includes("json") ? JSON.parse(raw || "{}")
             : type.includes("urlencoded") ? Object.fromEntries(new URLSearchParams(raw))
             : raw;
  } catch { req.body = {}; }
  req.query = Object.fromEntries(url.searchParams);

  if (url.pathname === "/" || url.pathname === "/index.html") return index(req, res);
  if (url.pathname === "/login") return login(req, res);
  const m = url.pathname.match(/^\/api\/sheet\/([a-z_]+)$/);
  if (m) { req.query.tool = m[1]; return sheet(req, res); }
  res.statusCode = 404; res.end("Not found");
}).listen(PORT, () => {
  const local = "http://localhost:" + PORT;
  console.log("\n  Ortho Ward Board running at " + local);
  console.log("  Google Sheet: " + (process.env.SHEET_ID || "(SHEET_ID missing in .env)"));
  console.log("  Press Ctrl+C to stop.\n");
  if (!process.env.NO_OPEN) {
    const opener = process.platform === "win32" ? `start "" "${local}"` : process.platform === "darwin" ? `open "${local}"` : `xdg-open "${local}"`;
    exec(opener, () => {});
  }
});
