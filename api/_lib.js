// Shared helpers for the Vercel functions.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Load .env from the project folder if it was deployed with the code.
// Values set in Vercel's dashboard take priority over the file.
(function loadDotEnv() {
  let text = "";
  for (const dir of [process.cwd(), path.join(__dirname, "..")]) {
    try { text = fs.readFileSync(path.join(dir, ".env"), "utf8"); break; } catch {}
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined || process.env[m[1]] === "") process.env[m[1]] = v;
  }
})();

const PASSWORD = process.env.BOARD_PASSWORD || "";
const SHEET_ID = process.env.SHEET_ID || "12by6Nuw2Sqjz0J8Mo7BA9pBbNkzdX_p_BRNAgbSPzXE";
const TOKEN = crypto.createHmac("sha256", "ortho-board:" + PASSWORD).update("session").digest("hex");

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map(c => c.trim().split("=")).filter(a => a[0]));
}
function loggedIn(req) { return !PASSWORD || cookies(req).obs === TOKEN; }

let client = null;
function sheetsClient() {
  if (client) return client;
  let creds;
  const email = process.env.GOOGLE_CLIENT_EMAIL, key = process.env.GOOGLE_PRIVATE_KEY;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (key && key.includes("PASTE-YOUR-KEY-HERE")) {
    throw Object.assign(new Error("GOOGLE_PRIVATE_KEY in .env still has the placeholder; paste the private_key from your service-account key file"), { code: "tool_error" });
  }
  if (email && key) {
    // .env style: two separate values; the key may have literal \n sequences
    creds = { type: "service_account", client_email: email.trim(), private_key: key.replace(/\\n/g, "\n") };
  } else if (raw) {
    try { creds = JSON.parse(raw); } catch { throw Object.assign(new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON"), { code: "tool_error" }); }
  } else {
    throw Object.assign(new Error("Google key not set: add GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in Vercel"), { code: "tool_error" });
  }
  if (creds.type !== "service_account") {
    throw Object.assign(new Error("The key must be a service-account key (it should contain \"type\": \"service_account\")"), { code: "tool_error" });
  }
  const { GoogleAuth } = require("google-auth-library");
  const { sheets } = require("@googleapis/sheets");
  const auth = new GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  client = sheets({ version: "v4", auth });
  return client;
}

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

module.exports = { PASSWORD, SHEET_ID, TOKEN, loggedIn, sheetsClient, LOGIN_PAGE };
