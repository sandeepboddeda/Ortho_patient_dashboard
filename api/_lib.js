// Shared helpers for the Vercel functions.
const crypto = require("crypto");

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
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw Object.assign(new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set in Vercel"), { code: "tool_error" });
  let creds;
  try { creds = JSON.parse(raw); } catch { throw Object.assign(new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON"), { code: "tool_error" }); }
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
